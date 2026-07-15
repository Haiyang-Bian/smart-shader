// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      // TODO: gradually replace `any` with proper types.
      // Currently downgraded to warn so existing files can be linted;
      // new code must not introduce additional `any` usages.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Catch clause variables (e.g. `catch (e)`) are kept concise in this codebase.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }]
    }
  }
  // Your custom configs here
)
