// eslint.config.cjs — ESLint v9 Flat Config cho CommonJS Cloud Functions
const js = require("@eslint/js"); [cite: 2]

/** @type {import("eslint").Linter.FlatConfig[]} */ [cite: 3]
module.exports = [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    ignores: ["node_modules/**", "lib/**", "dist/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script", // CommonJS
      globals: {
        module: "readonly",
        require: "readonly",
        exports: "readonly",
        process: "readonly"
      }
    },
    rules: {
      quotes: ["error", "double"],
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
    }
  }
];