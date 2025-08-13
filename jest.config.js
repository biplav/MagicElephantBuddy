
export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/client/src/$1',
  },
  testMatch: [
    '<rootDir>/test/**/*.test.{ts,tsx}',
  ],
  collectCoverageFrom: [
    'client/src/hooks/**/*.{ts,tsx}',
    '!client/src/hooks/**/*.d.ts',
    '!client/src/hooks/**/index.{ts,tsx}',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  coverageDirectory: 'coverage',
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
  ],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  }
};
