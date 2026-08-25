import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import type { Note, NoteDraft } from '../api/types'

/** Notes and highlights for one book. */

/** `GET /api/books/{id}/notes`. */
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

/** `DELETE /api/notes/{id}`. */
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
