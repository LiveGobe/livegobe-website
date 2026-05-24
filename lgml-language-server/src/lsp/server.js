/**
 * LSP Server initialization and connection handling
 * Implements Language Server Protocol v3.17+
 */

const {
  createConnection,
  ProposedFeatures,
  TextDocumentSyncKind,
  InitializeResult,
  StreamMessageReader,
  StreamMessageWriter
} = require('vscode-languageserver');
const { TextDocument } = require('vscode-languageserver-textdocument');
const { getLogger } = require('../logging/logger');
const { getServerCapabilities } = require('./capabilities');
const { setupHandlers } = require('./handlers');

let connection;
let documents = new Map(); // Store open documents
let config;
let logger;
let workspaceManager;

/**
 * Create and initialize LSP connection
 */
function createLSPConnection(serverConfig) {
  config = serverConfig;
  logger = getLogger();

  // Create connection with explicit stdin/stdout streams
  const reader = new StreamMessageReader(process.stdin);
  const writer = new StreamMessageWriter(process.stdout);
  connection = createConnection(reader, writer, ProposedFeatures.all);

  logger.info('LSP Server connection created');

  // Initialize request handler
  connection.onInitialize((params) => {
    logger.info({ params }, 'LSP Initialize request received');

    const capabilities = getServerCapabilities(config);

    const result = {
      capabilities,
      serverInfo: {
        name: 'LGML Language Server',
        version: '0.1.0'
      }
    };

    logger.info({ capabilities }, 'Server capabilities advertised');
    return result;
  });

  // Shutdown request handler
  connection.onShutdown(() => {
    logger.info('LSP Shutdown request received');
    documents.clear();
  });

  // Setup all request and notification handlers
  const handlers = setupHandlers(connection, documents, config, logger);
  
  // Store workspace manager for access from other modules
  workspaceManager = handlers.workspaceManager;

  return { connection, handlers, workspaceManager };
}

/**
 * Start the LSP connection
 */
function startConnection() {
  if (connection) {
    connection.listen();
    logger.info('LSP Server started and listening');
  }
}

/**
 * Get the LSP connection
 */
function getConnection() {
  return connection;
}

/**
 * Get all open documents
 */
function getDocuments() {
  return documents;
}

/**
 * Get the workspace manager
 */
function getWorkspaceManager() {
  return workspaceManager;
}

module.exports = {
  createLSPConnection,
  startConnection,
  getConnection,
  getDocuments,
  getWorkspaceManager
};
