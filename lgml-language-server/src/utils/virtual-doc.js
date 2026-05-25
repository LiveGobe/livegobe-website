/**
 * Virtual Document Generator for Tern.js
 * Injects module definitions and generates wrapper code for type analysis
 */

const { getLogger } = require('../logging/logger');

let logger;

class VirtualDocumentGenerator {
  constructor(config) {
    this.config = config;
    logger = getLogger();
  }

  /**
   * Generate virtual document from user code and resolved modules
   * @param {string} userCode - Original user code
   * @param {Object} resolvedModules - Map of module URIs to their content
   * @param {Array} variableMap - Variable to module name mappings
   * @returns {Object} Virtual document with line offset mapping
   */
  generate(userCode, resolvedModules = {}, variableMap = []) {
    let virtualCode = '';
    let lineOffset = 0;

    // Add base frame
    virtualCode += '// @ts-check\n';
    virtualCode += '/** @type {Object} */\n';
    virtualCode += 'var exports = {};\n';
    virtualCode += '/** @type {Object} */\n';
    virtualCode += 'var frame = { cache: {} };\n';
    lineOffset += 5;

    // Add module definitions
    const moduleLines = this._injectModules(resolvedModules);
    virtualCode += moduleLines.code;
    lineOffset += moduleLines.count;

    // Add variable mappings
    // const varLines = this._injectVariableMappings(variableMap);
    // virtualCode += varLines.code;
    // lineOffset += varLines.count;

    // Transform user code to use virtual module references
    const transformedCode = this._transformUserCode(userCode, Object.keys(resolvedModules), variableMap);
    virtualCode += transformedCode.code;

    logger.debug(
      {
        totalLines: virtualCode.split('\n').length,
        lineOffset,
        modules: Object.keys(resolvedModules).length,
        variableMappings: variableMap.length
      },
      'Virtual document generated'
    );

    return {
      code: virtualCode,
      lineOffset,
      mappings: {
        modules: Object.keys(resolvedModules),
        variables: variableMap,
        userCodeStart: lineOffset
      }
    };
  }

  /**
   * Map a position from virtual document back to original user code
   * @param {number} virtualLine - Line in virtual document
   * @param {number} lineOffset - Offset from generate()
   * @returns {number} Mapped line in original code
   */
  mapLineToOriginal(virtualLine, lineOffset) {
    return Math.max(0, virtualLine - lineOffset);
  }

  /**
   * Map a position from original user code to virtual document
   * @param {number} originalLine - Line in original code
   * @param {number} lineOffset - Offset from generate()
   * @returns {number} Mapped line in virtual document
   */
  mapLineToVirtual(originalLine, lineOffset) {
    return originalLine + lineOffset;
  }

  /**
   * Private: Inject module definitions into virtual code
   */
  _injectModules(resolvedModules) {
    let code = '';
    let count = 0;

    for (const [uri, content] of Object.entries(resolvedModules)) {
      if (!content) continue;

      // Create a safe variable name from the URI
      const varName = this._uriToVarName(uri);

      if (varName.startsWith('__mod_Data_')) {
        // For data modules, export the content directly without wrapping in an IIFE
        code += `var ${varName} = ${content};\n`;
        count += content.split('\n').length; // Content + declaration
      } else {

        // Wrap module in an IIFE to capture exports
        code += `\nvar ${varName} = (function() {\n`;
        code += `${content.replace(/exports\s*=\s*/g, 'return ')}\n`;
        code += `})();\n`;

        count += content.split('\n').length + 3; // Content + wrapper
      }
    }

    return { code, count };
  }

  /**
   * Private: Inject variable to module mappings
   */
  _injectVariableMappings(variableMap) {
    let code = '';
    let count = 0;

    for (const { variable, moduleUri } of variableMap) {
      const varName = this._uriToVarName(moduleUri);
      code += `var ${variable} = ${varName};\n`;
      count += 1;
    }

    return { code, count };
  }

  /**
   * Private: Transform user code to replace require() calls
   */
  _transformUserCode(userCode, moduleUris, variableMap) {
    let transformed = userCode;
    const lines = userCode.split('\n').length;

    // Replace require('Module:X') with __mod_Module_X reference
    moduleUris.forEach(uri => {
      const varName = this._uriToVarName(uri);

      // Construct regex to find the module name
      const moduleName = this._extractModuleName(uri);

      // Replace require() calls
      const requireRegex = new RegExp(
        `await require\\s*\\(\\s*['"](${moduleName}|Module:${moduleName})['"\\s]*\\)`,
        'g'
      );

      // Replace requireData() calls
      const requireDataRegex = new RegExp(
        `await requireData\\s*\\(\\s*['"](${moduleName}|Module:${moduleName})['"\\s]*\\)`,
        'g'
      );

      // Replace requireData(VARIABLE) calls
      const requireDataVarRegex = new RegExp(
        `await requireData\\s*\\(\\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\)`,
        'g'
      );

      transformed = transformed.replace(requireRegex, varName);
      transformed = transformed.replace(requireDataRegex, varName);

      // Make sure we only replace variable references that match the module URI
      transformed = transformed.replace(requireDataVarRegex, (match, p1) => {
        // Check if the variable matches the module URI in the variable map
        const mapping = variableMap.find(({ variable, moduleUri }) => variable === p1 && moduleName === `Data:${moduleUri}`);
        if (mapping) {
          return varName;
        }
        return match; // No change if it doesn't match
      });
    });

    return {
      code: transformed,
      lineCount: lines
    };
  }

  /**
   * Private: Convert URI to safe variable name
   */
  _uriToVarName(uri) {
    // Extract module name from URI
    const moduleName = this._extractModuleName(uri);

    // Replace non-alphanumeric with underscore
    const safe = moduleName.replace(/[^a-zA-Z0-9]/g, '_');

    return `__mod_${safe}`;
  }

  /**
   * Private: Extract module name from URI
   */
  _extractModuleName(uri) {
    // Handle wiki:///Module:Items format
    if (uri.includes('Module:')) {
      const match = uri.match(/Module:(.+?)$/);
      return match ? match[1] : uri;
    }

    // Handle other formats
    return uri.split('/').pop();
  }

  /**
   * Get statistics about virtual document generation
   */
  getStats() {
    return {
      status: 'initialized'
    };
  }
}

/**
 * Create a virtual document generator instance
 */
function createVirtualDocumentGenerator(config) {
  return new VirtualDocumentGenerator(config);
}

module.exports = {
  VirtualDocumentGenerator,
  createVirtualDocumentGenerator
};
