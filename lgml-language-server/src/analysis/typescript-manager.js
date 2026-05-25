/**
 * TypeScript Language Service Engine
 * Provides type inference, completions, hover info, and go-to-definition
 * Replaces Tern.js with TypeScript's language service for better analysis
 */

const ts = require('typescript');
const fs = require('fs');
const { getLogger } = require('../logging/logger');
const path = require('path');

let logger;
const tsLibPath = path.dirname(require.resolve('typescript'));

class TypeScriptManager {
    constructor(config) {
        this.config = config;
        logger = getLogger();

        // TypeScript compiler options
        this.compilerOptions = {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            moduleResolution: ts.ModuleResolutionKind.Node10,
            moduleDetection: ts.ModuleDetectionKind.Legacy,
            getIsolatedModules: true,

            allowJs: true,
            checkJs: true,
            allowNonTsExtensions: true,

            strict: false,
            noImplicitAny: false,

            esModuleInterop: true,
            allowSyntheticDefaultImports: true,

            skipLibCheck: true,

            lib: [
                'lib.es2022.d.ts',
                'lib.dom.d.ts'
            ]
        };

        // Initialize language service host
        this.files = new Map();
        this.host = this._createLanguageServiceHost();
        this.languageService = ts.createLanguageService(
            this.host,
            ts.createDocumentRegistry()
        );

        // Custom LGML type definitions
        this._initializeLgmlDefinitions();

        logger.info(
            { tsVersion: ts.version },
            'TypeScript manager initialized'
        );
    }

    /**
     * Create the language service host
     * @private
     */
    _createLanguageServiceHost() {
        const self = this;

        return {
            getScriptFileNames() {
                return [
                    ...Array.from(self.files.keys()),
                    path.join(tsLibPath, 'lib.es2022.d.ts'),
                    path.join(tsLibPath, 'lib.dom.d.ts'),
                ]
            },

            getScriptVersion(fileName) {
                const file = self.files.get(fileName);
                if (file) {
                    return file.version.toString();
                }

                // For standard library definitions, a static version or a installation-bound hash works perfectly.
                // Since these node_modules files never change during runtime, '1' is safe, 
                // but separating them from your fallback '0' ensures TypeScript explicitly tracks them.
                if (fileName.includes('lib.') && fileName.endsWith('.d.ts')) {
                    return '1';
                }

                return '0';
            },

            getScriptSnapshot(fileName) {
                const file = self.files.get(fileName);

                // 1. If the file exists in our in-memory LSP cache, use it
                if (file) {
                    return ts.ScriptSnapshot.fromString(file.content);
                }

                // 2. Fallback: Use our existing readFile logic to resolve standard lib paths on disk
                const content = this.readFile(fileName);
                if (content !== undefined) {
                    return ts.ScriptSnapshot.fromString(content);
                }

                return undefined;
            },

            getDefaultLibFileName() {
                return ts.getDefaultLibFilePath(self.compilerOptions);
            },

            getCurrentDirectory() {
                return process.cwd();
            },

            getDirectories() {
                return [];
            },

            fileExists(fileName) {
                return (
                    self.files.has(fileName) ||
                    fs.existsSync(fileName)
                );
            },

            readFile(fileName) {
                const file = self.files.get(fileName);

                if (file) {
                    return file.content;
                }

                // 2. INTERCEPT: If it's a standard lib file name, point it to the node_modules path
                let targetPath = fileName;
                if (fileName.startsWith('lib.') && fileName.endsWith('.d.ts')) {
                    // If it isn't already an absolute path, join it with the TS lib folder
                    if (!path.isAbsolute(fileName)) {
                        targetPath = path.join(tsLibPath, fileName);
                    }
                }

                try {
                    return fs.readFileSync(
                        targetPath, // Use the corrected path
                        'utf8'
                    );
                } catch {
                    return undefined;
                }
            },

            readDirectory() {
                return [];
            },

            directoryExists() {
                return true;
            },

            getCompilationSettings() {
                return self.compilerOptions;
            },

            getNewLine() {
                return '\n';
            },

            getScriptKind(fileName) {
                if (fileName.endsWith('.js')) {
                    return ts.ScriptKind.JS;
                }

                if (fileName.endsWith('.ts')) {
                    return ts.ScriptKind.TS;
                }

                if (fileName.endsWith('.d.ts')) {
                    return ts.ScriptKind.TS;
                }

                return ts.ScriptKind.JS;
            },

            useCaseSensitiveFileNames() {
                return true;
            },

            realpath(path) {
                return path;
            }
        };
    }

