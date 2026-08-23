import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeBook, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { DetailCover } from './DetailCover'

function renderCover(book = fakeBook({ has_cover: true, title: 'Dune' })) {
  const user = fakeUser()
  const api = new FakeLibraApi({ users: [user], signedInAs: user, books: [book] })
  return render(
    <ApiProvider api={api}>
      <DetailCover book={book} />
    </ApiProvider>
  )
}

describe('DetailCover', () => {
  it('opens the cover in a lightbox, and closes again', async () => {
    const user = userEvent.setup()
    renderCover()

    await user.click(screen.getByRole('button', { name: 'Enlarge cover' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Cover of Dune' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape, so the lightbox never traps a keyboard', async () => {
    const user = userEvent.setup()
    renderCover()

    await user.click(screen.getByRole('button', { name: 'Enlarge cover' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers nothing to enlarge when the book has no cover art', () => {
    // The gradient stands in for a cover; it has no detail to show, so a
    // click would promise something the enlarged view cannot deliver.
    renderCover(fakeBook({ has_cover: false, title: 'Plain' }))

    expect(screen.queryByRole('button', { name: 'Enlarge cover' })).not.toBeInTheDocument()
  })

  it('stops offering to enlarge when the promised image does not load', () => {
    // `has_cover` is what the catalog believed when it was read. A file can
    // change underneath it, and then the gradient is what is on screen.
    renderCover(fakeBook({ has_cover: true, title: 'Vanished' }))

    fireEvent.error(screen.getByRole('img', { name: 'Vanished' }))

    expect(screen.queryByRole('button', { name: 'Enlarge cover' })).not.toBeInTheDocument()
  })
})
