import { fixupConfigRules } from "@eslint/compat";
import compat from "@eslint/eslint-plugin";

export default [
  ...fixupConfigRules(compat.extends('@mmctech-artifactory/polaris-base')),

  // ── Global rules (all files) ─────────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      // Override deprecated TypeScript ESLint rules that have been removed or renamed
      '@typescript-eslint/lines-between-class-members': 'off',
      'lines-between-class-members': ['error', 'always'],
      '@typescript-eslint/no-throw-literal': 'off',
      'no-throw-literal': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/ban-types': 'off',
      'jsdoc/require-jsdoc': [
        'warn',
        {
          require: {
            MethodDefinition: true,
          },
        },
      ],
    },
  },

  // ── Backend overrides ─────────────────────────────────────────
  // These files use @ts-nocheck and dynamic patterns that conflict
  // with strict corporate lint rules. Relax selectively here.
  {
    files: [
      'backend/src/**/*.ts',
      'src/server.ts',
      'src/claimsCalculator.ts',
      'src/hmoFormulas.ts',
      'src/dataParser.ts',
      'src/databricksConnector.ts',
      'src/mongoConnector.ts',
      'src/syncCache.ts',
      'src/precompute.ts',
      'src/debugCalc.ts',
      'src/aiAnalyzer.ts',
    ],
    rules: {
      // JSDoc not required in backend utility files
      'jsdoc/require-jsdoc': 'off',

      // @ts-nocheck files use dynamic patterns -- any is expected
      '@typescript-eslint/no-explicit-any': 'off',

      // Backend uses require() -- CJS modules
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',

      // Dynamic key access patterns (KEY_MAP, row[key], etc.)
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // Mongoose Mixed types trigger this
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',

      // process.exit() is valid in CLI scripts (sync, precompute, debug)
      'no-process-exit': 'off',

      // console.log is intentional in backend scripts
      'no-console': 'off',

      // Backend files use compact single-line patterns intentionally
      'lines-between-class-members': 'off',
      '@typescript-eslint/lines-between-class-members': 'off',

      // throw strings used in some connectors
      'no-throw-literal': 'off',
      '@typescript-eslint/no-throw-literal': 'off',

      // Unused vars in @ts-nocheck files
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-unused-vars': 'off',
    },
  },

  // ── Test / debug script overrides ────────────────────────────
  {
    files: [
      'src/debugCalc.ts',
      'src/precompute.ts',
      'src/syncCache.ts',
    ],
    rules: {
      // These are CLI one-shot scripts -- relax all style rules
      'jsdoc/require-jsdoc':              'off',
      'no-console':                        'off',
      'no-process-exit':                   'off',
      '@typescript-eslint/no-explicit-any':'off',
    },
  },

  // ── Frontend utility overrides ────────────────────────────────
  {
    files: [
      'src/utils/**/*.ts',
      'src/services/**/*.ts',
      'src/models/**/*.ts',
    ],
    rules: {
      // Utility files don't need JSDoc on every function
      'jsdoc/require-jsdoc': 'off',
    },
  },
];
