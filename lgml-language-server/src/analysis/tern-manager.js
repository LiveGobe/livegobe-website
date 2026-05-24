/**
 * Tern.js Type Analysis Engine
 * Provides type inference, completions, hover info, and go-to-definition
 */

const tern = require('tern');
const { getLogger } = require('../logging/logger');

let logger;

class TernManager {
  constructor(config) {
    this.config = config;
    logger = getLogger();

    // Tern server options
    this.ternOptions = {
      ecmaVersion: parseInt(process.env.TERN_ECMA_VERSION || 6),
      defs: [require('tern/defs/ecmascript.json'), require('tern/defs/browser.json')],
      plugins: {
        doc_comment: true,
        required_parameter_check: true
      }
    };

    // Initialize Tern server
    this.server = new tern.Server(this.ternOptions);

    // Track files in Tern
    this.files = new Map();

    // Custom LGML type definitions
    this._initializeLgmlDefinitions();

    logger.info(
      { ecmaVersion: this.ternOptions.ecmaVersion },
      'Tern.js manager initialized'
    );
  }

  /**
   * Add or update a file in Tern
   * @param {string} uri - File URI (e.g., "wiki:///Module:Items")
   * @param {string} content - File content
   */
  addFile(uri, content) {
    try {
      // Store metadata
      this.files.set(uri, {
        uri,
        content,
        addedAt: new Date().toISOString(),
        size: content.length
      });

      // Add to Tern server
      this.server.addFile(uri, content);

      logger.debug(
        { uri, size: content.length },
        'File added to Tern'
      );

    } catch (error) {
      logger.error(
        { uri, error: error.message },
        'Failed to add file to Tern'
      );
      throw error;
    }
  }

  /**
   * Get completions at a specific position
   * @param {string} uri - File URI
   * @param {number} line - Line number (0-based)
   * @param {number} ch - Character position (0-based)
   * @returns {Promise<Array>} Array of completion items
   */
  async getCompletions(uri, line, ch) {
    try {
      return new Promise((resolve, reject) => {
        const query = {
          type: 'completions',
          file: uri,
          end: { line, ch },
          types: true,
          docs: true,
          caseInsensitive: true,
          includeKeywords: true
        };

        this.server.request({ query }, (error, data) => {
          if (error) {
            logger.error(
              { uri, line, ch, error: error.message },
              'Tern completion error'
            );
            reject(error);
            return;
          }

          if (!data || !data.completions) {
            logger.debug({ uri, line, ch }, 'No completions found');
            resolve([]);
            return;
          }

          // Convert Tern completions to LSP format
          const completions = data.completions.map(completion => ({
            label: completion.name,
            kind: this._getTernCompletionKind(completion.type),
            detail: completion.type || 'unknown',
            documentation: completion.doc || '',
            sortText: completion.name,
            filterText: completion.name,
            insertText: completion.name
          }));

          logger.debug(
            { uri, line, ch, count: completions.length },
            'Completions retrieved'
          );

          resolve(completions);
        });
      });

    } catch (error) {
      logger.error({ error: error.message }, 'Completion request failed');
      throw error;
    }
  }

  /**
   * Get type information at a position
   * @param {string} uri - File URI
   * @param {number} line - Line number (0-based)
   * @param {number} ch - Character position (0-based)
   * @returns {Promise<Object>} Type information
   */
  async getType(uri, line, ch) {
    try {
      return new Promise((resolve, reject) => {
        const query = {
          type: 'type',
          file: uri,
          start: { line, ch },
          end: { line, ch }
        };

        this.server.request({ query }, (error, data) => {
          if (error) {
            logger.error(
              { uri, line, ch, error: error.message },
              'Tern type error'
            );
            reject(error);
            return;
          }

          if (!data) {
            logger.debug({ uri, line, ch }, 'No type information found');
            resolve(null);
            return;
          }

          const typeInfo = {
            type: data.type || 'unknown',
            doc: data.doc || '',
            url: data.url || ''
          };

          logger.debug(
            { uri, line, ch, type: typeInfo.type },
            'Type information retrieved'
          );

          resolve(typeInfo);
        });
      });

    } catch (error) {
      logger.error({ error: error.message }, 'Type request failed');
      throw error;
    }
  }

