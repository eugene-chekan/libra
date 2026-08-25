import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'

import './theme/tokens.css'
import './theme/fonts.css'
import './theme/base.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('No #root element — index.html is not the one that was built.')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
