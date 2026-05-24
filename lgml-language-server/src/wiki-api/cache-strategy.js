/**
 * Cache strategy for Wiki API responses
 * Implements multi-level caching with TTL and conditional requests
 */

const { createWikiApiClient } = require('./client');
const { createCacheManager } = require('../modules/cache');
const { handleApiError, isRetryableError, getRetryDelay } = require('./error-handling');
const { getLogger } = require('../logging/logger');

let logger;

class WikiApiCacheStrategy {
  constructor(config) {
    this.config = config;
    logger = getLogger();

    // Initialize components
    this.apiClient = createWikiApiClient(config);
    this.cacheManager = createCacheManager(config);

    logger.info('Wiki API cache strategy initialized');
  }

  /**
   * Fetch module with caching
   * @param {string} wiki - Wiki name
   * @param {string} moduleName - Module name
   * @returns {Promise<string>} Module content
   */
  async fetchModule(wiki, moduleName) {
    const cacheKey = this.cacheManager.constructor.getModuleKey(wiki, moduleName, 'module');

    // Check L1 cache first
    // const cached = this.cacheManager.get(cacheKey);
    // if (cached !== undefined) {
    //   logger.debug({ wiki, moduleName }, 'Module served from cache');
    //   return cached;
    // }

    // Fetch from API
    try {
      const content = await this.apiClient.fetchModule(wiki, moduleName);
      
      if (content !== null) {
        // Cache successful response
        this.cacheManager.set(cacheKey, content);
      }

      return content;

    } catch (error) {
      const apiError = handleApiError(error);
      
      // For non-retryable errors, cache empty result briefly to avoid repeated failures
      if (!isRetryableError(apiError)) {
        this.cacheManager.set(cacheKey, null, 60); // Cache for 1 minute
      }

      throw apiError;
    }
  }

  /**
   * Fetch data module with caching
   * @param {string} wiki - Wiki name
   * @param {string} dataModuleName - Data module name
   * @returns {Promise<Object>} Parsed JSON data
   */
  async fetchDataModule(wiki, dataModuleName) {
    const cacheKey = this.cacheManager.constructor.getModuleKey(wiki, dataModuleName, 'data');

    // Check L1 cache first
    // const cached = this.cacheManager.get(cacheKey);
    // if (cached !== undefined) {
    //   logger.debug({ wiki, dataModuleName }, 'Data module served from cache');
    //   return cached;
    // }

    // Fetch from API
    try {
      const data = await this.apiClient.fetchDataModule(wiki, dataModuleName);
      
      if (data !== null) {
        // Cache successful response
        this.cacheManager.set(cacheKey, data);
      }

      return data;

    } catch (error) {
      const apiError = handleApiError(error);
      
      // For non-retryable errors, cache empty object briefly
      if (!isRetryableError(apiError)) {
        this.cacheManager.set(cacheKey, {}, 60); // Cache for 1 minute
      }

      throw apiError;
    }
  }

  /**
   * Check if page exists with caching
   * @param {string} wiki - Wiki name
   * @param {string} page - Page name
   * @returns {Promise<boolean>} Whether page exists
   */
  async pageExists(wiki, page) {
    const cacheKey = `exists:${wiki}:${page}`;

    // Check cache first
    // const cached = this.cacheManager.get(cacheKey);
    // if (cached !== undefined) {
    //   return cached;
    // }

    // Check with API
    try {
      const exists = await this.apiClient.pageExists(wiki, page);
      
      // Cache result for longer (5 minutes)
      this.cacheManager.set(cacheKey, exists, 300);

      return exists;

    } catch (error) {
      const apiError = handleApiError(error);
      
      // For 404, cache false result
      if (apiError.type === 'NOT_FOUND') {
        this.cacheManager.set(cacheKey, false, 300);
        return false;
      }

      throw apiError;
    }
  }

  /**
   * Search with caching
   * @param {string} wiki - Wiki name
   * @param {string} query - Search query
   * @returns {Promise<Array>} Search results
   */
  async search(wiki, query) {
    const cacheKey = `search:${wiki}:${query}`;

    // Check cache first (search results can be cached briefly)
    // const cached = this.cacheManager.get(cacheKey);
    // if (cached !== undefined) {
    //   return cached;
    // }

    // Search via API
    try {
      const results = await this.apiClient.search(wiki, query);
      
      // Cache search results for 2 minutes
      this.cacheManager.set(cacheKey, results, 120);

      return results;

    } catch (error) {
      const apiError = handleApiError(error);
      throw apiError;
    }
  }

  /**
   * Invalidate cache for a specific module
   * @param {string} wiki - Wiki name
   * @param {string} moduleName - Module name
   * @param {string} type - Module type ('module' or 'data')
   */
  invalidateModule(wiki, moduleName, type = 'module') {
    const cacheKey = this.cacheManager.constructor.getModuleKey(wiki, moduleName, type);
    this.cacheManager.delete(cacheKey);
    logger.info({ wiki, moduleName, type }, 'Module cache invalidated');
  }

  /**
   * Invalidate all cache for a wiki
   * @param {string} wiki - Wiki name
   */
  invalidateWiki(wiki) {
    const keys = this.cacheManager.getStats().cachedKeys;
    const wikiKeys = keys.filter(key => key.includes(`:${wiki}:`));
    
    wikiKeys.forEach(key => this.cacheManager.delete(key));
    
    logger.info({ wiki, invalidated: wikiKeys.length }, 'Wiki cache invalidated');
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this.cacheManager.flush();
    this.apiClient.clearCache();
    logger.info('All caches cleared');
  }

  /**
   * Get comprehensive cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      cacheManager: this.cacheManager.getStats(),
      apiClient: this.apiClient.getCacheStats()
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats() {
    this.cacheManager.resetStats();
  }

  /**
   * Health check for cache strategy
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      // Test basic API connectivity
      await this.apiClient.pageExists('test', 'test');
      
      return {
        status: 'healthy',
        cache: this.getCacheStats(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        cache: this.getCacheStats(),
        timestamp: new Date().toISOString()
      };
    }
  }
}

/**
 * Create a Wiki API cache strategy instance
 */
function createWikiApiCacheStrategy(config) {
  return new WikiApiCacheStrategy(config);
}

module.exports = {
  WikiApiCacheStrategy,
  createWikiApiCacheStrategy
};
