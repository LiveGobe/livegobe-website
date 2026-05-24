/**
 * Module resolver for LGML/LGWL modules
 * Handles require() and requireData() calls
 */

const { createWikiApiCacheStrategy } = require('../wiki-api/cache-strategy');
const { getLogger } = require('../logging/logger');

let logger;

class ModuleResolver {
  constructor(config) {
    this.config = config;
    logger = getLogger();

    // Initialize cache strategy
    this.cacheStrategy = createWikiApiCacheStrategy(config);

    // Module resolution cache (different from content cache)
    this.resolutionCache = new Map();

    logger.info('Module resolver initialized');
  }

  /**
   * Resolve a module reference
   * @param {string} wiki - Wiki name
   * @param {string} moduleRef - Module reference (e.g., "Module:Items" or "Items")
   * @param {string} type - Module type ('module' or 'data')
   * @param {Object} workspace - Optional workspace for cache isolation
   * @returns {Promise<Object>} Resolution result
   */
  async resolveModule(wiki, moduleRef, type = 'module', workspace) {
    const cacheKey = `${type}:${wiki}:${moduleRef}`;

    // Use workspace cache if provided, otherwise global cache
    const cache = workspace ? type === 'module' ? workspace.getModuleCache() : workspace.getDataCache() : this.resolutionCache;

    // Check cache first
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    try {
      let moduleName = moduleRef;
      let exists = false;
      let content = null;

      // Normalize module name
      if (type === 'module') {
        moduleName = this._normalizeModuleName(moduleRef);
        content = await this.cacheStrategy.fetchModule(wiki, moduleName);
        exists = content !== null;
      } else if (type === 'data') {
        moduleName = this._normalizeDataModuleName(moduleRef);
        content = await this.cacheStrategy.fetchDataModule(wiki, moduleName);
        exists = content !== null;
      }

      const result = {
        wiki,
        moduleName,
        type,
        exists,
        content,
        resolvedAt: new Date().toISOString()
      };

      // Cache resolution result
      cache.set(cacheKey, result);

      logger.debug({ wiki, moduleName, type, exists }, 'Module resolved');
      return result;

    } catch (error) {
      logger.error(
        { wiki, moduleRef, type, error: error.message },
        'Module resolution failed'
      );

      const errorResult = {
        wiki,
        moduleName: moduleRef,
        type,
        exists: false,
        content: null,
        error: error.message,
        resolvedAt: new Date().toISOString()
      };

      // Cache error result briefly
      cache.set(cacheKey, errorResult);
      return errorResult;
    }
  }

