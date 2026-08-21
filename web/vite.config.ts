import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],

  // Absolute, and it has to be. Routing is on real paths, so the app is also
  // served at `/books/5` — and a relative base would resolve its own script
  // tag against `/books/`, asking for `/books/assets/index-<hash>.js` and
  // getting a 404. The page would load and then render nothing.
  base: '/',

  server: {
    // `npm run dev` serves the client on its own port, which makes the browser
    // treat it as a different origin from the API. Proxying `/api` keeps them
    // looking like one origin, so the session cookie is sent and no CORS
    // preflight happens at all — worth more than it sounds, because a blocked
    // preflight reaches the client as a plain network failure and looks
    // exactly like a backend that is not running.
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Playwright drives a real browser and owns everything in e2e/. Vitest
    // picking those files up would run them with no browser and fail.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    // Component tests assert on classes from CSS modules, which are `undefined`
    // unless the CSS is actually processed.
    css: true,
  },
})
