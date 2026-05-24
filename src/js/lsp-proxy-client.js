/**
 * LSP Proxy Client (Browser-side)
 * 
 * Handles all communication with the LSP server through the main app proxy.
 * The browser NEVER connects directly to the LSP server.
 * All requests go through the main app's proxy endpoints.
 */

export class LSPProxyClient {
  constructor(options = {}) {
    this.socket = options.socket || null;
    this.useHttp = options.useHttp !== false; // Default to HTTP, can use WebSocket
    this.baseUrl = options.baseUrl || '/api/lsp';
    this.wikiName = options.wikiName || 'default';
    this.editorId = options.editorId || this._generateEditorId(); // Unique editor instance ID
    this.requestTimeout = options.requestTimeout || 30000;
    this.debug = options.debug || false;
    
    this.pendingRequests = new Map();
    this.connected = false;
    this.handlers = new Map();
    
    this._log(`Initialized with editorId: ${this.editorId}`);
  }

  /**
   * Initialize the client
   * If socket is provided, use WebSocket proxy; otherwise use HTTP
   */
  async initialize(socket) {
    if (socket) {
      this.socket = socket;
      this._initializeWebSocketProxy();
    }
    return true;
  }

  /**
   * Setup WebSocket proxy handlers
   */
  _initializeWebSocketProxy() {
    if (!this.socket) return;

    // Handle LSP connection established
    this.socket.on('lsp:connected', () => {
      this._log('LSP proxy connected via WebSocket');
      this.connected = true;
    });

    // Handle LSP connection closed
    this.socket.on('lsp:disconnected', () => {
      this._log('LSP proxy disconnected');
      this.connected = false;
    });

    // Handle LSP messages from server
    this.socket.on('lsp:message', (message) => {
      this._log('LSP message received:', message);
      this._handleMessage(message);
    });

    // Handle HTTP response
    this.socket.on('lsp:http-response', (data) => {
      const { requestId, result, error } = data;
      if (this.pendingRequests.has(requestId)) {
        const callback = this.pendingRequests.get(requestId);
        this.pendingRequests.delete(requestId);
        if (error) {
          callback.reject(new Error(error));
        } else {
          callback.resolve(result);
        }
      }
    });

    // Handle errors
    this.socket.on('lsp:error', (error) => {
      this._log('LSP error:', error);
      this._notifyHandlers('error', error);
    });
  }

  /**
   * Connect to LSP proxy
   */
  async connect() {
    if (this.socket) {
      return new Promise((resolve) => {
        this.socket.emit('lsp:connect', { wikiName: this.wikiName });
        // Wait for connection
        setTimeout(() => resolve(true), 100);
      });
    }
    return true;
  }

