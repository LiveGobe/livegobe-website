/**
 * Multi-level caching strategy for wiki modules and API responses
 * L1: In-memory LRU cache with TTL
 */

const NodeCache = require('node-cache');
const { getLogger } = require('../logging/logger');

let logger;

class CacheManager {
  constructor(config) {
    this.config = config;
    logger = getLogger();

    // Create cache with TTL settings
    this.cache = new NodeCache({
      stdTTL: config.cache.modulesCacheTTL / 1000, // Convert to seconds
      checkperiod: 600 // Check for expired keys every 10 minutes
    });

    // Track cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0
    };

    logger.info(
      {
        stdTTL: config.cache.modulesCacheTTL / 1000,
        maxSize: config.cache.maxCacheSize
      },
      'Cache manager initialized'
    );
  }

  /**
   * Get item from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const value = this.cache.get(key);
    
    if (value !== undefined) {
      this.stats.hits++;
      logger.debug({ key, hitRate: this._getHitRate() }, 'Cache hit');
      return value;
    }

    this.stats.misses++;
    logger.debug({ key, hitRate: this._getHitRate() }, 'Cache miss');
    return undefined;
  }

  /**
   * Set item in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Optional TTL in seconds (overrides default)
   */
  set(key, value, ttl) {
    try {
      if (ttl) {
        this.cache.set(key, value, ttl);
      } else {
        this.cache.set(key, value);
      }
      
      logger.debug({ key, ttl }, 'Item cached');
      
      // Check cache size
      this._checkCacheSize();
    } catch (err) {
      logger.error({ key, error: err.message }, 'Failed to cache item');
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} Whether key exists
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Delete item from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.del(key);
    logger.debug({ key }, 'Cache item deleted');
  }

  /**
   * Clear all cache
   */
  flush() {
    this.cache.flushAll();
    logger.info('Cache flushed');
  }

  /**
   * Get cache key for a wiki module
   * @param {string} wiki - Wiki name
   * @param {string} module - Module name
   * @param {string} type - Cache type ('module', 'data', etc.)
   * @returns {string} Cache key
   */
  static getModuleKey(wiki, module, type = 'module') {
    return `${type}:${wiki}:${module}`;
  }

  /**
   * Get cache statistics
   * @returns {Object} Stats object
   */
  getStats() {
    const keys = this.cache.keys();
    const hitRate = this._getHitRate();

    return {
      ...this.stats,
      hitRate,
      totalRequests: this.stats.hits + this.stats.misses,
      cachedItems: keys.length,
      cachedKeys: keys,
      memoryEstimate: this._estimateMemoryUsage()
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0
    };
    logger.info('Cache statistics reset');
  }

  /**
   * Private: Calculate hit rate
   */
  _getHitRate() {
    const total = this.stats.hits + this.stats.misses;
    return total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;
  }

  /**
   * Private: Estimate memory usage of cache
   */
  _estimateMemoryUsage() {
    const keys = this.cache.keys();
    let totalSize = 0;

    for (const key of keys) {
      const value = this.cache.get(key);
      if (typeof value === 'string') {
        totalSize += value.length * 2; // Rough estimate: 2 bytes per character
      } else if (typeof value === 'object') {
        totalSize += JSON.stringify(value).length * 2;
      }
    }

    return {
      bytes: totalSize,
      kb: (totalSize / 1024).toFixed(2),
      mb: (totalSize / 1024 / 1024).toFixed(2)
    };
  }

  /**
   * Private: Check if cache is exceeding size limits
   */
  _checkCacheSize() {
    const memory = this._estimateMemoryUsage();
    const limitBytes = this.config.cache.maxCacheSize;

    if (memory.bytes > limitBytes) {
      logger.warn(
        { used: memory.mb, limit: (limitBytes / 1024 / 1024).toFixed(2) },
        'Cache size exceeds limit, evicting oldest items'
      );
      
      // Clear 20% of oldest items
      const keys = this.cache.keys();
      const evictCount = Math.ceil(keys.length * 0.2);
      
      for (let i = 0; i < evictCount; i++) {
        this.cache.del(keys[i]);
        this.stats.evictions++;
      }
    }
  }
}

/**
 * Create a cache manager instance
 */
function createCacheManager(config) {
  return new CacheManager(config);
}

module.exports = {
  CacheManager,
  createCacheManager
};
