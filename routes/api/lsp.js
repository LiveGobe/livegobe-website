/**
 * LSP HTTP Proxy Routes
 *
 * Provides HTTP endpoints for LSP communication.
 * All browser requests go through these endpoints rather than connecting
 * directly to the LSP server.
 */

const express = require('express');
const axios = require('axios');
const WebSocket = require('ws');
const crypto = require('crypto');
const router = express.Router();

const LSP_SERVER_URL = process.env.LSP_SERVER_URL || 'http://localhost:8081';
const WS_URL = process.env.LSP_WEBSOCKET_URL || 'ws://localhost:8081';

// -------------------------
// WebSocket state management
// -------------------------

let ws = null;

const pendingRequests = new Map();

let reconnectAttempts = 0;
let reconnectTimer = null;
let manualClose = false;

const MAX_BACKOFF = 15000; // 15s cap

function connectWebSocket() {
    manualClose = false;

    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
        console.log('Connected to LSP WebSocket server');

        reconnectAttempts = 0;
    });

    ws.on('message', (raw) => {
        try {
            const message = JSON.parse(raw.toString());

            if (message.id == null) return;

            const pending = pendingRequests.get(message.id);
            if (!pending) return;

            pendingRequests.delete(message.id);

            if (message.error) {
                pending.reject(message.error);
            } else {
                pending.resolve(message.result);
            }
        } catch (err) {
            console.error('Failed to process WS message:', err);
        }
    });

    ws.on('close', () => {
        console.error('LSP WebSocket disconnected');
        scheduleReconnect();
    });

    ws.on('error', (err) => {});
}

function scheduleReconnect() {
    if (manualClose) return;
    if (reconnectTimer) return;

    reconnectAttempts++;

    const delay = Math.min(
        1000 * Math.pow(2, reconnectAttempts),
        MAX_BACKOFF
    );

    console.log(`Reconnecting to LSP in ${delay}ms...`);

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWebSocket();
    }, delay);
}

function safeSend(data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('LSP WebSocket not connected');
    }
    ws.send(data);
}

// -------------------------
// Health check endpoint
// -------------------------

router.get('/health', async (req, res) => {
    try {
        const response = await axios.get(`${LSP_SERVER_URL}/health`, { timeout: 5000 });
        return res.json({ status: 'ok', lspServer: response.data });
    } catch (error) {
        return res.status(503).json({
            status: 'error',
            message: 'LSP server is not available',
            error: error.message
        });
    }
});

// -------------------------
// Generic RPC proxy
// -------------------------

router.post('/rpc', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { method, params } = req.body;

    if (!method) {
        return res.status(400).json({ error: 'method is required' });
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return res.status(503).json({
            error: 'LSP server is reconnecting'
        });
    }

    const id = crypto.randomUUID();
    
    // Extract editor ID from params (client-side generated, identifies the editor instance)
    const editorId = params?.editorId || `${req.user.id || 'anonymous'}_${id}`;
    
    // Create enhanced params with server-side context
    const enhancedParams = {
        ...params,
        editorId, // Include editor ID for workspace management
        userId: req.user.id // Include user ID for audit/isolation
    };

    try {
        const result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pendingRequests.delete(id);
                reject(new Error('LSP request timeout'));
            }, 30000);

            pendingRequests.set(id, {
                resolve: (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });

            safeSend(JSON.stringify({
                jsonrpc: '2.0',
                id,
                method,
                params: enhancedParams
            }));
        });

        return res.json(result);
    } catch (error) {
        console.error(`LSP RPC error for method ${method}:`, error);

        return res.status(502).json({
            error: 'Failed to communicate with LSP server',
            message: error.message || String(error)
        });
    }
});

// -------------------------
// Direct LSP HTTP endpoints (unchanged)
// -------------------------

router.post('/completions', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await axios.post(
            `${LSP_SERVER_URL}/rpc`,
            {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'textDocument/completion',
                params: req.body
            },
            { timeout: 30000 }
        );

        return res.json(result.data.result || []);
    } catch (error) {
        return res.status(502).json({
            error: 'Failed to get completions',
            message: error.message
        });
    }
});

router.post('/hover', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await axios.post(
            `${LSP_SERVER_URL}/rpc`,
            {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'textDocument/hover',
                params: req.body
            },
            { timeout: 30000 }
        );

        return res.json(result.data.result || {});
    } catch (error) {
        return res.status(502).json({
            error: 'Failed to get hover information',
            message: error.message
        });
    }
});

router.post('/definition', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await axios.post(
            `${LSP_SERVER_URL}/rpc`,
            {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'textDocument/definition',
                params: req.body
            },
            { timeout: 30000 }
        );

        return res.json(result.data.result || []);
    } catch (error) {
        return res.status(502).json({
            error: 'Failed to get definition',
            message: error.message
        });
    }
});

router.post('/diagnostic', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await axios.post(
            `${LSP_SERVER_URL}/rpc`,
            {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'textDocument/diagnostic',
                params: req.body
            },
            { timeout: 30000 }
        );

        return res.json(result.data.result || []);
    } catch (error) {
        return res.status(502).json({
            error: 'Failed to get diagnostics',
            message: error.message
        });
    }
});

// -------------------------
// Notifications
// -------------------------

router.post('/document/open', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { textDocument } = req.body;
    if (!textDocument?.uri) {
        return res.status(400).json({ error: 'textDocument.uri is required' });
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return res.status(503).json({ error: 'LSP server is not connected' });
    }

    safeSend(JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument }
    }));

    return res.json({ status: 'ok' });
});

router.post('/document/change', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { textDocument, contentChanges } = req.body;

    if (!textDocument?.uri) {
        return res.status(400).json({ error: 'textDocument.uri is required' });
    }

    if (!Array.isArray(contentChanges)) {
        return res.status(400).json({ error: 'contentChanges array is required' });
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return res.status(503).json({ error: 'LSP server is not connected' });
    }

    safeSend(JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didChange',
        params: { textDocument, contentChanges }
    }));

    return res.json({ status: 'ok' });
});

router.post('/document/close', (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { textDocument } = req.body;

    if (!textDocument?.uri) {
        return res.status(400).json({ error: 'textDocument.uri is required' });
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
        return res.status(503).json({ error: 'LSP server is not connected' });
    }

    safeSend(JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didClose',
        params: { textDocument }
    }));

    return res.json({ status: 'ok' });
});

// -------------------------
// Shutdown
// -------------------------

function closeConnection() {
    manualClose = true;

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
    }

    console.log('LSP WebSocket connection closed');
}

// -------------------------
// Start connection
// -------------------------

connectWebSocket();

module.exports = router;
module.exports.closeConnection = closeConnection;