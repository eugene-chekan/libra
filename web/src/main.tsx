import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'

// Order matters: tokens define the custom properties the other two read.
import './theme/tokens.css'
import './theme/fonts.css'
import './theme/base.css'

const container = document.getElementById('root')
if (!container) {
  // index.html ships the div; if it is missing the build is broken, and a
  // blank page with a clear message beats a blank page with none.
  throw new Error('No #root element — index.html is not the one that was built.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
