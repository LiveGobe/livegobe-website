/**
 * Wiki API HTTP Client
 * Handles fetching modules, data modules, and other wiki content
 */

const axios = require('axios');
const { getLogger } = require('../logging/logger');
const http = require('http');
const https = require('https');

let logger;

class WikiApiClient {
  constructor(config) {
    this.baseUrl = config.wikiApi.baseUrl;
    this.version = config.wikiApi.version || 2;
    this.timeout = config.wikiApi.timeout || 5000;
    this.retryAttempts = config.wikiApi.retryAttempts || 3;
    this.retryDelay = config.wikiApi.retryDelay || 1000;
    this.connectionPoolSize = config.wikiApi.connectionPoolSize || 10;

    logger = getLogger();

    // Create axios instance with config
    this.client = axios.create({
      baseURL: `${this.baseUrl}/v${this.version}`,
      timeout: this.timeout,
      httpAgent: http.Agent({
        keepAlive: true,
        maxSockets: this.connectionPoolSize
      }),
      httpsAgent: https.Agent({
        keepAlive: true,
        maxSockets: this.connectionPoolSize
      })
    });

    // ETag cache for conditional requests
    this.etagCache = new Map();

    logger.info({ baseUrl: this.baseUrl, version: this.version, timeout: this.timeout }, 'Wiki API client initialized');
  }

  /**
   * Fetch a wiki page (module, data module, etc.)
   * @param {string} wiki - Wiki name
   * @param {string} page - Page name (can include namespace like "Module:Items")
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Page content
   */
  async fetchPage(wiki, page, options = {}) {
    const endpoint = `/wikis/${encodeURIComponent(wiki)}/pages/${page}`;

    try {
      const response = await this._requestWithRetry(
        'get',
        endpoint,
        options
      );

      if (!response.data || !response.data.page) {
        logger.warn(
          { wiki, page, status: response.status },
          'Invalid response format from wiki API'
        );
        return null;
      }

      // Cache ETag if present
      if (response.headers.etag) {
        this.etagCache.set(endpoint, response.headers.etag);
      }

      logger.debug({ wiki, page }, 'Page fetched successfully');
      return response.data.page;

    } catch (error) {
      if (error.response?.status === 404) {
        logger.debug({ wiki, page }, 'Page not found');
        return null;
      }

      if (error.code === 'ECONNABORTED') {
        logger.warn({ wiki, page }, 'Request timed out');
        return null;
      }

      logger.error(
        { wiki, page, error: error.message, status: error.response?.status },
        'Failed to fetch page'
      );

      throw error;
    }
  }

  /**
   * Fetch module content
   * @param {string} wiki - Wiki name
   * @param {string} moduleName - Module name (without "Module:" prefix)
   * @returns {Promise<string>} Module content
   */
  async fetchModule(wiki, moduleName) {
    const pageTitle = moduleName.startsWith('Module:')
      ? moduleName
      : `Module:${moduleName}`;

    try {
      const page = await this.fetchPage(wiki, pageTitle);

      if (!page) {
        logger.warn({ wiki, moduleName }, 'Module not found');
        return null;
      }

      return page.content || '';

    } catch (error) {
      logger.error({ wiki, moduleName }, 'Failed to fetch module');
      throw error;
    }
  }

  /**
   * Fetch data module content
   * Data modules are stored as JSON in the Module: namespace
   * @param {string} wiki - Wiki name
   * @param {string} dataModuleName - Data module name (without "Module:" or ".json" prefix)
   * @returns {Promise<Object>} Parsed JSON data
   */
  async fetchDataModule(wiki, dataModuleName) {
    const pageTitle = dataModuleName.startsWith('Module:')
      ? dataModuleName
      : `Module:${dataModuleName}`;

    try {
      const page = await this.fetchPage(wiki, pageTitle);

      if (!page) {
        logger.warn({ wiki, dataModuleName }, 'Data module not found');
        return null;
      }

      const content = page.content || '{}';

      try {
        return content;
      } catch (parseErr) {
        logger.warn(
          { wiki, dataModuleName, error: parseErr.message },
          'Failed to parse data module JSON'
        );
        return {};
      }

    } catch (error) {
      logger.error({ wiki, dataModuleName }, 'Failed to fetch data module');
      throw error;
    }
  }

  /**
   * Check if a page exists
   * @param {string} wiki - Wiki name
   * @param {string} page - Page name
   * @returns {Promise<boolean>} Whether page exists
   */
  async pageExists(wiki, page) {
    try {
      const response = await this.fetchPage(wiki, page);
      return response !== null;
    } catch (error) {
      if (error.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Search pages in wiki
   * @param {string} wiki - Wiki name
   * @param {string} query - Search query
   * @returns {Promise<Array>} Search results
   */
  async search(wiki, query) {
    const endpoint = `/wiki/${encodeURIComponent(wiki)}/search`;

    try {
      const response = await this._requestWithRetry(
        'get',
        endpoint,
        { params: { search: query } }
      );

      if (!response.data || !Array.isArray(response.data.results)) {
        logger.warn({ wiki, query }, 'Invalid search response format');
        return [];
      }

      return response.data.results;

    } catch (error) {
      logger.error({ wiki, query, error: error.message }, 'Search failed');
      throw error;
    }
  }

  /**
   * Internal method: HTTP request with retry logic and exponential backoff
   * @private
   */
  async _requestWithRetry(method, url, options = {}) {
    let lastError;

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        // Add ETag header if we have a cached one (for conditional requests)
        const endpoint = url;
        // if (method === 'get' && this.etagCache.has(endpoint)) {
        //   if (!options.headers) options.headers = {};
        //   options.headers['If-None-Match'] = this.etagCache.get(endpoint);
        // }

        const response = await this.client.request({
          method,
          url,
          ...options
        });

        logger.debug(
          { method, url, status: response.status, attempt },
          'Request successful'
        );

        return response;

      } catch (error) {
        lastError = error;

        // Don't retry on 4xx errors (except 429 - rate limited)
        if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
          logger.warn(
            { method, url, status: error.response?.status },
            'Request failed with client error (no retry)'
          );
          throw error;
        }

        // Calculate backoff delay
        const delay = this.retryDelay * Math.pow(2, attempt);

        logger.warn(
          { method, url, attempt, delay, error: error.message },
          `Request failed, retrying in ${delay}ms`
        );

        // Wait before retrying
        await this._sleep(delay);
      }
    }

    logger.error(
      { method, url, attempts: this.retryAttempts, error: lastError?.message },
      'Request failed after all retries'
    );

    throw lastError;
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      etags: this.etagCache.size,
      etagCacheSize: Array.from(this.etagCache.keys()).join(', ')
    };
  }

  /**
   * Clear ETag cache
   */
  clearCache() {
    this.etagCache.clear();
    logger.info('ETag cache cleared');
  }
}

/**
 * Create a Wiki API client instance
 */
function createWikiApiClient(config) {
  return new WikiApiClient(config);
}

module.exports = {
  WikiApiClient,
  createWikiApiClient
};
