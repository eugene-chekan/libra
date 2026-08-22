import { render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { SessionProvider, useSession, type SessionStatus } from './SessionProvider'

/** Renders the current status as text, so a test can assert on it directly. */
function StatusProbe() {
  const { status } = useSession()
  return <div data-testid="status">{describe_(status)}</div>
}

function describe_(status: SessionStatus): string {
  if (status.status === 'signed-in') return `signed-in:${status.user.username}`
  if (status.status === 'signed-out') return `signed-out:${status.reason ?? 'none'}`
  return 'starting'
}

function renderSession(api: FakeLibraApi, children = <StatusProbe />) {
  return render(
    <ApiProvider api={api}>
      <SessionProvider>{children}</SessionProvider>
    </ApiProvider>
  )
}

describe('SessionProvider', () => {
  it('starts in the starting state before the cold probe answers', () => {
    const api = new FakeLibraApi()
    renderSession(api)

    expect(screen.getByTestId('status')).toHaveTextContent('starting')
  })

  it('resolves to signed-in when the cold probe finds a live session', async () => {
    const user = fakeUser({ username: 'eugene' })
    const api = new FakeLibraApi({ users: [user], signedInAs: user })
    renderSession(api)

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in:eugene'))
  })

  it('resolves to signed-out with no reason when the cold probe finds nothing', async () => {
    // Nobody has signed in yet, or a stale/absent cookie. This is not an
    // expiry — there was no live session for it to expire from — so the
    // login screen must not blame it on one.
    const api = new FakeLibraApi()
    renderSession(api)

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out:none'))
  })

  it('signs in on login and carries the returned user', async () => {
    const user = fakeUser({ username: 'reader9' })
    const api = new FakeLibraApi({ users: [user] })

    function LoginProbe() {
      const { login } = useSession()
      useEffect(() => {
        void login('reader9', 'correct-horse')
      }, [login])
      return <StatusProbe />
    }

    renderSession(api, <LoginProbe />)

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in:reader9'))
  })

  it('clears the session on sign out, with no expiry reason', async () => {
    const user = fakeUser({ username: 'eugene' })
    const api = new FakeLibraApi({ users: [user], signedInAs: user })

    function SignOutProbe() {
      const { status, signOut } = useSession()
      useEffect(() => {
        if (status.status === 'signed-in') void signOut()
      }, [status, signOut])
      return <StatusProbe />
    }

    renderSession(api, <SignOutProbe />)

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out:none'))
  })

  it('ends a live session exactly once, even when two requests discover the expiry at the same time', async () => {
    // The spec's own words: "the test that matters is not 'a 401 redirects'
    // but 'a 401 during a background refresh ... redirects exactly once' — a
    // naive implementation fires one redirect per in-flight request." This
    // fires the same 401 notification twice, synchronously, to simulate two
    // requests that were in flight when the session died, and counts how many
    // times the status actually transitions into the expired state.
    const user = fakeUser({ username: 'eugene' })
    const api = new FakeLibraApi({ users: [user], signedInAs: user })
    let expiredTransitions = 0

    function ExpiryProbe() {
      const { status } = useSession()
      useEffect(() => {
        if (status.status === 'signed-out' && status.reason === 'expired') expiredTransitions++
      }, [status])
      return <StatusProbe />
    }

    renderSession(api, <ExpiryProbe />)
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'))

    // The server has revoked the session. Two requests that were already in
    // flight both discover this at the same time.
    api.signedInId = null
    await Promise.allSettled([api.me(), api.me()])

    // Wait on the counter itself, not the DOM text: the counter increments in
    // a passive effect, which can lag one tick behind the text `waitFor`
    // would otherwise settle for as soon as the commit updates it.
    await waitFor(() => expect(expiredTransitions).toBe(1))
    expect(screen.getByTestId('status')).toHaveTextContent('signed-out:expired')
  })

  it('does not treat a 401 from the cold probe or a rejected login as an expiry', async () => {
    // Both are 401s and both fire `onUnauthorized`, per the interface's own
    // contract. Neither should read as "your session expired" — one never had
    // a session, the other never had one either.
    const user = fakeUser({ username: 'eugene' })
    const api = new FakeLibraApi({ users: [user] })
    renderSession(api)

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out:none'))

    await expect(api.login('eugene', 'wrong-password')).rejects.toThrow()
    expect(screen.getByTestId('status')).toHaveTextContent('signed-out:none')
  })

  it('throws when used outside a SessionProvider', () => {
    function Lonely() {
      useSession()
      return null
    }
    expect(() => render(<Lonely />)).toThrow(/useSession must be used inside/)
  })
})
