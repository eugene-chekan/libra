import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { ApiError } from '../api/errors'
import { fakeBook, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { BookEditForm } from './BookEditForm'

// The nested `CoverSection` reaches the API and the query client, so the form
// now needs both providers even though its own fields still do not.
function renderForm(overrides: Partial<Parameters<typeof BookEditForm>[0]> = {}) {
  const props = {
    book: fakeBook({ title: 'Dune', author: 'Frank Herbert', year: 1965, pages: 412 }),
    onSave: vi.fn().mockResolvedValue(undefined),
    onDone: vi.fn(),
    ...overrides,
  }
  const admin = fakeUser({ id: 1, is_admin: true })
  const api = new FakeLibraApi({ users: [admin], signedInAs: admin, books: [props.book] })
  render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <BookEditForm {...props} />
      </QueryClientProvider>
    </ApiProvider>
  )
  return { ...props, api }
}

describe('BookEditForm', () => {
  it('arrives filled in with what the catalog already says', () => {
    renderForm()

    expect(screen.getByLabelText('Title')).toHaveValue('Dune')
    expect(screen.getByLabelText('Author')).toHaveValue('Frank Herbert')
    expect(screen.getByLabelText('Year')).toHaveValue('1965')
    expect(screen.getByLabelText('Pages')).toHaveValue('412')
  })

  it('writes every field at once on Save, then leaves edit mode', async () => {
    const user = userEvent.setup()
    const { onSave, onDone } = renderForm()

    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Dune (1965)')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith({
      title: 'Dune (1965)',
      author: 'Frank Herbert',
      year: 1965,
      pages: 412,
      blurb: null,
    })
    expect(onDone).toHaveBeenCalled()
  })

  it('writes nothing on Cancel', async () => {
    const user = userEvent.setup()
    const { onSave, onDone } = renderForm()

    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Something else')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })

  it('clears a value whose box was emptied', async () => {
    // The boxes arrive filled in, so emptying one is deliberate, not a
    // no-change default.
    const user = userEvent.setup()
    const { onSave } = renderForm()

    await user.clear(screen.getByLabelText('Year'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ year: null }))
  })

  it('refuses to send an empty title, rather than turning it into a server error', async () => {
    const user = userEvent.setup()
    const { onSave } = renderForm()

    await user.clear(screen.getByLabelText('Title'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A book needs a title.')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses a page count the server would reject anyway', async () => {
    const user = userEvent.setup()
    const { onSave } = renderForm()

    await user.clear(screen.getByLabelText('Pages'))
    await user.type(screen.getByLabelText('Pages'), '0')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('1 or more')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('refuses a year that is not a number, rather than saving part of one', async () => {
    const user = userEvent.setup()
    const { onSave } = renderForm()

    await user.clear(screen.getByLabelText('Year'))
    await user.type(screen.getByLabelText('Year'), '19x5')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('has to be a number')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('takes a cover link on Enter in the field, and does not submit the form', async () => {
    // Pressing Enter after pasting a URL is a habit. The link field is inside
    // this form, so an unguarded Enter would submit it and lose the link.
    const user = userEvent.setup()
    const { onSave, onDone, api, book } = renderForm()

    await user.type(screen.getByLabelText(/paste a link/i), 'https://example.com/c.jpg{Enter}')

    await waitFor(() => expect(api.calls).toContain(`setCoverFromUrl:${book.id}`))
    expect(onSave).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('stays open and reports the reason when the server refuses', async () => {
    // An admin can be demoted while this form is open. The server is the
    // authority; the visible button was only ever a courtesy.
    const user = userEvent.setup()
    const onSave = vi.fn().mockRejectedValue(new ApiError(403, 'Admin only'))
    const { onDone } = renderForm({ onSave })

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You are not allowed to do that.')
    expect(onDone).not.toHaveBeenCalled()
  })
})