  /**
   * Resolve multiple modules in batch
   * @param {string} wiki - Wiki name
   * @param {Array} moduleRefs - Array of { ref, type } objects
   * @param {Object} workspace - Optional workspace for cache isolation
   * @returns {Promise<Array>} Array of resolution results
   */
  async resolveModulesBatch(wiki, moduleRefs, workspace) {
    const promises = moduleRefs.map(({ ref, type }) =>
      this.resolveModule(wiki, ref, type, workspace)  // Pass workspace for cache isolation
    );

    try {
      const results = await Promise.allSettled(promises);
      
      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          const { ref, type } = moduleRefs[index];
          logger.error(
            { wiki, ref, type, error: result.reason.message },
            'Batch module resolution failed'
          );
          
          return {
            wiki,
            moduleName: ref,
            type,
            exists: false,
            content: null,
            error: result.reason.message,
            resolvedAt: new Date().toISOString()
          };
        }
      });
    } catch (error) {
      logger.error({ wiki, error: error.message }, 'Batch resolution failed');
      throw error;
    }
  }

  /**
   * Check if a module exists
   * @param {string} wiki - Wiki name
   * @param {string} moduleRef - Module reference
   * @param {string} type - Module type
   * @returns {Promise<boolean>} Whether module exists
   */
  async moduleExists(wiki, moduleRef, type = 'module') {
    try {
      const result = await this.resolveModule(wiki, moduleRef, type);
      return result.exists;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get module dependencies
   * Analyzes module content to find require() and requireData() calls
   * @param {string} wiki - Wiki name
   * @param {string} moduleName - Module name
   * @returns {Promise<Array>} Array of dependency references
   */
  async getModuleDependencies(wiki, moduleName) {
    try {
      const result = await this.resolveModule(wiki, moduleName, 'module');
      
      if (!result.exists || !result.content) {
        return [];
      }

      const dependencies = this._extractDependencies(result.content);
      
      logger.debug(
        { wiki, moduleName, dependencies: dependencies.length },
        'Dependencies extracted'
      );

      return dependencies;

    } catch (error) {
      logger.error(
        { wiki, moduleName, error: error.message },
        'Failed to get module dependencies'
      );
      return [];
    }
  }

  /**
   * Invalidate module resolution cache
   * @param {string} wiki - Wiki name
   * @param {string} moduleName - Module name
   * @param {string} type - Module type
   */
  invalidateResolution(wiki, moduleName, type = 'module') {
    const cacheKey = `${type}:${wiki}:${moduleName}`;
    this.resolutionCache.delete(cacheKey);
    
    // Also invalidate content cache
    this.cacheStrategy.invalidateModule(wiki, moduleName, type);
    
    logger.info({ wiki, moduleName, type }, 'Module resolution invalidated');
  }

  /**
   * Clear all resolution caches
   */
  clearResolutionCache() {
    this.resolutionCache.clear();
    logger.info('Resolution cache cleared');
  }

  /**
   * Get resolution statistics
   * @returns {Object} Stats
   */
  getResolutionStats() {
    return {
      cachedResolutions: this.resolutionCache.size,
      cacheStrategyStats: this.cacheStrategy.getCacheStats()
    };
  }

  /**
   * Private: Normalize module name
   * @param {string} moduleRef - Module reference
   * @returns {string} Normalized module name
   */
  _normalizeModuleName(moduleRef) {
    // Remove Module: prefix if present
    if (moduleRef.startsWith('Module:')) {
      return moduleRef.substring(7);
    }
    return moduleRef;
  }

  /**
   * Private: Normalize data module name
   * @param {string} moduleRef - Data module reference
   * @returns {string} Normalized data module name
   */
  _normalizeDataModuleName(moduleRef) {
    // Remove Module: prefix if present
    let name = this._normalizeModuleName(moduleRef);
    
    // Remove .json extension if present
    if (name.endsWith('.json')) {
      name = name.substring(0, name.length - 5);
    }
    
    return name;
  }

  /**
   * Private: Extract dependencies from module content
   * @param {string} content - Module content
   * @returns {Array} Array of dependency objects
   */
  _extractDependencies(content) {
    const dependencies = [];
    
    // Regex for require() calls
    const requireRegex = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match;
    
    while ((match = requireRegex.exec(content)) !== null) {
      dependencies.push({
        ref: match[1],
        type: 'module',
        position: match.index
      });
    }

    // Regex for requireData() calls
    const requireDataRegex = /requireData\s*\(\s*["']([^"']+)["']\s*\)/g;
    
    while ((match = requireDataRegex.exec(content)) !== null) {
      dependencies.push({
        ref: match[1],
        type: 'data',
        position: match.index
      });
    }

    // Also check for requireData with variable references
    const requireDataVarRegex = /requireData\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)/g;
    
    while ((match = requireDataVarRegex.exec(content)) !== null) {
      // For variable references, we can't resolve statically
      // This would need runtime analysis
      dependencies.push({
        ref: match[1],
        type: 'data-variable',
        position: match.index
      });
    }

    return dependencies;
  }
}

/**
 * Create a module resolver instance
 */
function createModuleResolver(config) {
  return new ModuleResolver(config);
}

module.exports = {
  ModuleResolver,
  createModuleResolver
};