  /**
   * Check LSP server health through proxy
   */
  async checkHealth() {
    if (this.socket) {
      return new Promise((resolve) => {
        this.socket.emit('lsp:health');
        this.socket.once('lsp:health-response', resolve);
      });
    }

    // HTTP request
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      const data = await response.json();
      return data;
    } catch (error) {
      throw new Error('Failed to check LSP health: ' + error.message);
    }
  }

  /**
   * Make HTTP-based RPC call through proxy
   */
  async rpcCall(method, params = {}) {
    // Include editor ID in all RPC calls
    const enhancedParams = {
      ...params,
      editorId: this.editorId
    };
    
    if (this.socket && !this.useHttp) {
      return this._socketRpcCall(method, enhancedParams);
    }

    return this._httpRpcCall(method, enhancedParams);
  }

  /**
   * HTTP-based RPC call
   */
  async _httpRpcCall(method, params = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

    try {
      const response = await fetch(`${this.baseUrl}/rpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          method,
          params
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      this._log(`RPC call success: ${method}`, result);
      return result;
    } catch (error) {
      this._log(`RPC call error: ${method}`, error.message);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Socket-based RPC call
   */
  async _socketRpcCall(method, params = {}) {
    const requestId = `${Date.now()}-${Math.random()}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`RPC call timeout: ${method}`));
      }, this.requestTimeout);

      this.pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });

      this.socket.emit('lsp:http-request', {
        method,
        params,
        requestId
      });
    });
  }

  /**
   * Send document open notification to LSP server
   * This tells the LSP server about a document being edited
   */
  async didOpen(textDocument) {
    try {
      const response = await fetch(`${this.baseUrl}/document/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ textDocument })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this._log('Document opened:', textDocument.uri);
      return true;
    } catch (error) {
      console.error('[LSP] Failed to send didOpen:', error);
      return false;
    }
  }

  /**
   * Send document change notification to LSP server
   * This updates the document content on the server
   * 
   * Note: We send the full content for simplicity (full document sync mode)
   */
  async didChange(textDocument, fullContent) {
    try {
      const response = await fetch(`${this.baseUrl}/document/change`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          textDocument,
          contentChanges: [{ text: fullContent }]
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this._log('Document changed:', textDocument.uri);
      return true;
    } catch (error) {
      console.error('[LSP] Failed to send didChange:', error);
      return false;
    }
  }

  /**
   * Send document close notification to LSP server
   */
  async didClose(textDocument) {
    try {
      const response = await fetch(`${this.baseUrl}/document/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ textDocument })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this._log('Document closed:', textDocument.uri);
      return true;
    } catch (error) {
      console.error('[LSP] Failed to send didClose:', error);
      return false;
    }
  }

  /**
   * Get completions for a document position
   */
  async getCompletions(textDocument, position) {
    const response = await this._httpRpcCall('textDocument/completion', {
      textDocument,
      position,
      editorId: this.editorId
    });
    return response.items || response || [];
  }

  /**
   * Get hover information
   */
  async getHover(textDocument, position) {
    const response = await this._httpRpcCall('textDocument/hover', {
      textDocument,
      position
    });
    return response;
  }

  /**
   * Get definition location
   */
  async getDefinition(textDocument, position) {
    const response = await this._httpRpcCall('textDocument/definition', {
      textDocument,
      position
    });
    return response || [];
  }

  /**
   * Get diagnostics
   */
  async getDiagnostics(textDocument) {
    const response = await this._httpRpcCall('textDocument/diagnostic', {
      textDocument
    });
    return response || [];
  }

  /**
   * Send a custom request
   */
  async request(method, params = {}) {
    return this.rpcCall(method, params);
  }

  /**
   * Register a handler for LSP messages
   */
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
  }

  /**
   * Unregister a handler
   */
  off(event, handler) {
    if (this.handlers.has(event)) {
      const handlers = this.handlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Handle message from LSP
   */
  _handleMessage(message) {
    this._notifyHandlers('message', message);
  }

  /**
   * Notify handlers
   */
  _notifyHandlers(event, data) {
    if (this.handlers.has(event)) {
      this.handlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Handler error for event ${event}:`, error);
        }
      });
    }
  }

  /**
   * Disconnect from LSP proxy
   */
  async disconnect() {
    if (this.socket) {
      this.socket.emit('lsp:disconnect');
    }
    this.connected = false;
  }

  /**
   * Get status information
   */
  async getStatus() {
    if (this.socket) {
      return new Promise((resolve) => {
        this.socket.emit('lsp:status');
        this.socket.once('lsp:status-response', resolve);
      });
    }
    return { connected: false };
  }

  /**
   * Generate unique editor ID (one per browser tab/editor instance)
   */
  _generateEditorId() {
    // Use combination of user ID (if available) and unique session ID
    const sessionId = this._getOrCreateSessionId();
    return `editor_${sessionId}`;
  }

  /**
   * Get or create session ID for this editor instance
   */
  _getOrCreateSessionId() {
    const storageKey = 'lsp_editor_session_id';
    let sessionId = sessionStorage.getItem(storageKey);
    
    if (!sessionId) {
      // Generate new session ID (unique per page load)
      sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem(storageKey, sessionId);
    }
    
    return sessionId;
  }

  /**
   * Debug logging
   */
  _log(...args) {
    if (this.debug) {
      console.log('[LSPProxyClient]', ...args);
    }
  }
}

// Export as default for ES6 module imports
export default LSPProxyClient;