# mcp-stdio

Zero-dependency MCP server for stdio transport. Just tools, nothing else.

[![npm version](https://img.shields.io/npm/v/mcp-stdio.svg)](https://www.npmjs.com/package/mcp-stdio)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why

The official MCP SDK has 17 dependencies (Express, Hono, OAuth, JWT...). Most MCP servers just need stdio + tools. This package is 222 lines, zero runtime dependencies.

| | `@modelcontextprotocol/sdk` | `mcp-stdio` |
|---|---|---|
| Dependencies | 17 | **0** |
| Transport | stdio, HTTP, SSE | **stdio** |
| Features | tools, resources, prompts, sampling, auth | **tools** |
| Lines | ~5000+ | **222** |

## Install

```bash
npm install mcp-stdio
```

## Usage

```typescript
import { createMcpServer } from 'mcp-stdio';

createMcpServer({
  name: 'my-server',
  version: '1.0.0',
  tools: {
    greet: {
      description: 'Say hello',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      },
      handler: async ({ name }) => `Hello ${name}!`,
    },

    add: {
      description: 'Add two numbers',
      parameters: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        required: ['a', 'b'],
      },
      handler: async ({ a, b }) => `${Number(a) + Number(b)}`,
    },
  },
});
```

## Configure in Claude Code

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["my-server.js"]
    }
  }
}
```

## API

### `createMcpServer(options)`

Starts an MCP server reading JSON-RPC from stdin, writing to stdout.

**Options:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | yes | Server name (shown to clients) |
| `version` | `string` | no | Server version (default: `'0.1.0'`) |
| `tools` | `Record<string, ToolDefinition>` | yes | Tool definitions |

**ToolDefinition:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | `string` | yes | What the tool does |
| `parameters` | `JsonSchema` | no | JSON Schema for input |
| `handler` | `(params) => Promise<string \| ToolContent[]>` | yes | Implementation |

**Handler return types:**
- `string` — wrapped as `[{ type: 'text', text: '...' }]`
- `ToolContent[]` — returned as-is (supports `text`, `image`, `resource`)

**Errors in handlers** are caught and returned as `{ isError: true, content: [{ type: 'text', text: 'Error: ...' }] }` — the server never crashes.

## What it implements

- JSON-RPC 2.0 over stdio (newline-delimited)
- `initialize` with capability negotiation
- `tools/list` with JSON Schema input schemas
- `tools/call` with structured content responses
- `ping`
- Proper error codes (-32700, -32600, -32601, -32603)
- Notification handling (no response for messages without `id`)
- Logs to stderr (stdout is protocol-only)

## What it doesn't implement

- HTTP/SSE/Streamable HTTP transport
- Resources, Prompts, Sampling
- OAuth, authentication
- Schema validation (trusts the caller — your handler validates)

These are intentional omissions. If you need them, use the [official SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## License

MIT
