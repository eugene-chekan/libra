import { QueryClient } from '@tanstack/react-query'

/**
 * Builds the query client.
 *
 * A factory rather than a module-level singleton, because tests need a fresh
 * one per test — a shared cache leaks a resolved query from one test into the
 * next and makes failures depend on ordering.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /*
         * Off, deliberately, and this is the one setting here that is not a
         * default worth keeping.
         *
         * client-design.md specifies an error block with a "Try again" button.
         * An automatic retry racing that button is two mechanisms for one job:
         * the error blinks in and out and the reader cannot tell whether their
         * click did anything. Failure is reported once; retrying is the
         * reader's call.
         *
         * The Flutter client learned this the hard way — Riverpod 3 retries a
         * failed provider indefinitely with backoff, and milestone 4 had to
         * turn it off. TanStack Query retries three times by default. Same
         * bug, new library; see docs/specs/client-stack.md.
         */
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}
