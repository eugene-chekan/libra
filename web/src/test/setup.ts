import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Explicit rather than relying on React Testing Library's auto-cleanup, which
// only registers itself when it can find a global `afterEach`. Leftover DOM
// between tests is the kind of failure that depends on file ordering, and
// those are miserable to chase down.
afterEach(cleanup)
