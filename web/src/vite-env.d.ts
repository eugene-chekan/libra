/// <reference types="vite/client" />

// Brings in Vite's ambient declarations, which is what gives `*.module.css`
// imports a type. Without it `tsc --noEmit` cannot resolve a single stylesheet
// import and the typecheck fails on every component in the app.
