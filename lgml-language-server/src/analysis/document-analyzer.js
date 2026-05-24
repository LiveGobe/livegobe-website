/**
 * Document Analyzer - Orchestrates code analysis
 * Combines module resolution, virtual document generation, and Tern.js
 */

const { createModuleResolver } = require('../modules/resolver');
const { createTernManager } = require('./tern-manager');
const { createVirtualDocumentGenerator } = require('../utils/virtual-doc');
const { getLogger } = require('../logging/logger');

let logger;

class DocumentAnalyzer {
  constructor(config) {
    this.config = config;
    logger = getLogger();

    // Initialize components
    this.moduleResolver = createModuleResolver(config);
    this.ternManager = createTernManager(config);
    this.virtualDocGenerator = createVirtualDocumentGenerator(config);

    // Track analyzed documents
    this.documents = new Map();

    logger.info('Document analyzer initialized');
  }

  /**
   * Analyze a document (resolve modules, generate virtual doc, prepare Tern)
   * @param {string} uri - Document URI
   * @param {string} content - Document content
   * @param {string} wiki - Wiki name
   * @param {Object} workspace - Workspace instance for cache isolation
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeDocument(uri, content, wiki, workspace) {
    try {
      logger.debug({ uri, size: content.length }, 'Starting document analysis');

      // Extract dependencies from code
      const dependencies = this._extractDependencies(content);
      logger.debug({ uri, deps: dependencies.length }, 'Dependencies extracted');

      // Extract variable mappings for requireData()
      const variableMap = this._extractVariableMappings(content);

      // Resolve all dependencies using workspace cache
      const resolvedModules = await this._resolveDependencies(
        dependencies,
        wiki,
        variableMap,
        workspace  // Pass workspace for cache isolation
      );
      logger.debug(
        { uri, resolved: Object.keys(resolvedModules).length },
        'Dependencies resolved'
      );


      // Generate virtual document
      const virtualDoc = this.virtualDocGenerator.generate(
        content,
        resolvedModules,
        variableMap
      );
      logger.debug(
        { uri, lineOffset: virtualDoc.lineOffset },
        'Virtual document generated'
      );

      // Add to Tern for analysis
      this.ternManager.addFile(uri, virtualDoc.code);

      // Cache document analysis
      this.documents.set(uri, {
        originalContent: content,
        virtualDoc: virtualDoc.code,
        lineOffset: virtualDoc.lineOffset,
        dependencies,
        resolvedModules,
        variableMap,
        analyzedAt: new Date().toISOString(),
        wiki
      });

      logger.info(
        { uri, deps: dependencies.length, modules: Object.keys(resolvedModules).length },
        'Document analysis complete'
      );

      return {
        success: true,
        uri,
        lineOffset: virtualDoc.lineOffset,
        dependencies: dependencies,
        resolvedModules: Object.keys(resolvedModules).length
      };

    } catch (error) {
      logger.error({ uri, error: error.message }, 'Document analysis failed');
      throw error;
    }
  }

  /**
   * Get completions for a position in a document
   * @param {string} uri - Document URI
   * @param {number} line - Line number (0-based)
   * @param {number} ch - Character position (0-based)
   * @returns {Promise<Array>} Completion items
   */
  async getCompletions(uri, line, ch) {
    try {
      const docAnalysis = this.documents.get(uri);
      if (!docAnalysis) {
        logger.warn({ uri }, 'Document not analyzed, skipping completion');
        return [];
      }

      // Map original line to virtual document line
      const virtualLine = line + docAnalysis.lineOffset;

      // Get completions from Tern
      const completions = await this.ternManager.getCompletions(uri, virtualLine, ch);

      logger.debug(
        { uri, line, ch, count: completions.length },
        'Completions retrieved'
      );

      return completions;

    } catch (error) {
      logger.error(
        { uri, line, ch, error: error.message },
        'Failed to get completions'
      );
      return [];
    }
  }

  /**
   * Get hover information for a position
   * @param {string} uri - Document URI
   * @param {number} line - Line number (0-based)
   * @param {number} ch - Character position (0-based)
   * @returns {Promise<Object>} Hover information
   */
  async getHover(uri, line, ch) {
    try {
      const docAnalysis = this.documents.get(uri);
      if (!docAnalysis) {
        logger.warn({ uri }, 'Document not analyzed, skipping hover');
        return null;
      }

      // Map to virtual document
      const virtualLine = line + docAnalysis.lineOffset;

      // Get hover from Tern
      const hover = await this.ternManager.getHover(uri, virtualLine, ch);

      logger.debug({ uri, line, ch }, 'Hover information retrieved');
      return hover;

    } catch (error) {
      logger.error(
        { uri, line, ch, error: error.message },
        'Failed to get hover'
      );
      return null;
    }
  }

