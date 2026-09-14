import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import { fakeShelf, fakeTag, fakeUser, FakeLibraApi } from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { SessionProvider } from '../session/SessionProvider'
import { AddBookModal } from './AddBookModal'

function renderModal({
  admin = false,
  ...apiOptions
}: { admin?: boolean } & ConstructorParameters<typeof FakeLibraApi>[0] = {}) {
  const user = fakeUser({ id: 1, username: 'reader1', is_admin: admin })
  const api = new FakeLibraApi({ users: [user], signedInAs: user, ...apiOptions })
  const onClose = vi.fn()
  render(
    <MemoryRouter initialEntries={['/library']}>
      <ApiProvider api={api}>
        <QueryClientProvider client={createQueryClient()}>
          <SessionProvider>
            <AddBookModal onClose={onClose} />
          </SessionProvider>
        </QueryClientProvider>
      </ApiProvider>
    </MemoryRouter>
  )
  return { api, onClose }
}

function epubFile(name = 'dune.epub') {
  return new File(['epub bytes'], name, { type: 'application/epub+zip' })
}

describe('AddBookModal, drop step', () => {
  it('offers a file picker that only takes an EPUB', () => {
    renderModal()

    const input = screen.getByLabelText(/drag an epub here/i)
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', '.epub')
  })

  it('shows the drag-over prompt only while a file is over the zone', () => {
    renderModal()
    const input = screen.getByLabelText(/drag an epub here/i)

    fireEvent.dragOver(input)
    expect(screen.getByText('Drop it here')).toBeInTheDocument()

    fireEvent.dragLeave(input)
    expect(screen.queryByText('Drop it here')).not.toBeInTheDocument()
  })

  it('closes without uploading anything on Cancel', async () => {
    const user = userEvent.setup()
    const { api, onClose } = renderModal()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
    expect(api.calls).not.toContain('uploadBook')
  })

  it('shows a busy state while the upload is in flight', async () => {
    const user = userEvent.setup()
    const { api } = renderModal()
    let resolveUpload: (value: Awaited<ReturnType<typeof api.uploadBook>>) => void = () => {}
    vi.spyOn(api, 'uploadBook').mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve
      })
    )

    await user.upload(screen.getByLabelText(/drag an epub here/i), epubFile())

    expect(await screen.findByText('Uploading…')).toBeInTheDocument()
    resolveUpload({
      id: 9,
      title: 'Dune',
      author: 'Frank Herbert',
      format: 'epub',
      year: null,
      blurb: null,
      pages: null,
      has_cover: false,
      cover_version: null,
      tag_ids: [],
      shelf_id: null,
      rating: 0,
      progress: 0,
      position: null,
      last_sent_at: null,
    })
    await screen.findByLabelText('Title')
  })

  it('shows the server refusal and leaves the drop zone in place', async () => {
    // Dropped, not picked: `accept=".epub"` only filters the native file
    // dialog, so a non-EPUB can still arrive by drag-and-drop, and that path
    // is what actually exercises the server's refusal rather than the
    // browser's own filtering.
    renderModal()
    const input = screen.getByLabelText(/drag an epub here/i)

    fireEvent.drop(input, { dataTransfer: { files: [new File(['x'], 'notes.pdf')] } })

    expect(
      await screen.findByText('Only .epub files are supported in this phase')
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/drag an epub here/i)).toBeInTheDocument()
  })

  it('shows the configured failure for an oversized or malformed upload', async () => {
    const user = userEvent.setup()
    renderModal({ uploadFailure: { status: 413, detail: 'That file is too large' } })

    await user.upload(screen.getByLabelText(/drag an epub here/i), epubFile())

    expect(await screen.findByText('That file is too large')).toBeInTheDocument()
  })
})

describe('AddBookModal, confirm step', () => {
  async function uploadAndConfirm(
    options: { admin?: boolean } & ConstructorParameters<typeof FakeLibraApi>[0] = {}
  ) {
    const user = userEvent.setup()
    const result = renderModal(options)
    await user.upload(screen.getByLabelText(/drag an epub here/i), epubFile('dune.epub'))
    await screen.findByLabelText('Title')
    return { user, ...result }
  }

  it('arrives filled in with what the upload parsed', async () => {
    await uploadAndConfirm({
      uploadMetadata: { title: 'Dune', author: 'Frank Herbert', year: 1965 },
    })

    expect(screen.getByLabelText('Title')).toHaveValue('Dune')
    expect(screen.getByLabelText('Author')).toHaveValue('Frank Herbert')
    expect(screen.getByLabelText('Year')).toHaveValue('1965')
  })

  it('saves a field an admin changed when Done is clicked, and then closes', async () => {
    const { user, api, onClose } = await uploadAndConfirm({
      admin: true,
      uploadMetadata: { title: 'The Secret History', year: null },
    })

    await user.type(screen.getByLabelText('Year'), '1839')
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(api.books[0]?.year).toBe(1839))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('stays open and says why when a changed field fails the check', async () => {
    const { user, api, onClose } = await uploadAndConfirm({ admin: true })

    await user.type(screen.getByLabelText('Year'), '19x5')
    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The year has to be a number.')
    expect(onClose).not.toHaveBeenCalled()
    expect(api.calls.some((call) => call.startsWith('updateBook'))).toBe(false)
  })

  it('stays open and shows the refusal when the server does not save the change', async () => {
    const { user, api, onClose } = await uploadAndConfirm({ admin: true })
    api.books.splice(0)

    await user.type(screen.getByLabelText('Year'), '1839')
    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('disables Done while the change is saving, so a second click cannot save twice', async () => {
    const { user, api } = await uploadAndConfirm({ admin: true })
    vi.spyOn(api, 'updateBook').mockReturnValue(new Promise(() => {}))

    await user.type(screen.getByLabelText('Year'), '1839')
    await user.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled())
  })

  it('shows the parsed fields read-only for a reader who is not an admin', async () => {
    await uploadAndConfirm({ admin: false })

    expect(screen.getByLabelText('Title')).toBeDisabled()
  })

  it('puts the freshly uploaded book on a shelf', async () => {
    const shelf = fakeShelf({ id: 3, name: 'To Read', owner_id: 1, editable: true })
    const { user, api } = await uploadAndConfirm({ shelves: [shelf] })

    await user.click(screen.getByRole('button', { name: /Move to Shelf/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'To Read' }))

    await waitFor(() => expect(api.books[0]?.shelf_id).toBe(3))
  })

  it('adds a tag to the freshly uploaded book', async () => {
    const tag = fakeTag({ id: 8, name: 'sci-fi', owner_id: 1, is_global: false, editable: true })
    const { user, api } = await uploadAndConfirm({ tags: [tag] })

    await user.click(screen.getByRole('button', { name: 'Add Tag' }))
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /sci-fi/ }))

    await waitFor(() => expect(api.books[0]?.tag_ids).toEqual([8]))
  })

  it('closes on Done without saving when nothing was changed', async () => {
    const { user, api, onClose } = await uploadAndConfirm({ admin: true })

    await user.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(api.calls.some((call) => call.startsWith('updateBook'))).toBe(false)
  })
})
