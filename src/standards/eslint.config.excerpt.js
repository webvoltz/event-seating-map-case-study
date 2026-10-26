// Excerpt: eslint.config.js
// typescript-eslint strictTypeChecked + stylisticTypeChecked, React, hooks and
// jsx-a11y. Lint runs with --max-warnings=0: a warning fails the build.

export default defineConfig(
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      eslint.configs.recommended,
      react.configs.flat.recommended,
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended, // accessibility is a lint error, not a review comment
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error', // new status? every switch must handle it
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      // @ts-ignore is banned. @ts-expect-error is allowed only with a reason.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description', minimumDescriptionLength: 10 },
      ],
      // Numbers are fine in templates (coordinates, prices). Objects and null are not.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  prettier,
);