  /**
   * Get go-to-definition for a position
   * @param {string} uri - Document URI
   * @param {number} line - Line number (0-based)
   * @param {number} ch - Character position (0-based)
   * @returns {Promise<Object>} Definition location
   */
  async getDefinition(uri, line, ch) {
    try {
      const docAnalysis = this.documents.get(uri);
      if (!docAnalysis) {
        logger.warn({ uri }, 'Document not analyzed, skipping definition');
        return null;
      }

      // Map to virtual document
      const virtualLine = line + docAnalysis.lineOffset;

      // Get definition from Tern
      const definition = await this.ternManager.getDefinition(uri, virtualLine, ch);

      if (definition) {
        // Map virtual line back to original
        definition.range.start.line = this.virtualDocGenerator.mapLineToOriginal(
          definition.range.start.line,
          docAnalysis.lineOffset
        );
        definition.range.end.line = this.virtualDocGenerator.mapLineToOriginal(
          definition.range.end.line,
          docAnalysis.lineOffset
        );
      }

      logger.debug({ uri, line, ch }, 'Definition retrieved');
      return definition;

    } catch (error) {
      logger.error(
        { uri, line, ch, error: error.message },
        'Failed to get definition'
      );
      return null;
    }
  }

  /**
   * Remove document from analysis cache
   * @param {string} uri - Document URI
   */
  removeDocument(uri) {
    this.documents.delete(uri);
    this.ternManager.removeFile(uri);
    logger.debug({ uri }, 'Document removed from analysis');
  }

  /**
   * Get analyzer statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      documentsAnalyzed: this.documents.size,
      ternStats: this.ternManager.getStats(),
      documents: Array.from(this.documents.entries()).map(([uri, analysis]) => ({
        uri,
        size: analysis.originalContent.length,
        dependencies: analysis.dependencies.length,
        analyzedAt: analysis.analyzedAt
      }))
    };
  }

  /**
   * Private: Extract dependencies from code
   */
  _extractDependencies(content) {
    const dependencies = [];

    // Match require() calls
    const requireRegex = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match;

    while ((match = requireRegex.exec(content)) !== null) {
      dependencies.push({
        ref: match[1],
        type: 'module',
        position: match.index
      });
    }

    // Match requireData() calls with string literals
    // Also match cases where the module name is a variable (e.g. requireData(moduleName))
    const requireDataRegex = /requireData\s*\(\s*["']([^"']+)["']\s*\)|requireData\s*\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)/g;

    while ((match = requireDataRegex.exec(content)) !== null) {
      if (match[1]) {
        // String literal case
        dependencies.push({
          ref: match[1],
          type: 'data',
          position: match.index
        });
      } else if (match[2]) {
        // Variable reference case - we can't resolve this statically, but we can track it
        dependencies.push({
          ref: match[2],
          type: 'data-variable',
          position: match.index
        });
      }
    }

    return dependencies;
  }

  /**
   * Private: Extract variable to module mappings
   */
  _extractVariableMappings(content) {
    const mappings = [];

    // Match: const varName = "Module:Name"
    const constRegex = /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*["']([^"']+)["']/g;
    let match;

    while ((match = constRegex.exec(content)) !== null) {
      mappings.push({
        variable: match[1],
        moduleUri: match[2]
      });
    }

    return mappings;
  }

  /**
   * Private: Resolve all dependencies for a document
   */
  async _resolveDependencies(dependencies, wiki, variableMap, workspace) {
    const resolved = {};

    // Prepare batch resolve requests
    const moduleRefs = dependencies.map(dep => {
      if (dep.type === 'data-variable') {
        // Try taking module name from variable mappings
        const mapping = variableMap.find(m => m.variable === dep.ref);
        if (mapping) {
          return {
            ref: mapping.moduleUri,
            type: 'data'
          };
        }
      }

      return ({
        ref: dep.ref,
        type: dep.type
      })
    });

    if (moduleRefs.length === 0) {
      return resolved;
    }

    // Batch resolve using workspace cache
    const results = await this.moduleResolver.resolveModulesBatch(wiki, moduleRefs, workspace);

    // Index results by URI for virtual doc generation
    results.forEach((result, index) => {
      if (result.exists && result.content) {
        // Create URI from module info
        const uri = `wiki://${wiki}/${result.type.charAt(0).toUpperCase() + result.type.slice(1)}:${result.moduleName}`;
        resolved[uri] = result.content;
      }
    });

    return resolved;
  }
}

/**
 * Create a document analyzer instance
 */
function createDocumentAnalyzer(config) {
  return new DocumentAnalyzer(config);
}

module.exports = {
  DocumentAnalyzer,
  createDocumentAnalyzer
};