  /**
   * Get hover information
   * @param {string} uri - File URI
   * @param {number} line - Line number (0-based)
   * @param {number} ch - Character position (0-based)
   * @returns {Promise<Object>} Hover information
   */
  async getHover(uri, line, ch) {
    try {
      const typeInfo = await this.getType(uri, line, ch);

      if (!typeInfo) {
        return null;
      }

      // Format hover information
      const hover = {
        contents: {
          language: 'javascript',
          value: this._formatTypeForDisplay(typeInfo.type)
        }
      };

      if (typeInfo.doc) {
        hover.contents = [
          hover.contents,
          { language: 'markdown', value: typeInfo.doc }
        ];
      }

      if (typeInfo.url) {
        hover.contents.push({
          language: 'markdown',
          value: `[Documentation](${typeInfo.url})`
        });
      }

      logger.debug({ uri, line, ch }, 'Hover information retrieved');
      return hover;

    } catch (error) {
      logger.error({ error: error.message }, 'Hover request failed');
      throw error;
    }
  }

  /**
   * Get function signature information
   * @param {string} uri - File URI
   * @param {number} line - Line number (0-based)
   * @param {number} ch - Character position (0-based)
   * @returns {Promise<Object>} Signature information
   */
  async getSignature(uri, line, ch) {
    try {
      return new Promise((resolve, reject) => {
        const query = {
          type: 'type',
          file: uri,
          start: { line, ch },
          end: { line, ch }
        };

        this.server.request({ query }, (error, data) => {
          if (error) {
            logger.error(
              { uri, line, ch, error: error.message },
              'Tern signature error'
            );
            reject(error);
            return;
          }

          if (!data || !data.type || !data.type.startsWith('fn(')) {
            logger.debug({ uri, line, ch }, 'Not a function signature');
            resolve(null);
            return;
          }

          const signature = {
            label: data.type,
            parameters: this._parseSignatureParameters(data.type),
            documentation: data.doc || ''
          };

          logger.debug(
            { uri, line, ch, parameters: signature.parameters.length },
            'Signature retrieved'
          );

          resolve(signature);
        });
      });

    } catch (error) {
      logger.error({ error: error.message }, 'Signature request failed');
      throw error;
    }
  }

  /**
   * Find definition of symbol
   * @param {string} uri - File URI
   * @param {number} line - Line number (0-based)
   * @param {number} ch - Character position (0-based)
   * @returns {Promise<Object>} Definition location
   */
  async getDefinition(uri, line, ch) {
    try {
      return new Promise((resolve, reject) => {
        const query = {
          type: 'definition',
          file: uri,
          start: { line, ch },
          end: { line, ch }
        };

        this.server.request({ query }, (error, data) => {
          if (error) {
            logger.error(
              { uri, line, ch, error: error.message },
              'Tern definition error'
            );
            reject(error);
            return;
          }

          if (!data) {
            logger.debug({ uri, line, ch }, 'No definition found');
            resolve(null);
            return;
          }

          const definition = {
            uri: data.file || uri,
            range: {
              start: { line: data.start.line, character: data.start.ch },
              end: { line: data.end.line, character: data.end.ch }
            }
          };

          logger.debug(
            { uri, line, ch, defUri: definition.uri },
            'Definition found'
          );

          resolve(definition);
        });
      });

    } catch (error) {
      logger.error({ error: error.message }, 'Definition request failed');
      throw error;
    }
  }

  /**
   * Remove file from Tern
   * @param {string} uri - File URI
   */
  removeFile(uri) {
    try {
      this.files.delete(uri);

      // Don't remove from Tern server directly; just clear our reference
      // Tern manages its own file cache
      logger.debug({ uri }, 'File removed from manager');

    } catch (error) {
      logger.error({ uri, error: error.message }, 'Failed to remove file');
      throw error;
    }
  }

