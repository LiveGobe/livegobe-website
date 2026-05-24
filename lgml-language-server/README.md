# LGML Language Server

A Language Server Protocol (LSP) implementation for the LGML/LGWL wiki markup language used in the livegobe-website project.

## Features

- **Code Completion** - Intelligent autocomplete with type inference
- **Hover Information** - Type hints and documentation on hover
- **Jump to Definition** - Navigate to module and function definitions
- **Find References** - Find all usages of a symbol
- **Symbol Renaming** - Refactor symbols across the codebase
- **Document Symbols** - Quick navigation within documents
- **Diagnostics** - Real-time error detection and validation

## Installation

```bash
npm install
```

## Configuration

### Environment Variables (.env)

```bash
# Server
LSP_PORT=3001
LSP_HOST=localhost

# Wiki API
WIKI_API_BASE=http://localhost:3000/api
WIKI_API_TIMEOUT=5000

# Logging
LOG_LEVEL=debug
```

### Configuration File (.lsmcrc.json)

See `config/.lsmcrc.json` for detailed configuration options.

## Development

```bash
# Start in development mode
npm run dev

# Run tests
npm test

# Watch tests
npm run test:watch

# Lint code
npm run lint
```

## Production

```bash
# Start server
npm start
```

With PM2:

```bash
pm2 start src/server.js --name "lgml-language-server" --env production
```

## Architecture

See [LGML-LSP-ARCHITECTURE.md](../docs/LGML-LSP-ARCHITECTURE.md) for detailed architecture documentation.

## Implementation Status

- [x] LSP Protocol Handler
- [x] Configuration Management
- [x] Logging System
- [ ] Completion Handler
- [ ] Hover Handler
- [ ] Wiki API Client
- [ ] Module Resolver
- [ ] Tern.js Integration
- [ ] Diagnostics Engine

## Testing

```bash
npm test
npm run test:coverage
```

## Related Documentation

- [LGML Language Server Checklist](../docs/LGML-LANG-SERVER.md) - Feature requirements
- [LSP Architecture Design](../docs/LGML-LSP-ARCHITECTURE.md) - Architecture decisions and design
- [LSP Specification](https://microsoft.github.io/language-server-protocol/)
