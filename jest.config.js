module.exports = {
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testMatch: [
    "**/__tests__/**/*.js",
    "**/?(*.)+(spec|test).js"
  ],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/templates/**",
    "!**/node_modules/**"
  ],
  setupFilesAfterEnv: [],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/test-.*-project/"
  ]
};
