/**
 * LSP Proxy Handler
 * 
 * Proxies all LSP communication between the browser/client and the LSP server.
 * The browser never connects directly to the LSP server; all requests go through
 * this proxy which forwards them to the LSP server and returns responses.
 */

const axios = require('axios');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

class LSPProxy extends EventEmitter {
  constructor(config = {}) {
    super();
    this.lspServerUrl = config.lspServerUrl || process.env.LSP_SERVER_URL || 'http://localhost:3001';
    this.lspWebSocketUrl = config.lspWebSocketUrl || process.env.LSP_WEBSOCKET_URL || 'ws://localhost:3001';
    this.logger = config.logger || console;
    this.wsConnections = new Map(); // Map of client connections
  }

  /**
   * Health check for LSP server
   */
  async checkHealth() {
    try {
      const response = await axios.get(`${this.lspServerUrl}/health`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      this.logger.error('LSP health check failed:', error.message);
      throw error;
    }
  }

  /**
   * HTTP Proxy - Forward REST requests to LSP server
   * @param {string} method - RPC method name
   * @param {any} params - Request parameters
   * @returns {Promise<any>} Response from LSP server
   */
  async proxyHTTPRequest(method, params = {}) {
    try {
      const response = await axios.post(
        `${this.lspServerUrl}/rpc`,
        {
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params
        },
        {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.error) {
        throw new Error(`LSP Error: ${response.data.error.message}`);
      }

      return response.data.result;
    } catch (error) {
      this.logger.error(`LSP HTTP proxy error for method ${method}:`, error.message);
      throw error;
    }
  }

  /**
   * WebSocket Proxy - Establish WebSocket connection to LSP server for a client
   * @param {SocketIO.Socket} clientSocket - Socket.io socket from browser
   * @param {string} wikiName - Wiki name for the session
   */
  setupWebSocketProxy(clientSocket, wikiName) {
    const clientId = clientSocket.id;
    
    try {
      // Create WebSocket connection to LSP server
      const wsUrl = `${this.lspWebSocketUrl}?clientId=${clientId}&wiki=${wikiName}`;
      const lspWs = new WebSocket(wsUrl);

      // Store connection
      this.wsConnections.set(clientId, {
        clientSocket,
        lspWs,
        wikiName,
        createdAt: Date.now()
      });

      // Handle LSP server messages
      lspWs.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          // Forward message to browser client
          clientSocket.emit('lsp:message', message);
        } catch (error) {
          this.logger.error('Error parsing LSP message:', error);
        }
      });

      // Handle LSP connection open
      lspWs.on('open', () => {
        this.logger.info(`WebSocket proxy opened for client ${clientId}`);
        clientSocket.emit('lsp:connected');
      });

      // Handle LSP connection errors
      lspWs.on('error', (error) => {
        this.logger.error(`LSP WebSocket error for client ${clientId}:`, error.message);
        clientSocket.emit('lsp:error', { message: error.message });
      });

      // Handle LSP connection close
      lspWs.on('close', () => {
        this.logger.info(`WebSocket proxy closed for client ${clientId}`);
        this.wsConnections.delete(clientId);
        clientSocket.emit('lsp:disconnected');
      });

      // Handle messages from browser client to LSP server
      clientSocket.on('lsp:request', (data) => {
        if (lspWs.readyState === WebSocket.OPEN) {
          try {
            lspWs.send(JSON.stringify(data));
          } catch (error) {
            this.logger.error('Error sending to LSP server:', error.message);
            clientSocket.emit('lsp:error', { message: error.message });
          }
        } else {
          clientSocket.emit('lsp:error', { message: 'LSP connection not ready' });
        }
      });

      // Handle client disconnect
      clientSocket.on('disconnect', () => {
        this.logger.info(`Client ${clientId} disconnected, closing LSP proxy`);
        if (lspWs.readyState === WebSocket.OPEN) {
          lspWs.close();
        }
        this.wsConnections.delete(clientId);
      });

    } catch (error) {
      this.logger.error(`Failed to setup WebSocket proxy for client ${clientId}:`, error);
      clientSocket.emit('lsp:error', { message: 'Failed to connect to LSP server' });
    }
  }

  /**
   * Close a WebSocket proxy connection
   */
  closeWebSocketProxy(clientId) {
    const connection = this.wsConnections.get(clientId);
    if (connection && connection.lspWs.readyState === WebSocket.OPEN) {
      connection.lspWs.close();
    }
    this.wsConnections.delete(clientId);
  }

  /**
   * Get connection info for debugging
   */
  getConnectionInfo() {
    return Array.from(this.wsConnections.entries()).map(([clientId, conn]) => ({
      clientId,
      wikiName: conn.wikiName,
      createdAt: conn.createdAt,
      uptime: Date.now() - conn.createdAt
    }));
  }
}

module.exports = LSPProxy;
