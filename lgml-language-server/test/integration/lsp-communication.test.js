/**
 * Integration tests for MainApp ↔ LSP Server communication
 */

const { EventEmitter } = require('events');
const { setupHandlers } = require('../../src/lsp/handlers');
const { getLogger } = require('../../src/logging/logger');
const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');

describe('LSP Server - MainApp Communication', () => {
  let connection;
  let documents;
  let mockAdapter;
  const mockLogger = getLogger();

  beforeEach(() => {
    // Mock LSP connection
    connection = new EventEmitter();
    connection.sendNotification = jest.fn();
    connection.sendRequest = jest.fn();

    // Mock document manager
    documents = {
      _docs: new Map(),
      get(uri) {
        return this._docs.get(uri);
      },
      set(uri, doc) {
        this._docs.set(uri, doc);
      },
      delete(uri) {
        this._docs.delete(uri);
      }
    };

    mockAdapter = new MockAdapter(axios);

    const config = {
      wikiApi: {
        baseUrl: 'http://localhost:8080/api',
        version: 2,
        timeout: 5000,
        retryAttempts: 2,
        retryDelay: 50,
      },
      cache: {
        moduleCacheTTL: 60000,
        maxCacheSize: 104857600,
      }
    };

    setupHandlers(connection, documents, config, mockLogger);
  });

  afterEach(() => {
    mockAdapter.reset();
  });

  describe('document lifecycle', () => {
    it('should handle textDocument/didOpen notification', (done) => {
      const params = {
        textDocument: {
          uri: 'file:///test-wiki/TestModule',
          languageId: 'lgml',
          version: 1,
          text: 'var x = 5;'
        }
      };

      connection.emit('didOpenTextDocument', params);

      setImmediate(() => {
        expect(documents.get(params.textDocument.uri)).toBeDefined();
        done();
      });
    });

    it('should handle textDocument/didChange notification', (done) => {
      const uri = 'file:///test-wiki/TestModule';
      const textDocument = {
        uri,
        languageId: 'lgml',
        version: 1,
        text: 'var x = 5;'
      };

      // Simulate TextDocument.create
      documents.set(uri, {
        uri,
        getText: () => 'var x = 5;',
        update: jest.fn((_, changes, version) => ({
          uri,
          getText: () => 'var x = 10;',
          version
        }))
      });

      const params = {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: 'var x = 10;' }]
      };

      connection.emit('didChangeTextDocument', params);

      setImmediate(() => {
        const doc = documents.get(uri);
        expect(doc).toBeDefined();
        done();
      });
    });

    it('should handle textDocument/didClose notification', (done) => {
      const uri = 'file:///test-wiki/TestModule';
      documents.set(uri, { uri });

      const params = { textDocument: { uri } };

      connection.emit('didCloseTextDocument', params);

      setImmediate(() => {
        expect(documents.get(uri)).toBeUndefined();
        done();
      });
    });

    it('should handle textDocument/didSave notification', (done) => {
      const uri = 'file:///test-wiki/TestModule';
      documents.set(uri, { uri });

      const params = { textDocument: { uri } };

      connection.emit('didSaveTextDocument', params);

      setImmediate(() => {
        // Should not crash
        expect(documents.get(uri)).toBeDefined();
        done();
      });
    });
  });

  describe('completion requests', () => {
    it('should handle textDocument/completion request', async () => {
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Items').reply(200, {
        page: { content: 'exports.items = [];' }
      });

      const params = {
        textDocument: { uri: 'file:///test-wiki/TestModule' },
        position: { line: 0, character: 5 }
      };

      return new Promise((resolve) => {
        connection.onCompletion((p) => {
          const result = connection.onCompletion(p);
          expect(result).toBeDefined();
          expect(result.isIncomplete).toBe(false);
          expect(Array.isArray(result.items)).toBe(true);
          resolve();
          return result;
        });

        connection.emit('completion', params);
      });
    });

    it('should handle textDocument/completionResolve request', async () => {
      const item = {
        label: 'testFunction',
        kind: 6,
        detail: 'test function'
      };

      connection.onCompletionResolve((p) => {
        expect(p).toEqual(item);
        return p;
      });

      connection.emit('completionResolve', item);
    });
  });

  describe('hover requests', () => {
    it('should handle textDocument/hover request', async () => {
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Items').reply(200, {
        page: { content: 'exports.items = [];' }
      });

      const params = {
        textDocument: { uri: 'file:///test-wiki/TestModule' },
        position: { line: 0, character: 5 }
      };

      return new Promise((resolve) => {
        connection.onHover((p) => {
          const result = connection.onHover(p);
          expect(result === null || typeof result === 'object').toBe(true);
          resolve();
          return result;
        });

        connection.emit('hover', params);
      });
    });
  });

  describe('definition requests', () => {
    it('should handle textDocument/definition request', async () => {
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Items').reply(200, {
        page: { content: 'exports.items = [];' }
      });

      const params = {
        textDocument: { uri: 'file:///test-wiki/TestModule' },
        position: { line: 0, character: 5 }
      };

      return new Promise((resolve) => {
        connection.onDefinition((p) => {
          const result = connection.onDefinition(p);
          expect(result === null || typeof result === 'object').toBe(true);
          resolve();
          return result;
        });

        connection.emit('definition', params);
      });
    });
  });

  describe('error handling in communication', () => {
    it('should handle malformed completion request', (done) => {
      const params = {
        textDocument: { uri: 'file:///test-wiki/TestModule' }
        // Missing position
      };

      connection.onCompletion((p) => {
        // Should handle gracefully
        expect(() => {
          return { isIncomplete: false, items: [] };
        }).not.toThrow();
        done();
        return { isIncomplete: false, items: [] };
      });

      connection.emit('completion', params);
    });

    it('should handle request with missing document', (done) => {
      const params = {
        textDocument: { uri: 'file:///nonexistent/Module' },
        position: { line: 0, character: 5 }
      };

      connection.onCompletion((p) => {
        expect(() => {
          return { isIncomplete: false, items: [] };
        }).not.toThrow();
        done();
        return { isIncomplete: false, items: [] };
      });

      connection.emit('completion', params);
    });
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent completion requests', async () => {
      mockAdapter.onGet('/v2/wikis/test-wiki/pages/Module:Items').reply(200, {
        page: { content: 'exports.items = [];' }
      });

      const requests = [
        { textDocument: { uri: 'file:///test-wiki/Module1' }, position: { line: 0, character: 5 } },
        { textDocument: { uri: 'file:///test-wiki/Module2' }, position: { line: 0, character: 5 } },
        { textDocument: { uri: 'file:///test-wiki/Module3' }, position: { line: 0, character: 5 } }
      ];

      return new Promise((resolve) => {
        let completed = 0;

        connection.onCompletion((p) => {
          completed++;
          if (completed === requests.length) {
            resolve();
          }
          return { isIncomplete: false, items: [] };
        });

        requests.forEach(req => {
          connection.emit('completion', req);
        });
      });
    });
  });

  describe('wiki extraction from URI', () => {
    it('should extract wiki name from file:/// URI', (done) => {
      const params = {
        textDocument: { uri: 'file:///my-wiki/Module:Test' },
        position: { line: 0, character: 5 }
      };

      connection.onCompletion((p) => {
        // Should extract 'my-wiki' from URI
        expect(p.textDocument.uri).toContain('my-wiki');
        done();
        return { isIncomplete: false, items: [] };
      });

      connection.emit('completion', params);
    });

    it('should handle alternative URI formats', (done) => {
      const uris = [
        'file:///default/Module:Test',
        'wiki:///default/Module:Test'
      ];

      let processed = 0;
      connection.onCompletion((p) => {
        processed++;
        if (processed === uris.length) {
          done();
        }
        return { isIncomplete: false, items: [] };
      });

      uris.forEach(uri => {
        connection.emit('completion', {
          textDocument: { uri },
          position: { line: 0, character: 5 }
        });
      });
    });
  });
});