  /**
   * Get Tern manager statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      filesTracked: this.files.size,
      totalSize: Array.from(this.files.values()).reduce((sum, f) => sum + f.size, 0),
      files: Array.from(this.files.entries()).map(([uri, meta]) => ({
        uri,
        size: meta.size,
        addedAt: meta.addedAt
      }))
    };
  }

  /**
   * Private: Initialize LGML-specific type definitions
   */
  _initializeLgmlDefinitions() {
    // Define custom LGML/wiki functions
    const lgmlDefs = {
      "requireData": {
        "!type": "fn(name: string) -> ?",
        "!resolve": function (self, args, graph) {
          const nameNode = args && args[0];
          if (!nameNode) return null;

          function resolveModule(modName) {
            const varName = "__data_" + modName.replace(/[:.-\/]/g, "_");
            const found = graph.lookup(varName, graph.ecma5);
            return found ? found.getType() : null;
          }

          // --- 1. Literal ---
          if (typeof nameNode.value === "string") {
            const t = resolveModule(nameNode.value);
            return t || "?";
          }

          // --- 2. Variable lookup (FIXED)
          const varName =
            (nameNode.node && nameNode.node.name) ||
            nameNode.name;

          if (varName && variableMap.has(varName)) {
            const modName = variableMap.get(varName);
            const t = resolveModule(modName);
            if (t) return t;
          }

          // --- 3. Fallback
          let union = null;

          dataCache.forEach((_, modName) => {
            const t = resolveModule(modName);
            if (t) {
              union = union ? (union.or ? union.or(t) : t) : t;
            }
          });

          return union || "?";
        }
      },
      "require": {
        "!type": "fn(name: string) -> ?",
        // Inside your lgmlDefs.require definition
        "!resolve": function (self, args, graph) {
          const nameNode = args && args[0];
          if (!nameNode) return null;

          // --- 1. Literal string ---
          if (typeof nameNode.value === "string") {
            const varName = "__mod_" + nameNode.value.replace(/[:.-\/]/g, "_");
            const found = graph.lookup(varName, graph.ecma5);
            return found ? found.getType() : "?";
          }

          return null;
        }
      },
      "exports": { "!type": "object" },
      "!define": {
        // This acts as a registry for all your modules
        "modules": {}
      }
    };

    try {
      // Add LGML definitions to server
      this.server.addDefs(lgmlDefs);
      logger.debug('LGML type definitions initialized');
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to add LGML definitions');
    }
  }

  /**
   * Private: Get LSP completion kind from Tern type
   */
  _getTernCompletionKind(type) {
    if (!type) return 1; // Text

    // Map Tern type strings to LSP completion kinds
    if (type.startsWith('fn(')) return 3; // Function
    if (type === 'number') return 21; // Number
    if (type === 'string') return 15; // String
    if (type === 'bool') return 17; // Boolean
    if (type.startsWith('[')) return 18; // Array
    if (type === 'object') return 6; // Object

    return 1; // Default: Text
  }

  /**
   * Private: Format type for display
   */
  _formatTypeForDisplay(type) {
    if (!type) return 'unknown';

    // Format function signatures
    if (type.startsWith('fn(')) {
      return type.replace(/fn\((.*?)\) -> (.*)/, '($1) => $2');
    }

    return type;
  }

  /**
   * Private: Parse function signature parameters
   */
  _parseSignatureParameters(signature) {
    const match = signature.match(/fn\((.*?)\)/);
    if (!match) return [];

    const paramsStr = match[1];
    if (!paramsStr) return [];

    // Split by comma, accounting for nested types
    const params = [];
    let current = '';
    let depth = 0;

    for (const char of paramsStr) {
      if (char === '<' || char === '(' || char === '[') {
        depth++;
        current += char;
      } else if (char === '>' || char === ')' || char === ']') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        params.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current) {
      params.push(current.trim());
    }

    return params.map((param, index) => ({
      label: param,
      index
    }));
  }
}

/**
 * Create a Tern manager instance
 */
function createTernManager(config) {
  return new TernManager(config);
}

module.exports = {
  TernManager,
  createTernManager
};
