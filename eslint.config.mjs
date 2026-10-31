import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      '**/.next/',
      'apps/api/src/generated/',
      // Generated from openapi.json; regenerated, never edited by hand.
      'apps/web/src/lib/api/schema.d.ts',
      // Copied in by the shadcn/ui CLI.
      'apps/web/src/components/ui/',
      'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  // Type-aware rules: catch floating promises, unsafe `any` flows, etc. using the TS compiler.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: {
        projectService: { allowDefaultProject: ['*.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // The web app runs in the browser and uses React and Next.js.
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // This rule looks for a legacy pages/ directory; the app uses the App Router.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    // Tests use jest mocks heavily; these rules add noise there without catching real bugs.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  // Must stay last: turns off rules that conflict with Prettier formatting.
  prettier,
);
