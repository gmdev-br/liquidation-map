export default [
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        document: "readonly",
        window: "readonly",
        console: "readonly",
        localStorage: "readonly",
        Chart: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        // Browser globals
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        performance: "readonly",
        Worker: "readonly",
        self: "readonly",
        DOMParser: "readonly",
        URL: "readonly",
        // Project-specific globals (state functions that may not be imported in all files)
        saveSettings: "readonly",
        updateHeaderWidths: "readonly",
        renderColumnDropdown: "readonly",
        getBubbleScale: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "no-undef": "error"
    }
  }
];
