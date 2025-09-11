import typescriptEslint from "@typescript-eslint/eslint-plugin";
import react from "eslint-plugin-react";
import jsxA11Y from "eslint-plugin-jsx-a11y";
import unusedImports from "eslint-plugin-unused-imports";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
    ...compat.extends("next/core-web-vitals"),
    {
        files: ["**/*.{ts,tsx,js,jsx}"],

        plugins: {
            "@typescript-eslint": typescriptEslint,
            react,
            "jsx-a11y": jsxA11Y,
            "unused-imports": unusedImports
        },

        languageOptions: {
            parser: tsParser,
            globals: {
                // Node.js globals
                process: 'readonly',
                global: 'readonly',
                Buffer: 'readonly',
            }
        },

        rules: {
            // TypeScript rules
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    vars: "all",
                    varsIgnorePattern: "^_",
                    args: "after-used",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
            "@typescript-eslint/no-explicit-any": "warn",

            // Import cleanup
            "unused-imports/no-unused-imports": "error",
            "no-unused-vars": "off",

            // React / Next.js rules
            "@next/next/no-html-link-for-pages": "warn",
            "react-hooks/exhaustive-deps": "warn",
            "react/no-unescaped-entities": "off",

            // Accessibility
            "jsx-a11y/alt-text": "warn",

            // General JS rules
            "prefer-const": "error",
            "no-console": ["error", { allow: ["warn", "error", "info", "debug", "trace"] }],
            "no-extra-boolean-cast": "error",
            "no-invalid-this": "error",
            "no-lonely-if": "error",
            "no-useless-constructor": "error",
            "no-var": "error",
            "no-undef": "warn",
            "prefer-arrow-callback": "error",
            "prefer-const": ["warn", { destructuring: "all"}],
            "curly": ["error", "all"],
            "jsx-a11y/anchor-is-valid": "error",
            "jsx-a11y/anchor-has-content": "error",
        },
    },
    // Specific configuration for test files
    {
        files: ["**/*.test.{ts,tsx,js,jsx}", "**/__tests__/**/*.{ts,tsx,js,jsx}"],
        
        languageOptions: {
            parser: tsParser,
            globals: {
                // Jest globals
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeAll: 'readonly',
                beforeEach: 'readonly',
                afterAll: 'readonly',
                afterEach: 'readonly',
                jest: 'readonly',
                // Node.js globals
                process: 'readonly',
                global: 'readonly',
                Buffer: 'readonly',
            }
        },

        rules: {
            // Relax some rules for test files
            "@typescript-eslint/no-explicit-any": "off",
            "no-undef": "off", // Turn off since we're defining Jest globals above
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    vars: "all",
                    varsIgnorePattern: "^_",
                    args: "after-used",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
        },
    },
];
