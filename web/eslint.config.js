import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      // `configs.flat` rather than `configs['recommended-latest']`: the
      // top-level configs are still eslintrc-shaped, with `plugins` as an
      // array of strings, and flat config rejects them outright.
      reactHooks.configs.flat['recommended-latest'],
      // The reason this whole lint setup exists: a clickable `<div>` gives
      // no keyboard or screen-reader support for free, and these rules fail
      // the build on that instead of relying on a reviewer to catch it. See
      // docs/specs/code-style.md.
      jsxA11y.flatConfigs.strict,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // A token that escaped its file is the defect this guards, but no lint
      // rule sees colours. What it can see is an unused import or a promise
      // nobody waited for, so those are errors rather than warnings.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  }
)
