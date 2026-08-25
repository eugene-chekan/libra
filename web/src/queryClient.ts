import { QueryClient } from '@tanstack/react-query'

/** Builds the query client. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Off: an automatic retry racing the visible "Try again" button is
        // two mechanisms for one job.
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}
