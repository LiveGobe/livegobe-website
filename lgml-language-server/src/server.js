#!/usr/bin/env node

/**
 * LGML Language Server - Main entry point
 * 
 * Starts the LSP server over:
 * - stdio (for LSP protocol from VS Code extensions)
 * - WebSocket (for MainApp communication via JSON-RPC)
 */

const { loadConfig } = require('./config/loader');
const { initializeLogger } = require('./logging/logger');
const { createLSPConnection, startConnection, getWorkspaceManager } = require('./lsp/server');
const LSPWebSocketServer = require('./server/websocket-server');

let connection;
let wsServer;
let workspaceManager;

async function main() {
  try {
    // Load configuration
    const config = loadConfig();
    
    // Initialize logger
    const logger = initializeLogger(config);
    logger.info({ config }, 'Configuration loaded');

    // Create LSP connection
    const { connection: lspConnection, handlers, workspaceManager: wsManager } = createLSPConnection(config);
    connection = lspConnection;
    workspaceManager = wsManager;
    logger.info('LSP connection created');

    // Start WebSocket server for MainApp communication
    const wsPort = config.server?.port;
    wsServer = new LSPWebSocketServer(wsPort, config);
    
    // Register LSP handlers and workspace manager with WebSocket server
    if (connection) {
      wsServer.setHandlers(handlers, workspaceManager);
    }

    logger.info({ wsPort }, 'WebSocket server started (JSON-RPC)');

    // Start listening on stdin for stdio LSP protocol
    startConnection();
    logger.info(
      { port: config.server.port, host: config.server.host },
      'LGML Language Server started (stdio + WebSocket)'
    );

  } catch (err) {
    console.error('Failed to start LSP server:', err);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);
  try {
    // Cleanup workspace manager
    if (workspaceManager) {
      await workspaceManager.cleanup();
    }
    
    if (wsServer) {
      await wsServer.stop();
    }
    if (connection) {
      connection.dispose();
    }
  } catch (err) {
    console.error('Error during shutdown:', err);
  }
  
  // Forcefully exit after 3 seconds
  setTimeout(() => {
    console.error('Shutdown timeout, forcing exit');
    process.exit(0);
  }, 3000);
  
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main();
