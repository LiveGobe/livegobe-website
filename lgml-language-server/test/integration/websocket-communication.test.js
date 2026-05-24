/**
 * WebSocket + JSON-RPC Communication Tests
 * 
 * Tests socket communication between client and server
 * with JSON-RPC 2.0 message handling
 */

const WebSocket = require('ws');
const LSPWebSocketServer = require('../../src/server/websocket-server');

describe('WebSocket + JSON-RPC Communication', () => {
  let server;
  let wsServer;
  const TEST_PORT = 8765; // Use different port for testing

  beforeAll(async () => {
    // Create test WebSocket server
    wsServer = new LSPWebSocketServer(TEST_PORT, {});
    
    // Mock LSP handlers
    wsServer.setHandlers({
      onCompletion: (params) => ({
        isIncomplete: false,
        items: [
          {
            label: 'require',
            kind: 3,
            detail: 'function',
            documentation: 'Load a module'
          }
        ]
      }),
      onHover: (params) => ({
        contents: {
          language: 'lgml',
          value: 'require(name): any'
        },
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 7 }
        }
      }),
      onDefinition: (params) => ({
        uri: 'wiki:///wiki/Module:Test',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 }
        }
      }),
      onDidOpenTextDocument: (params) => null,
      onDidChangeTextDocument: (params) => null,
      onDidCloseTextDocument: (params) => null
    });

    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    if (wsServer) {
      await wsServer.stop();
    }
  });

  describe('Connection', () => {
    test('client should connect to WebSocket server', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    test('server should handle multiple clients', (done) => {
      const client1 = new WebSocket(`ws://localhost:${TEST_PORT}`);
      const client2 = new WebSocket(`ws://localhost:${TEST_PORT}`);
      let connected = 0;

      const checkDone = () => {
        connected++;
        if (connected === 2) {
          client1.close();
          client2.close();
          setTimeout(done, 50);
        }
      };

      client1.on('open', checkDone);
      client2.on('open', checkDone);

      client1.on('error', (error) => done(error));
      client2.on('error', (error) => done(error));
    });

    test('server should send initialized message on connection', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        expect(message).toMatchObject({
          jsonrpc: '2.0',
          method: 'initialized'
        });
        ws.close();
        done();
      });

      ws.on('error', (error) => done(error));
    });
  });

  describe('JSON-RPC Requests', () => {
    test('completion request should return items', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('open', () => {
        const request = {
          jsonrpc: '2.0',
          id: 1,
          method: 'textDocument/completion',
          params: {
            textDocument: { uri: 'wiki:///test/page' },
            position: { line: 0, character: 0 }
          }
        };
        
        ws.send(JSON.stringify(request));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        // Skip initialized message
        if (message.method === 'initialized') {
          return;
        }

        expect(message).toMatchObject({
          jsonrpc: '2.0',
          id: 1,
          result: expect.objectContaining({
            isIncomplete: false,
            items: expect.any(Array)
          })
        });

        expect(message.result.items.length).toBeGreaterThan(0);
        ws.close();
        done();
      });

      ws.on('error', (error) => done(error));
    });

    test('hover request should return type information', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('open', () => {
        const request = {
          jsonrpc: '2.0',
          id: 2,
          method: 'textDocument/hover',
          params: {
            textDocument: { uri: 'wiki:///test/page' },
            position: { line: 0, character: 5 }
          }
        };
        
        ws.send(JSON.stringify(request));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.method === 'initialized') return;

        expect(message).toMatchObject({
          jsonrpc: '2.0',
          id: 2,
          result: expect.objectContaining({
            contents: expect.any(Object),
            range: expect.any(Object)
          })
        });

        ws.close();
        done();
      });

      ws.on('error', (error) => done(error));
    });

    test('definition request should return location', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('open', () => {
        const request = {
          jsonrpc: '2.0',
          id: 3,
          method: 'textDocument/definition',
          params: {
            textDocument: { uri: 'wiki:///test/page' },
            position: { line: 0, character: 5 }
          }
        };
        
        ws.send(JSON.stringify(request));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.method === 'initialized') return;

        expect(message).toMatchObject({
          jsonrpc: '2.0',
          id: 3,
          result: expect.objectContaining({
            uri: expect.stringContaining('wiki:///')
          })
        });

        ws.close();
        done();
      });

      ws.on('error', (error) => done(error));
    });
  });

  describe('JSON-RPC Notifications', () => {
    test('didOpen notification should be accepted', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('open', () => {
        const notification = {
          jsonrpc: '2.0',
          method: 'textDocument/didOpen',
          params: {
            textDocument: {
              uri: 'wiki:///test/page',
              languageId: 'lgml',
              version: 1,
              text: 'code'
            }
          }
        };
        
        ws.send(JSON.stringify(notification));
        
        // Notification doesn't get response, wait a bit then close
        setTimeout(() => {
          ws.close();
          done();
        }, 100);
      });

      ws.on('error', (error) => done(error));
    });

    test('didChange notification should be accepted', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('open', () => {
        const notification = {
          jsonrpc: '2.0',
          method: 'textDocument/didChange',
          params: {
            textDocument: { uri: 'wiki:///test/page', version: 2 },
            contentChanges: [{ text: 'updated code' }]
          }
        };
        
        ws.send(JSON.stringify(notification));
        
        setTimeout(() => {
          ws.close();
          done();
        }, 100);
      });

      ws.on('error', (error) => done(error));
    });

    test('didClose notification should be accepted', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('open', () => {
        const notification = {
          jsonrpc: '2.0',
          method: 'textDocument/didClose',
          params: {
            textDocument: { uri: 'wiki:///test/page' }
          }
        };
        
        ws.send(JSON.stringify(notification));
        
        setTimeout(() => {
          ws.close();
          done();
        }, 100);
      });

      ws.on('error', (error) => done(error));
    });
  });

  describe('Error Handling', () => {
    test('unknown method should return error', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('open', () => {
        const request = {
          jsonrpc: '2.0',
          id: 10,
          method: 'unknown/method',
          params: {}
        };
        
        ws.send(JSON.stringify(request));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.method === 'initialized') return;

        expect(message).toMatchObject({
          jsonrpc: '2.0',
          id: 10,
          error: expect.objectContaining({
            code: expect.any(Number),
            message: expect.any(String)
          })
        });

        ws.close();
        done();
      });

      ws.on('error', (error) => done(error));
    });

    test('invalid JSON should return parse error', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      
      ws.on('open', () => {
        ws.send('{ invalid json');
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.method === 'initialized') return;

        expect(message).toMatchObject({
          jsonrpc: '2.0',
          error: expect.objectContaining({
            code: -32700,
            message: 'Parse error'
          })
        });

        ws.close();
        done();
      });

      ws.on('error', (error) => done(error));
    });
  });

  describe('Message Sequencing', () => {
    test('multiple requests should get correct responses', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}`);
      const responses = [];

      ws.on('open', () => {
        // Send multiple requests
        for (let i = 1; i <= 3; i++) {
          const request = {
            jsonrpc: '2.0',
            id: i,
            method: 'textDocument/completion',
            params: {
              textDocument: { uri: 'wiki:///test/page' },
              position: { line: 0, character: i }
            }
          };
          ws.send(JSON.stringify(request));
        }
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.method === 'initialized') return;
        if (message.id) {
          responses.push(message.id);
        }

        if (responses.length === 3) {
          // Should have received all 3 responses
          expect(responses.sort()).toEqual([1, 2, 3]);
          ws.close();
          done();
        }
      });

      ws.on('error', (error) => done(error));
    });
  });
});
