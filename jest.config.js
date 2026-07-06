/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['./jest.setup.ts'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
    '**/*.test.ts',
    '**/*.test.tsx',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/android/',
    '/ios/',
    '/.expo/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // expo-file-system and expo-file-system/legacy both map to our manual mock.
    // The legacy sub-path export provides documentDirectory + string I/O.
    // The base path is also mapped to ensure the __mocks__ file is used in tests
    // (jest-expo preset may not auto-detect the __mocks__ directory for packages).
    '^expo-file-system$': '<rootDir>/__mocks__/expo-file-system.js',
    '^expo-file-system/legacy$': '<rootDir>/__mocks__/expo-file-system.js',
    '^expo-sharing$': '<rootDir>/__mocks__/expo-sharing.js',
    // Stage-06 additions: expo-clipboard and expo-localization manual mocks.
    // Both packages require native modules unavailable in the Jest/Node environment.
    '^expo-clipboard$': '<rootDir>/__mocks__/expo-clipboard.js',
    '^expo-localization$': '<rootDir>/__mocks__/expo-localization.js',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
  ],
};
