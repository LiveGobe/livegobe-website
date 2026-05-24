/**
 * WorkspaceManager - manages workspace lifecycle tied to editor instances
 * Creates a workspace when first document is opened, removes when last document closes
 */

const Workspace = require('./workspace');

class WorkspaceManager {
  constructor(logger) {
    this.logger = logger;
    this.workspaces = new Map(); // Map of workspaceId -> Workspace
    this.documentToWorkspace = new Map(); // Map of documentUri -> workspaceId
    this.editorToWorkspace = new Map(); // Map of editorUri -> workspaceId
    
    // Idle cleanup configuration
    this.idleTimeoutMs = 15 * 60 * 1000; // 15 minutes
    this.idleCheckIntervalMs = 60 * 1000; // Check every 1 minute
    this.idleCheckInterval = null;

    this.logger.info('WorkspaceManager initialized');
    
    // Start idle cleanup timer
    this._startIdleCleanup();
  }

  /**
   * Create or get workspace for an editor instance
   * Called when a document is opened in a web editor
   * 
   * @param {string} documentUri - Document URI being opened
   * @param {string} editorId - Unique identifier for the editor instance
   *                             Should be passed by the client (e.g., user session ID, editor UUID)
   */
  createWorkspaceForEditor(documentUri, editorId) {
    // If no editor ID provided, try to extract from document or use fallback
    if (!editorId) {
      editorId = this._getEditorId(documentUri);
    }
    
    // Check if workspace already exists for this editor
    if (this.editorToWorkspace.has(editorId)) {
      const workspaceId = this.editorToWorkspace.get(editorId);
      const workspace = this.workspaces.get(workspaceId);
      
      if (workspace) {
        workspace.addDocument(documentUri);
        this.documentToWorkspace.set(documentUri, workspaceId);
        this.logger.info(
          { workspaceId, editorId, documentUri },
          'Document added to existing workspace'
        );
        return workspace;
      }
    }

    // Create new workspace for this editor
    const workspaceId = this._generateWorkspaceId(editorId);
    const workspace = new Workspace(workspaceId, editorId, this.logger);
    
    workspace.addDocument(documentUri);
    this.workspaces.set(workspaceId, workspace);
    this.editorToWorkspace.set(editorId, workspaceId);
    this.documentToWorkspace.set(documentUri, workspaceId);

    this.logger.info(
      { workspaceId, editorId, documentUri },
      'New workspace created for editor'
    );

    return workspace;
  }

  /**
   * Close workspace when document is closed
   * Removes workspace entirely if it becomes empty
   * Note: Workspace cleanup is asynchronous but non-blocking
   */
  closeDocumentWorkspace(documentUri) {
    const workspaceId = this.documentToWorkspace.get(documentUri);
    
    if (!workspaceId) {
      this.logger.warn(
        { documentUri },
        'Closing document not associated with any workspace'
      );
      return Promise.resolve();
    }

    const workspace = this.workspaces.get(workspaceId);
    
    if (!workspace) {
      this.logger.warn(
        { workspaceId, documentUri },
        'Workspace not found when closing document'
      );
      this.documentToWorkspace.delete(documentUri);
      return Promise.resolve();
    }

    workspace.removeDocument(documentUri);
    this.documentToWorkspace.delete(documentUri);

    // If workspace is now empty, remove it entirely
    if (workspace.isEmpty()) {
      return this._removeWorkspace(workspaceId);
    }
    
    return Promise.resolve();
  }

  /**
   * Get workspace for a document
   */
  getWorkspaceForDocument(documentUri) {
    const workspaceId = this.documentToWorkspace.get(documentUri);
    return workspaceId ? this.workspaces.get(workspaceId) : null;
  }

  /**
   * Get workspace by ID
   */
  getWorkspace(workspaceId) {
    return this.workspaces.get(workspaceId);
  }

  /**
   * Get all active workspaces
   */
  getAllWorkspaces() {
    return Array.from(this.workspaces.values());
  }

  /**
   * Get workspace statistics
   */
  getStatistics() {
    const workspaceStats = Array.from(this.workspaces.values()).map(ws => ({
      id: ws.id,
      documentCount: ws.metadata.documentCount,
      createdAt: ws.createdAt,
      uptime: Date.now() - ws.createdAt.getTime()
    }));

    return {
      totalWorkspaces: this.workspaces.size,
      totalDocuments: this.documentToWorkspace.size,
      workspaces: workspaceStats
    };
  }

  /**
   * Remove workspace and cleanup resources
   */
  async _removeWorkspace(workspaceId) {
    const workspace = this.workspaces.get(workspaceId);
    
    if (!workspace) {
      return;
    }

    // Find the editor URI for this workspace
    const editorUri = Array.from(this.editorToWorkspace.entries())
      .find(([editor, wsId]) => wsId === workspaceId)?.[0];

    if (editorUri) {
      this.editorToWorkspace.delete(editorUri);
    }

    // Cleanup workspace resources
    await workspace.cleanup();
    this.workspaces.delete(workspaceId);

    this.logger.info(
      { workspaceId },
      'Workspace removed and cleaned up'
    );
  }