    /**
     * Add or update a file
     * @param {string} uri - File URI (e.g., "wiki:///Module:Items")
     * @param {string} content - File content
     */
    addFile(uri, content) {
        uri = this._normalizeFileName(uri);

        try {
            // Store file content
            const existingFile = this.files.get(uri);
            this.files.set(uri, {
                uri,
                content,
                version: existingFile ? existingFile.version + 1 : 1,
                addedAt: new Date().toISOString(),
                size: content.length
            });

            logger.debug(
                { uri, size: content.length },
                'File added to TypeScript manager'
            );

        } catch (error) {
            logger.error(
                { uri, error: error.message },
                'Failed to add file to TypeScript manager'
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
        uri = this._normalizeFileName(uri);

        try {
            const file = this.files.get(uri);

            if (!file) {
                logger.debug({ uri }, 'File not found for completions');
                return [];
            }

            const program = this.languageService.getProgram();

            if (!program) {
                logger.error({ uri }, 'TypeScript program not available');
                return [];
            }

            const sourceFile = program.getSourceFile(uri);

            if (!sourceFile) {
                logger.error({ uri }, 'Source file not found');
                return [];
            }

            // Convert line/character -> absolute offset
            const position = ts.getPositionOfLineAndCharacter(
                sourceFile,
                line,
                ch
            );

            // Extract current identifier prefix
            let start = position;

            while (
                start > 0 &&
                /[A-Za-z0-9_$]/.test(
                    sourceFile.text[start - 1]
                )
            ) {
                start--;
            }

            const prefix = sourceFile.text.slice(start, position);

            // Get TS completions
            const completions =
                this.languageService.getCompletionsAtPosition(
                    uri,
                    position,
                    {
                        includeCompletionsForModuleExports: true,
                        includeCompletionsWithInsertText: true,
                        includeCompletionsWithSnippetText: false,
                        includeAutomaticOptionalChainCompletions: true
                    }
                );

            if (!completions || !completions.entries) {
                logger.debug(
                    { uri, line, ch },
                    'No completions found'
                );

                return [];
            }

            const token = ts.getTokenAtPosition(sourceFile, position);

            // Check if the current context is actually accessing a property member.
            const isMemberCompletion = !!(
                completions.isMemberCompletion ||
                (token && (ts.isPropertyAccessExpression(token) || ts.isPropertyAccessExpression(token.parent)))
            );

            // Rank completions
            const rankedEntries = completions.entries
                .filter(entry => {
                    // 1. Remove TS internals
                    if (entry.name.startsWith('__')) {
                        return false;
                    }

                    // 2. Remove global constructors/interfaces/modules from leaking into property access lists
                    if (isMemberCompletion) {
                        if (
                            entry.kind === ts.ScriptElementKind.interfaceElement ||
                            entry.kind === ts.ScriptElementKind.classElement ||
                            entry.kind === ts.ScriptElementKind.moduleElement ||
                            entry.name === 'Symbol'
                        ) {
                            return false;
                        }
                    }

                    // 3. Filter out raw global DOM properties if not explicitly typing them
                    if (!isMemberCompletion && prefix.length === 0) {
                        const noisyGlobals = ['addEventListener', 'removeEventListener', 'dispatchEvent', 'blur', 'focus'];
                        if (noisyGlobals.includes(entry.name)) return false;
                    }

                    // 4. Filter out type-only declaration keywords when looking for executable variables
                    if (entry.kind === ts.ScriptElementKind.keyword && !isMemberCompletion) {
                        const noiseKeywords = ['abstract', 'declare', 'module', 'namespace', 'readonly', 'type'];
                        if (noiseKeywords.includes(entry.name)) return false;
                    }

                    // 5. Text Substring / Prefix Filtering (Keep this at the bottom of the filters)
                    if (prefix.length > 0) {
                        return entry.name
                            .toLowerCase()
                            .includes(prefix.toLowerCase());
                    }

                    return true;
                })
                .map(entry => {
                    let score = 10000; // Shift baseline score to avoid negative numbers during demotions

                    const name = entry.name;
                    const lowerName = name.toLowerCase();
                    const lowerPrefix = prefix.toLowerCase();

                    // =========================
                    // CASE-SENSITIVE MATCHES
                    // =========================

                    if (name === prefix) {
                        score += 5000;
                    }
                    else if (name.startsWith(prefix)) {
                        score += 2500;
                    }
                    else if (name.includes(prefix)) {
                        score += 1000;
                    }

                    // =========================
                    // CASE-INSENSITIVE MATCHES
                    // =========================

                    if (lowerName === lowerPrefix) {
                        score += 500;
                    }
                    else if (lowerName.startsWith(lowerPrefix)) {
                        score += 250;
                    }
                    else if (lowerName.includes(lowerPrefix)) {
                        score += 100;
                    }

                    // =========================
                    // CONTEXTUAL TYPE CORRECTIONS
                    // =========================
                    if (isMemberCompletion) {
                        // Demote async keywords (catch/then/finally) from synchronous object evaluation lists
                        const asyncKeywords = ['catch', 'finally', 'then'];
                        if (asyncKeywords.includes(lowerName)) {
                            score -= 4000;
                        }

                        // Aggressively boost native synchronous prototype properties (like string/object properties)
                        const stringPrimitives = ['tolowercase', 'touppercase', 'split', 'replace', 'slice', 'includes'];
                        if (stringPrimitives.includes(lowerName)) {
                            score += 3000;
                        }
                    }

                    // =========================
                    // KIND PRIORITY
                    // =========================

                    switch (entry.kind) {
                        case ts.ScriptElementKind.localVariableElement:
                        case ts.ScriptElementKind.variableElement:
                            score += 50;
                            break;

                        case ts.ScriptElementKind.functionElement:
                        case ts.ScriptElementKind.memberFunctionElement:
                            score += 40;
                            break;

                        case ts.ScriptElementKind.classElement:
                            score += 30;
                            break;
                    }

                    // =========================
                    // AUTO-IMPORT DEPRIORITIZATION
                    // =========================
                    if (entry.source) {
                        score -= 2000;
                    }

                    return {
                        entry,
                        score
                    };
                })
                .sort((a, b) => b.score - a.score)
                .slice(0, 100);

            // Convert TS -> LSP
            const result = rankedEntries.map(({ entry, score }) => {
                let documentation = '';
                let detail = entry.kindModifiers || '';

                // Generate a padded string prefix so the client editor sorts by your calculated score descending.
                // Subtracting from a high baseline ensures high scores sort alphabetically first (e.g., "05000" before "15000").
                const sortKey = String(Math.max(0, 30000 - score)).padStart(5, '0');
                const sortText = `${sortKey}_${entry.sortText || entry.name}`;

                try {
                    const details =
                        this.languageService.getCompletionEntryDetails(
                            uri,
                            position,
                            entry.name,
                            {},
                            entry.source,
                            {},
                            undefined
                        );

                    if (details) {
                        documentation =
                            ts.displayPartsToString(
                                details.documentation || []
                            );

                        detail =
                            ts.displayPartsToString(
                                details.displayParts || []
                            );
                    }
                } catch (e) {
                    // Ignore detail failures
                }

                return {
                    label: entry.name,
                    kind: this._getTsCompletionKind(entry.kind),
                    detail,
                    documentation,
                    sortText,
                    filterText: entry.name,
                    insertText: entry.insertText || entry.name
                };
            });

            logger.debug(
                {
                    uri,
                    line,
                    ch,
                    prefix,
                    count: result.length
                },
                'Completions retrieved'
            );

            return result;

        } catch (error) {
            logger.error(
                {
                    uri,
                    line,
                    ch,
                    error: error.stack || error.message
                },
                'Completion request failed'
            );

            return [];
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
        uri = this._normalizeFileName(uri);

        try {
            const file = this.files.get(uri);
            if (!file) {
                logger.debug({ uri }, 'File not found for type info');
                return null;
            }

            const program = this.languageService.getProgram();
            if (!program) {
                logger.error({ uri }, 'TypeScript program not available');
                return null;
            }

            const sourceFile = program.getSourceFile(uri);
            if (!sourceFile) {
                logger.error({ uri }, 'Source file not found');
                return null;
            }

            // Convert line/character -> absolute offset
            const position = ts.getPositionOfLineAndCharacter(
                sourceFile,
                line,
                ch
            );

            // --- TAKEN FROM GETCOMPLETIONS: Extract current identifier prefix ---
            let start = position;
            while (
                start > 0 &&
                /[A-Za-z0-9_$]/.test(
                    sourceFile.text[start - 1]
                )
            ) {
                start--;
            }

            const prefix = sourceFile.text.slice(start, position);
            // ------------------------------------------------------------------

            // Get quickinfo (type information) from TypeScript using the derived position
            const quickInfo = this.languageService.getQuickInfoAtPosition(uri, position);

            if (!quickInfo) {
                logger.debug({ uri, line, ch, prefix }, 'No type information found');
                return null;
            }

            const typeInfo = {
                type: ts.displayPartsToString(quickInfo.displayParts),
                doc: quickInfo.documentation ? ts.displayPartsToString(quickInfo.documentation) : '',
                kind: quickInfo.kind,
                kindModifiers: quickInfo.kindModifiers || '',
                prefix: prefix // Optional: Included if you want to know what identifier matched this type
            };

            logger.debug(
                { uri, line, ch, type: typeInfo.type, prefix },
                'Type information retrieved'
            );

            return typeInfo;

        } catch (error) {
            logger.error(
                { uri, line, ch, error: error.message },
                'Type request failed'
            );
            return null;
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
            if (!typeInfo) return null;

            const textParts = [
                // Raw type signature layout
                typeInfo.type
            ];

            // Add a clean textual separator and the description block if available
            if (typeInfo.doc) {
                textParts.push('━━━━━━━━━');
                textParts.push(typeInfo.doc);
            }

            return {
                contents: textParts.join('\n') // Flattens everything into a single plain text string
            };
        } catch (error) {
            logger.error({ uri, line, ch, error: error.message }, 'Hover request failed');
            return null;
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
        uri = this._normalizeFileName(uri);

        try {
            const file = this.files.get(uri);
            if (!file) {
                logger.debug({ uri }, 'File not found for definition');
                return null;
            }

            const program = this.languageService.getProgram();
            if (!program) {
                logger.error({ uri }, 'TypeScript program not available');
                return null;
            }

            const sourceFile = program.getSourceFile(uri);
            if (!sourceFile) {
                logger.error({ uri }, 'Source file not found');
                return null;
            }

            // Convert line/character -> absolute offset
            const position = ts.getPositionOfLineAndCharacter(
                sourceFile,
                line,
                ch
            );

            // Get definition from TypeScript
            const definitions = this.languageService.getDefinitionAtPosition(uri, position);

            if (!definitions || definitions.length === 0) {
                logger.debug({ uri, line, ch }, 'No definition found');
                return null;
            }

            // Use the first definition
            const definition = definitions[0];

            // Get the source file for the definition
            const defSourceFile = program.getSourceFile(definition.fileName);
            if (!defSourceFile) {
                return null;
            }

            // Convert text span to line/character
            const defStart = ts.getLineAndCharacterOfPosition(
                defSourceFile,
                definition.textSpan.start
            );

            const defEnd = ts.getLineAndCharacterOfPosition(
                defSourceFile,
                definition.textSpan.start + definition.textSpan.length
            );

            const result = {
                uri: definition.fileName,
                range: {
                    start: { line: defStart.line, character: defStart.character },
                    end: { line: defEnd.line, character: defEnd.character }
                }
            };

            logger.debug(
                { uri, line, ch, defUri: result.uri },
                'Definition found'
            );

            return result;

        } catch (error) {
            logger.error(
                { uri, line, ch, error: error.message },
                'Definition request failed'
            );
            return null;
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
        uri = this._normalizeFileName(uri);

        try {
            const file = this.files.get(uri);
            if (!file) {
                logger.debug({ uri }, 'File not found for signature');
                return null;
            }

            const program = this.languageService.getProgram();
            if (!program) {
                logger.error({ uri }, 'TypeScript program not available');
                return null;
            }

            const sourceFile = program.getSourceFile(uri);
            if (!sourceFile) {
                logger.error({ uri }, 'Source file not found');
                return null;
            }

            // Convert line/character -> absolute offset
            const position = ts.getPositionOfLineAndCharacter(
                sourceFile,
                line,
                ch
            );

            // Get signature help from TypeScript
            const signatureHelp = this.languageService.getSignatureHelpItems(uri, position, {});

            if (!signatureHelp || !signatureHelp.items || signatureHelp.items.length === 0) {
                logger.debug({ uri, line, ch }, 'No signature found');
                return null;
            }

            const sig = signatureHelp.items[0];
            const signature = {
                label: ts.displayPartsToString(sig.prefixDisplayParts) +
                    sig.parameters.map(p => ts.displayPartsToString(p.displayParts)).join(', ') +
                    ts.displayPartsToString(sig.suffixDisplayParts),
                parameters: sig.parameters.map((param, index) => ({
                    label: ts.displayPartsToString(param.displayParts),
                    documentation: param.documentation ? ts.displayPartsToString(param.documentation) : '',
                    index
                })),
                documentation: sig.documentation ? ts.displayPartsToString(sig.documentation) : ''
            };

            logger.debug(
                { uri, line, ch, parameters: signature.parameters.length },
                'Signature retrieved'
            );

            return signature;

        } catch (error) {
            logger.error(
                { uri, line, ch, error: error.message },
                'Signature request failed'
            );
            return null;
        }
    }

    /**
     * Get document symbols (for outline/structure view)
     * @param {string} uri - File URI
     * @returns {Promise<Array>} Document symbols
     */
    async getDocumentSymbols(uri) {
        uri = this._normalizeFileName(uri);

        try {
            const program = this.languageService.getProgram();
            if (!program) {
                logger.error({ uri }, 'TypeScript program not available');
                return [];
            }

            const sourceFile = program.getSourceFile(uri);
            if (!sourceFile) {
                logger.error({ uri }, 'Source file not found');
                return [];
            }

            const symbols = this.languageService.getDocumentSymbols(uri);

            if (!symbols) {
                return [];
            }

            return symbols.map(sym => {
                const symStart = ts.getLineAndCharacterOfPosition(
                    sourceFile,
                    sym.textSpan.start
                );

                const symEnd = ts.getLineAndCharacterOfPosition(
                    sourceFile,
                    sym.textSpan.start + sym.textSpan.length
                );

                return {
                    name: sym.name,
                    kind: sym.kind,
                    location: {
                        uri,
                        range: {
                            start: { line: symStart.line, character: symStart.character },
                            end: { line: symEnd.line, character: symEnd.character }
                        }
                    },
                    containerName: sym.containerName
                };
            });

        } catch (error) {
            logger.error({ uri, error: error.message }, 'Failed to get document symbols');
            return [];
        }
    }

    /**
     * Remove file from TypeScript manager
     * @param {string} uri - File URI
     */
    removeFile(uri) {
        try {
            this.files.delete(uri);
            logger.debug({ uri }, 'File removed from manager');

        } catch (error) {
            logger.error({ uri, error: error.message }, 'Failed to remove file');
            throw error;
        }
    }

    /**
     * Get manager statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            filesTracked: this.files.size,
            totalSize: Array.from(this.files.values()).reduce((sum, f) => sum + f.size, 0),
            files: Array.from(this.files.entries()).map(([uri, meta]) => ({
                uri,
                size: meta.size,
                version: meta.version,
                addedAt: meta.addedAt
            }))
        };
    }

    /**
     * Private: Convert absolute position to line and character
     */
    _getLineAndCharacter(content, position) {
        const lines = content.substring(0, position).split('\n');
        const line = lines.length - 1;
        const character = lines[lines.length - 1].length;

        return { line, character };
    }

    /**
     * Private: Map TypeScript completion kind to LSP completion kind
     */
    _getTsCompletionKind(tsKind) {
        const kindMap = {
            [ts.ScriptElementKind.primitiveType]: 25,
            [ts.ScriptElementKind.keyword]: 14,
            [ts.ScriptElementKind.variable]: 13,
            [ts.ScriptElementKind.localVariable]: 13,
            [ts.ScriptElementKind.function]: 3,
            [ts.ScriptElementKind.localFunction]: 3,
            [ts.ScriptElementKind.method]: 2,
            [ts.ScriptElementKind.class]: 5,
            [ts.ScriptElementKind.interface]: 11,
            [ts.ScriptElementKind.enum]: 10,
            [ts.ScriptElementKind.enumMember]: 20,
            [ts.ScriptElementKind.module]: 9,
            [ts.ScriptElementKind.externalModuleName]: 9,
            [ts.ScriptElementKind.property]: 7,
            [ts.ScriptElementKind.memberVariable]: 7,
            [ts.ScriptElementKind.memberFunction]: 2,
            [ts.ScriptElementKind.memberGetAccessor]: 2,
            [ts.ScriptElementKind.memberSetAccessor]: 2,
            [ts.ScriptElementKind.alias]: 12,
            [ts.ScriptElementKind.type]: 25,
        };

        return kindMap[tsKind] || 1; // Default to Text
    }

    /**
     * Private: Initialize LGML-specific type definitions
     */
    _initializeLgmlDefinitions() {
        // Create a virtual definition file with LGML types
        const lgmlDefs = `
declare function require(name: string): Promise<any>;
declare function requireData(name: string): Promise<Object>;
declare var exports: any;
declare var module: { exports: any };
`;

        this.addFile('lgml-types.d.ts', lgmlDefs);

        try {
            logger.debug('LGML type definitions initialized');
        } catch (error) {
            logger.warn({ error: error.message }, 'Failed to initialize LGML definitions');
        }
    }

    _normalizeFileName(uri) {
        if (!uri.endsWith('.js') && !uri.endsWith('.d.ts')) {
            return `${uri}.js`;
        }

        return uri;
    }
}

/**
 * Create a TypeScript manager instance
 */
function createTypeScriptManager(config) {
    return new TypeScriptManager(config);
}

module.exports = {
    TypeScriptManager,
    createTypeScriptManager
};
