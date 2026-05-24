/**
 * Workspace class - represents a workspace bound to editor instances
 * Each workspace manages state for one or more documents opened in the same editor
 */

const { v4: uuidv4 } = require('uuid');

class Workspace {
  /**
   * Create a new workspace
   * @param {string} workspaceId - Unique workspace identifier
   * @param {string} editorUri - The editor/document URI that triggered workspace creation
   * @param {Object} logger - Logger instance
   */
  constructor(workspaceId, editorUri, logger) {
    this.id = workspaceId;
    this.editorUri = editorUri;
    this.logger = logger;
    this.createdAt = new Date();
    this.lastActivityTime = Date.now(); // Track for idle cleanup
    this.documents = new Set(); // Track documents in this workspace
    this.state = {}; // Custom workspace state
    
    // === WORKSPACE-SCOPED CACHES ===
    // Module cache: Map<moduleName -> compiledCode>
    // Scoped to this workspace only - prevents cache sharing between users/editors
    this.moduleCache = new Map();
    
    // Data cache: Map<dataModuleName -> parsedJSON>
    // Scoped to this workspace only
    this.dataCache = new Map();
    
    this.metadata = {
      editorCount: 1,
      documentCount: 0,
      cacheStats: {
        modulesCached: 0,
        dataCached: 0,
        totalCacheSize: 0
      }
    };

    this.logger.info(
      { workspaceId: this.id, editorUri },
      'Workspace created with isolated caches'
    );
  }

  /**
   * Add a document to this workspace
   */
  addDocument(uri) {
    if (!this.documents.has(uri)) {
      this.documents.add(uri);
      this.metadata.documentCount = this.documents.size;
      this.logger.debug(
        { workspaceId: this.id, documentUri: uri },
        'Document added to workspace'
      );
      return true;
    }
    return false;
  }

  /**
   * Remove a document from this workspace
   */
  removeDocument(uri) {
    if (this.documents.has(uri)) {
      this.documents.delete(uri);
      this.metadata.documentCount = this.documents.size;
      this.logger.debug(
        { workspaceId: this.id, documentUri: uri },
        'Document removed from workspace'
      );
      return true;
    }
    return false;
  }

  /**
   * Check if workspace is empty (no documents)
   */
  isEmpty() {
    return this.documents.size === 0;
  }

  /**
   * Get all documents in this workspace
   */
  getDocuments() {
    return Array.from(this.documents);
  }

  /**
   * Set workspace state
   */
  setState(key, value) {
    this.state[key] = value;
  }

  /**
   * Get workspace state
   */
  getState(key) {
    return this.state[key];
  }

  /**
   * Get workspace metadata
   */
  getMetadata() {
    return {
      ...this.metadata,
      createdAt: this.createdAt,
      uptime: Date.now() - this.createdAt.getTime()
    };
  }

  /**
   * Cleanup workspace resources
   */
  async cleanup() {
    this.logger.info(
      { workspaceId: this.id },
      'Workspace cleanup started'
    );
    
    // Clear all caches
    this.moduleCache.clear();
    this.dataCache.clear();
    this.documents.clear();
    this.state = {};
    
    this.logger.info(
      { workspaceId: this.id, cacheStats: this.metadata.cacheStats },
      'Workspace cleanup completed'
    );
  }

  /**
   * Get workspace-scoped module cache
   */
  getModuleCache() {
    return this.moduleCache;
  }

  /**
   * Get workspace-scoped data cache
   */
  getDataCache() {
    return this.dataCache;
  }

  /**
   * Update cache statistics
   */
  updateCacheStats(moduleCount, dataCount, totalSize) {
    this.metadata.cacheStats.modulesCached = moduleCount;
    this.metadata.cacheStats.dataCached = dataCount;
    this.metadata.cacheStats.totalCacheSize = totalSize;
  }
}

module.exports = Workspace;