  /**
   * Extract editor ID from document URI as fallback
   * If no explicit editor ID is provided, use a heuristic based on document URI
   * 
   * For web editors, it's better to pass actual editor/session IDs from the client
   */
  _getEditorId(documentUri) {
    try {
      const url = new URL(documentUri);
      // Try to extract wiki or collection name from URI
      const pathParts = url.pathname.split('/').filter(p => p);
      
      if (pathParts.length > 0) {
        return `editor_${pathParts[0]}`;
      }
      
      return `${url.protocol}//${url.hostname}`;
    } catch (error) {
      // Fallback for non-URL URIs
      const pathParts = documentUri.split('/').filter(p => p && p !== 'file:');
      if (pathParts.length > 0) {
        return `editor_${pathParts[0]}`;
      }
      return 'editor_default';
    }
  }

  /**
   * Generate unique workspace ID based on editor ID
   */
  _generateWorkspaceId(editorId) {
    // Create deterministic ID based on editor ID
    // This ensures same editor always gets same workspace ID
    const timestamp = Date.now();
    const hash = this._simpleHash(editorId);
    return `ws_${hash}_${timestamp}`;
  }

  /**
   * Simple hash function for generating consistent IDs
   */
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Cleanup all workspaces (on shutdown)
   */
  async cleanup() {
    this.logger.info(
      { workspaceCount: this.workspaces.size },
      'WorkspaceManager cleanup started'
    );

    // Stop idle cleanup interval
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }

    const workspaceIds = Array.from(this.workspaces.keys());
    for (const workspaceId of workspaceIds) {
      await this._removeWorkspace(workspaceId);
    }

    this.workspaces.clear();
    this.documentToWorkspace.clear();
    this.editorToWorkspace.clear();

    this.logger.info('WorkspaceManager cleanup completed');
  }

  /**
   * Start idle workspace cleanup timer
   * Periodically checks for idle workspaces and cleans them up
   * 
   * A workspace is considered idle if it hasn't had any activity
   * (document edits, API calls, etc.) for idleTimeoutMs
   */
  _startIdleCleanup() {
    this.idleCheckInterval = setInterval(() => {
      const now = Date.now();
      const workspacesToClean = [];

      // Find all idle workspaces
      this.workspaces.forEach((workspace, wsId) => {
        const idleDuration = now - workspace.lastActivityTime;
        
        if (idleDuration > this.idleTimeoutMs) {
          workspacesToClean.push({
            wsId,
            editorId: workspace.editorId,
            idleMinutes: Math.round(idleDuration / 60000)
          });
        }
      });

      // Clean up idle workspaces
      workspacesToClean.forEach(({ wsId, editorId, idleMinutes }) => {
        this.logger.info(
          { workspaceId: wsId, editorId, idleMinutes, reason: 'idle-timeout' },
          'Cleaning up idle workspace'
        );
        this._removeWorkspace(wsId);
      });
    }, this.idleCheckIntervalMs);

    this.logger.info(
      { idleTimeoutMs: this.idleTimeoutMs, checkIntervalMs: this.idleCheckIntervalMs },
      'Idle workspace cleanup timer started'
    );
  }

  /**
   * Record activity for a workspace
   * Called whenever a document is edited or API call is made
   * 
   * @param {string} documentUri - Document URI being accessed
   */
  recordActivity(documentUri) {
    const workspace = this.getWorkspaceForDocument(documentUri);
    if (workspace) {
      workspace.lastActivityTime = Date.now();
    }
  }

  /**
   * Close all workspaces for a specific editor
   * Called when editor connection drops or user logs out
   * 
   * @param {string} editorId - Editor instance ID
   */
  async closeWorkspaceForEditor(editorId) {
    const workspaceId = this.editorToWorkspace.get(editorId);
    
    if (!workspaceId) {
      this.logger.debug(
        { editorId },
        'No workspace found for editor'
      );
      return;
    }

    this.logger.info(
      { workspaceId, editorId, reason: 'editor-closed' },
      'Closing workspace for editor'
    );

    await this._removeWorkspace(workspaceId);
  }

  /**
   * Configure idle timeout
   * 
   * @param {number} timeoutMs - Idle timeout in milliseconds
   * @param {number} checkIntervalMs - Check interval in milliseconds
   */
  configureIdleTimeout(timeoutMs, checkIntervalMs) {
    this.idleTimeoutMs = timeoutMs;
    this.idleCheckIntervalMs = checkIntervalMs;
    
    // Restart the cleanup timer with new intervals
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
    }
    this._startIdleCleanup();
    
    this.logger.info(
      { idleTimeoutMs: this.idleTimeoutMs, checkIntervalMs: this.idleCheckIntervalMs },
      'Idle timeout configuration updated'
    );
  }
}

module.exports = WorkspaceManager;
