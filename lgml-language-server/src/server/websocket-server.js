/**
 * LSP Server - WebSocket with JSON-RPC 2.0
 * 
 * Handles JSON-RPC 2.0 requests over WebSocket
 * Connects LSP handlers to WebSocket clients
 */

const WebSocket = require('ws');
const http = require('http');
const { getLogger } = require('../logging/logger');

let logger;

class LSPWebSocketServer {
  constructor(port, config) {
    this.port = port || 3001;
    this.config = config;
    this.clients = new Set();
    this.lspHandlers = null;
    this.messageId = 0;
    
    logger = getLogger();
    
    // Create HTTP server with SO_REUSEADDR to allow quick restart
    this.server = http.createServer();
    this.server.listen(this.port, '0.0.0.0', () => {
      logger.info({ port: this.port }, 'HTTP server listening for WebSocket');
    });
    
    // Enable SO_REUSEADDR on the underlying socket
    this.server.once('listening', () => {
      if (this.server._handle) {
        this.server._handle.setBlocking?.(false);
      }
    });
    
    // Create WebSocket server on top of HTTP server
    this.wss = new WebSocket.Server({ 
      server: this.server,
      perMessageDeflate: false
    });
    
    this.setupWebSocketServer();
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws) => {
      logger.info('WebSocket client connected');
      
      this.clients.add(ws);

      // Handle messages
      ws.on('message', (data) => {
        this.handleMessage(ws, data);
      });

      // Handle client disconnect
      ws.on('close', () => {
        logger.info('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error({ error: error.message }, 'WebSocket error');
      });

      // Send ready message
      this.send(ws, {
        jsonrpc: '2.0',
        method: 'initialized',
        params: {}
      });
    });

    this.wss.on('error', (error) => {
      logger.error({ error: error.message }, 'WebSocket server error');
    });

    logger.info({ port: this.port }, 'WebSocket server started');
  }

  /**
   * Handle incoming JSON-RPC message
   */
  async handleMessage(ws, data) {
    try {
      const message = JSON.parse(data);
      logger.debug({ message }, 'Received message');

      // Handle JSON-RPC request
      if (message.jsonrpc === '2.0' && message.method) {
        const result = await this.handleRPC(message.method, message.params);
        
        // Send response if id is present (request, not notification)
        if (typeof message.id !== 'undefined') {
          this.send(ws, {
            jsonrpc: '2.0',
            id: message.id,
            result: result || null
          });
        }
      }
      // Handle JSON-RPC response (shouldn't happen from client)
      else if (message.jsonrpc === '2.0' && message.id) {
        logger.warn({ message }, 'Unexpected response from client');
      }
    } catch (error) {
      logger.error({ error: error.message }, 'Message handling error');
      
      // Send error response
      this.send(ws, {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error',
          data: error.message
        }
      });
    }
  }

  /**
   * Handle JSON-RPC method calls
   */
  async handleRPC(method, params) {
    logger.debug({ method }, 'Handling RPC method');

    if (!this.lspHandlers) {
      throw new Error('LSP handlers not initialized');
    }

    // Map JSON-RPC methods to LSP handlers
    const handlers = {
      'textDocument/completion': () => this.lspHandlers.onCompletion(params),
      'textDocument/hover': () => this.lspHandlers.onHover(params),
      'textDocument/definition': () => this.lspHandlers.onDefinition(params),
      'textDocument/didOpen': () => this.lspHandlers.onDidOpenTextDocument(params),
      'textDocument/didChange': () => this.lspHandlers.onDidChangeTextDocument(params),
      'textDocument/didClose': () => this.lspHandlers.onDidCloseTextDocument(params),
      'textDocument/references': () => this.lspHandlers.onReferences?.(params) || null,
      'textDocument/definition': () => this.lspHandlers.onDefinition(params),
      'textDocument/documentSymbol': () => this.lspHandlers.onDocumentSymbol?.(params) || [],
      'textDocument/signatureHelp': () => this.lspHandlers.onSignatureHelp?.(params) || null,
      // Workspace management methods
      'workspace/getStatistics': () => this._getWorkspaceStatistics(),
      'workspace/list': () => this._listWorkspaces(),
      'workspace/getForDocument': (params) => this._getWorkspaceForDocument(params?.documentUri),
    };

    if (!handlers[method]) {
      throw new Error(`Unknown method: ${method}`);
    }

    return await handlers[method]();
  }

  /**
   * Get workspace statistics
   */
  _getWorkspaceStatistics() {
    if (!this.workspaceManager) {
      return { error: 'WorkspaceManager not initialized' };
    }
    return this.workspaceManager.getStatistics();
  }

  /**
   * List all workspaces
   */
  _listWorkspaces() {
    if (!this.workspaceManager) {
      return [];
    }
    const workspaces = this.workspaceManager.getAllWorkspaces();
    return workspaces.map(ws => ({
      id: ws.id,
      documentCount: ws.metadata.documentCount,
      documents: ws.getDocuments(),
      createdAt: ws.createdAt,
      uptime: Date.now() - ws.createdAt.getTime()
    }));
  }

  /**
   * Get workspace for a document
   */
  _getWorkspaceForDocument(documentUri) {
    if (!this.workspaceManager || !documentUri) {
      return null;
    }
    const workspace = this.workspaceManager.getWorkspaceForDocument(documentUri);
    if (!workspace) {
      return null;
    }
    return {
      id: workspace.id,
      documentCount: workspace.metadata.documentCount,
      documents: workspace.getDocuments(),
      createdAt: workspace.createdAt,
      uptime: Date.now() - workspace.createdAt.getTime()
    };
  }

  /**
   * Send message to client
   */
  send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        logger.debug({ message }, 'Sent message');
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to send message');
      }
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
    logger.debug({ clients: this.clients.size }, 'Broadcast message');
  }

  /**
   * Set LSP handlers and workspace manager
   */
  setHandlers(handlers, workspaceManager) {
    this.lspHandlers = handlers;
    this.workspaceManager = workspaceManager;
    logger.info('LSP handlers and workspace manager registered');
  }

  /**
   * Stop WebSocket server
   */
  stop() {
    return new Promise((resolve) => {
      // Close all WebSocket connections
      this.clients.forEach(client => {
        client.close();
      });
      this.clients.clear();

      // Close WebSocket server
      this.wss.close(() => {
        logger.info('WebSocket server closed');
        
        // Close HTTP server
        this.server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });

      // Forcefully close after 5 seconds
      setTimeout(() => {
        logger.warn('Forcefully closing server');
        this.server.closeAllConnections?.();
        resolve();
      }, 5000);
    });
  }
}

module.exports = LSPWebSocketServer;
