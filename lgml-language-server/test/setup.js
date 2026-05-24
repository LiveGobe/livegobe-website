/**
 * Jest test setup
 */

// Disable console output during tests unless explicitly needed
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn((err) => {
    // Uncomment to see errors during test runs
    // console.log(err);
  }),
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.WIKI_API_BASE = 'http://localhost:8080/api';
process.env.WIKI_API_VERSION = 2;
process.env.CACHE_TTL_MODULES = 60000;
process.env.CACHE_TTL_API = 120000;
