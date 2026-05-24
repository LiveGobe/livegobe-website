/**
 * Configuration loader for LSP Server
 * Loads from .env file and .lsmcrc.json
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const defaults = {
  server: {
    port: 8081,
    host: 'localhost',
    workers: 1
  },
  wikiApi: {
    baseUrl: 'http://localhost:8080/api',
    version: 2,
    timeout: 5000,
    retryAttempts: 3,
    retryDelay: 1000,
    connectionPoolSize: 10
  },
  cache: {
    strategy: 'multi-level',
    modulesCacheTTL: 300000, // 5 minutes
    apiCacheTTL: 600000, // 10 minutes
    maxCacheSize: 104857600, // 100MB
    enableFsCache: false
  },
  analysis: {
    enableTypeInference: true,
    enableLinting: true,
    maxFileSize: 1048576, // 1MB
    parseTimeout: 5000
  },
  logging: {
    level: 'info',
    format: 'json',
    destination: './logs/lsp.log'
  },
  features: {
    completion: true,
    hover: true,
    definition: true,
    references: true,
    rename: true,
    diagnostics: true,
    formatting: false
  }
};

/**
 * Load configuration from environment variables and config files
 */
function loadConfig() {
  const config = JSON.parse(JSON.stringify(defaults));

  // Override with environment variables
  if (process.env.LSP_PORT) config.server.port = parseInt(process.env.LSP_PORT);
  if (process.env.LSP_HOST) config.server.host = process.env.LSP_HOST;
  if (process.env.LSP_WORKERS) config.server.workers = parseInt(process.env.LSP_WORKERS);

  if (process.env.WIKI_API_BASE) config.wikiApi.baseUrl = process.env.WIKI_API_BASE;
  if (process.env.WIKI_API_VERSION) config.wikiApi.version = process.env.WIKI_API_VERSION;
  if (process.env.WIKI_API_TIMEOUT) config.wikiApi.timeout = parseInt(process.env.WIKI_API_TIMEOUT);

  if (process.env.CACHE_STRATEGY) config.cache.strategy = process.env.CACHE_STRATEGY;
  if (process.env.CACHE_TTL_MODULES) config.cache.modulesCacheTTL = parseInt(process.env.CACHE_TTL_MODULES);
  if (process.env.CACHE_TTL_API) config.cache.apiCacheTTL = parseInt(process.env.CACHE_TTL_API);

  if (process.env.LOG_LEVEL) config.logging.level = process.env.LOG_LEVEL;
  if (process.env.LOG_FORMAT) config.logging.format = process.env.LOG_FORMAT;

  // Try loading from .lsmcrc.json
  const configPath = path.join(process.cwd(), '.lsmcrc.json');
  if (fs.existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      deepMerge(config, fileConfig);
    } catch (err) {
      console.error(`Failed to parse .lsmcrc.json: ${err.message}`);
    }
  }

  return config;
}

/**
 * Deep merge configuration objects
 */
function deepMerge(target, source) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {};
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}

module.exports = {
  loadConfig,
  defaults
};
