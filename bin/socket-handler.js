/**
 * Socket.IO Handler
 * 
 * Manages all real-time Socket.IO connections from browser clients.
 * Includes LSP WebSocket proxy for real-time LSP communication.
 */

const LSPProxy = require('./lsp-proxy');

/**
 * @param {import("socket.io").Server} io 
 */
module.exports = function(io) {
    // Initialize LSP Proxy
    const lspProxy = new LSPProxy({
        lspServerUrl: process.env.LSP_SERVER_URL || 'http://localhost:8081',
        lspWebSocketUrl: process.env.LSP_WEBSOCKET_URL || 'ws://localhost:8081',
        logger: console
    });

    // Authentication middleware
    io.use((socket, next) => {
        if (!socket.request.user) return next(new Error("No User"))
        next();
    });

    // Connection handler
    io.on("connection", socket => {
        const userId = socket.request.user.id;
        
        socket.emit("message", `User ${socket.request.user.name} connected`);
        console.log(`[Socket] User ${userId} connected: ${socket.id}`);

        // ===== LSP WebSocket Proxy =====
        
        /**
         * Initialize LSP proxy for this client
         * Client sends: { wikiName: 'wiki-name' }
         */
        socket.on('lsp:connect', (data) => {
            const wikiName = data?.wikiName || 'default';
            console.log(`[LSP] Connecting proxy for user ${userId}, wiki: ${wikiName}`);
            
            try {
                lspProxy.setupWebSocketProxy(socket, wikiName);
            } catch (error) {
                console.error(`[LSP] Failed to setup proxy:`, error);
                socket.emit('lsp:error', { message: 'Failed to connect to LSP server' });
            }
        });

        /**
         * Forward LSP HTTP requests (for stateless operations)
         * Client sends: { method: 'completion', params: {...} }
         */
        socket.on('lsp:http-request', async (data) => {
            const { method, params, requestId } = data;
            
            if (!method) {
                socket.emit('lsp:http-response', {
                    requestId,
                    error: 'method is required'
                });
                return;
            }

            try {
                const result = await lspProxy.proxyHTTPRequest(method, params);
                socket.emit('lsp:http-response', {
                    requestId,
                    result,
                    error: null
                });
            } catch (error) {
                socket.emit('lsp:http-response', {
                    requestId,
                    error: error.message,
                    result: null
                });
            }
        });

        /**
         * Get LSP server health status
         */
        socket.on('lsp:health', async () => {
            try {
                const health = await lspProxy.checkHealth();
                socket.emit('lsp:health-response', { status: 'ok', data: health });
            } catch (error) {
                socket.emit('lsp:health-response', { 
                    status: 'error', 
                    message: error.message 
                });
            }
        });

        /**
         * Disconnect LSP proxy
         */
        socket.on('lsp:disconnect', () => {
            console.log(`[LSP] Disconnecting proxy for user ${userId}`);
            lspProxy.closeWebSocketProxy(socket.id);
        });

        /**
         * Get connection info (for debugging)
         */
        socket.on('lsp:status', () => {
            const connections = lspProxy.getConnectionInfo();
            socket.emit('lsp:status-response', { connections });
        });

        // Clean up on disconnect
        socket.on('disconnect', () => {
            console.log(`[Socket] User ${userId} disconnected: ${socket.id}`);
            lspProxy.closeWebSocketProxy(socket.id);
        });
    });
}