import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Note, NoteDraft } from '../api/types'

/**
 * Notes and highlights for one book.
 *
 * Their own query key rather than a field on the book: notes are read and
 * written far more often than the catalog row, and a note added should not
 * make the screen refetch the cover, the tags and the reading state as well.
 *
 * Nothing here invalidates the library grid or the shelves, which is the
 * difference from {@link useBook}'s writes. A note changes nothing anybody
 * else can see, and nothing this reader can see anywhere else either.
 */

/** `GET /api/books/{id}/notes`. The caller's own notes, newest first. */
export function useNotes(bookId: number): UseQueryResult<Note[]> {
  const api = useApi()
  return useQuery({
    queryKey: ['notes', bookId],
    queryFn: () => api.listNotes(bookId),
  })
}

/** `POST /api/books/{id}/notes`. */
export function useCreateNote(bookId: number): UseMutationResult<Note, Error, NoteDraft> {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: NoteDraft) => api.createNote(bookId, draft),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notes', bookId] })
    },
  })
}

/** `DELETE /api/notes/{id}`. Takes the note's own id, not the book's. */
export function useDeleteNote(bookId: number): UseMutationResult<void, Error, number> {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (noteId: number) => api.deleteNote(noteId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notes', bookId] })
    },
  })
}
