/**
 * LSP Request and notification handlers
 */

const { TextDocument } = require('vscode-languageserver-textdocument');
const { createDocumentAnalyzer } = require('../analysis/document-analyzer');
const WorkspaceManager = require('../workspace/workspace-manager');

/**
 * Setup all LSP handlers
 */
function setupHandlers(connection, documents, config, logger) {
  // Initialize document analyzer
  const analyzer = createDocumentAnalyzer(config);
  
  // Initialize workspace manager
  const workspaceManager = new WorkspaceManager(logger);

  // Document lifecycle notifications

  async function onDidOpenTextDocument(params) {
    const { textDocument, editorId } = params;
    logger.info(
      { uri: textDocument.uri, version: textDocument.version, editorId },
      'Document opened'
    );

    // Create workspace for this editor instance
    const workspace = workspaceManager.createWorkspaceForEditor(textDocument.uri, editorId);
    
    const doc = TextDocument.create(
      textDocument.uri,
      textDocument.languageId,
      textDocument.version,
      textDocument.text
    );

    documents.set(textDocument.uri, doc);

    // Store workspace reference with document
    if (!doc._workspace) {
      doc._workspace = workspace;
    }

    // Analyze document for type information
    try {
      const wiki = extractWikiFromUri(textDocument.uri);
      await analyzer.analyzeDocument(textDocument.uri, textDocument.text, wiki, workspace);
    } catch (error) {
      logger.error(
        { uri: textDocument.uri, error: error.message },
        'Failed to analyze opened document'
      );
    }
  };

  async function onDidChangeTextDocument(params) {
    const { textDocument, contentChanges } = params;
    logger.debug({ uri: textDocument.uri }, 'Document changed');

    let doc = documents.get(textDocument.uri);
    if (!doc) {
      logger.warn(
        { uri: textDocument.uri },
        'Received change for unknown document'
      );
      return;
    }

    // Update document with changes
    doc = TextDocument.update(doc, contentChanges, textDocument.version);
    documents.set(textDocument.uri, doc);

    // Get workspace for this document
    const workspace = workspaceManager.getWorkspaceForDocument(textDocument.uri);

    // Re-analyze document
    try {
      const wiki = extractWikiFromUri(textDocument.uri);
      await analyzer.analyzeDocument(textDocument.uri, doc.getText(), wiki, workspace);
    } catch (error) {
      logger.error(
        { uri: textDocument.uri, error: error.message },
        'Failed to analyze changed document'
      );
    }
  };

  async function onDidCloseTextDocument(params) {
    const { textDocument } = params;
    logger.info({ uri: textDocument.uri }, 'Document closed');

    // Get workspace info before closing
    const workspace = workspaceManager.getWorkspaceForDocument(textDocument.uri);
    const workspaceId = workspace ? workspace.id : null;

    // Clean up document
    documents.delete(textDocument.uri);
    analyzer.removeDocument(textDocument.uri);

    // Close workspace if this was the last document (async but non-blocking)
    await workspaceManager.closeDocumentWorkspace(textDocument.uri);

    logger.info(
      { uri: textDocument.uri, workspaceId },
      'Document removed from workspace'
    );
  };

  async function onDidSaveTextDocument(params) {
    const { textDocument } = params;
    logger.info({ uri: textDocument.uri }, 'Document saved');

    // Could trigger re-analysis or validation here
  }

  // Request handlers

  async function onCompletion(params) {
    const { textDocument, position } = params;
    logger.debug(
      { uri: textDocument.uri, position },
      'Completion request'
    );

    try {
      const completions = await analyzer.getCompletions(
        textDocument.uri,
        position.line,
        position.character
      );

      return {
        isIncomplete: false,
        items: completions.filter(item => !item.label.startsWith("__mod_"))
      };
    } catch (error) {
      logger.error(
        { uri: textDocument.uri, position, error: error.message },
        'Completion request failed'
      );
      return { isIncomplete: false, items: [] };
    }
  };

  async function onCompletionResolve(item) {
    logger.debug({ label: item.label }, 'Completion resolve request');

    // TODO: Implement completion resolve
    return item;
  }

  async function onHover(params) {
    const { textDocument, position } = params;
    logger.debug(
      { uri: textDocument.uri, position },
      'Hover request'
    );

    try {
      const hover = await analyzer.getHover(
        textDocument.uri,
        position.line,
        position.character
      );

      return hover;
    } catch (error) {
      logger.error(
        { uri: textDocument.uri, position, error: error.message },
        'Hover request failed'
      );
      return null;
    }
  };

  async function onDefinition(params) {
    const { textDocument, position } = params;
    logger.debug(
      { uri: textDocument.uri, position },
      'Definition request'
    );

    try {
      const definition = await analyzer.getDefinition(
        textDocument.uri,
        position.line,
        position.character
      );

      return definition;
    } catch (error) {
      logger.error(
        { uri: textDocument.uri, position, error: error.message },
        'Definition request failed'
      );
      return null;
    }
  };

  async function onReferences(params) {
    logger.debug(
      { uri: params.textDocument.uri, position: params.position },
      'References request'
    );

    // TODO: Implement references handler
    return [];
  };

  async function onRenameRequest(params) {
    logger.debug(
      { uri: params.textDocument.uri, position: params.position },
      'Rename request'
    );

    // TODO: Implement rename handler
    return null;
  };

  async function onDocumentSymbol(params) {
    logger.debug({ uri: params.textDocument.uri }, 'Document symbol request');

    // TODO: Implement document symbol handler
    return [];
  }

  async function onSignatureHelp(params) {
    logger.debug(
      { uri: params.textDocument.uri, position: params.position },
      'Signature help request'
    );

    // TODO: Implement signature help handler
    return null;
  };

  // Register handlers with connection
  connection.onDidOpenTextDocument(onDidOpenTextDocument);
  connection.onDidChangeTextDocument(onDidChangeTextDocument);
  connection.onDidCloseTextDocument(onDidCloseTextDocument);
  connection.onDidSaveTextDocument(onDidSaveTextDocument);
  connection.onCompletion(onCompletion);
  connection.onCompletionResolve(onCompletionResolve);
  connection.onHover(onHover);
  connection.onDefinition(onDefinition);
  connection.onReferences(onReferences);
  connection.onRenameRequest(onRenameRequest);
  connection.onDocumentSymbol(onDocumentSymbol);
  connection.onSignatureHelp(onSignatureHelp);

  logger.info('All LSP handlers registered');

  // Return handlers and workspace manager for WebSocket server
  return {
    workspaceManager,
    onDidOpenTextDocument,
    onDidChangeTextDocument,
    onDidCloseTextDocument,
    onDidSaveTextDocument,
    onCompletion,
    onCompletionResolve,
    onHover,
    onDefinition,
    onReferences,
    onRenameRequest,
    onDocumentSymbol,
    onSignatureHelp
  }
}

/**
 * Extract wiki name from LSP document URI
 * Expected format: file:///wiki-name/page-name
 * Returns the wiki name from the path
 */
function extractWikiFromUri(uri) {
  // Parse URI to get path component
  try {
    const url = new URL(uri);
    return url.hostname || url.pathname.split('/')[1] || 'default';
  } catch (error) {
    // Fallback for non-URL URIs
    const pathParts = uri.split('/').filter(p => p && p !== 'file:');
    if (pathParts.length > 0) {
      return pathParts[0];
    }
  }

  // Default fallback
  return 'default';
}

module.exports = {
  setupHandlers
};
