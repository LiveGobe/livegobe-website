/**
 * LSP Server capabilities
 * Defines which features the server supports
 */

function getServerCapabilities(config) {
  return {
    codeActionProvider: false,
    completionProvider: config.features.completion
      ? {
          resolveProvider: true,
          triggerCharacters: ['.', ':', '(', '[', '{', '"', "'"]
        }
      : false,
    definitionProvider: config.features.definition || false,
    documentFormattingProvider: config.features.formatting || false,
    documentRangeFormattingProvider: config.features.formatting || false,
    documentSymbolProvider: true,
    hoverProvider: config.features.hover || false,
    referencesProvider: config.features.references || false,
    renameProvider: config.features.rename
      ? {
          prepareProvider: true
        }
      : false,
    textDocumentSync: {
      openClose: true,
      change: 1, // Full text document sync
      save: {
        includeText: true
      }
    },
    workspace: {
      workspaceFolders: {
        supported: true,
        changeNotifications: true
      }
    },
    signatureHelpProvider: config.features.completion
      ? {
          triggerCharacters: ['(', ',']
        }
      : false,
    implementationProvider: false,
    typeDefinitionProvider: false
  };
}

module.exports = {
  getServerCapabilities
};
