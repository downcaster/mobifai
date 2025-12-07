module.exports = {
  root: true,
  extends: ['@react-native', 'plugin:react-hooks/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['react', 'react-hooks', '@typescript-eslint'],
  rules: {
    // Core hooks rules - THESE ARE THE KEY RULES FROM TLDV
    'react-hooks/rules-of-hooks': 'error', // Checks rules of Hooks (no early returns before hooks, etc.)
    'react-hooks/exhaustive-deps': 'error', // Checks effect dependencies (ensures all deps are in array)

    // TypeScript - no any types allowed
    '@typescript-eslint/no-explicit-any': 'error',

    // General React rules
    'react/prop-types': 'off', // We use TypeScript for prop validation
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+
  },
};
