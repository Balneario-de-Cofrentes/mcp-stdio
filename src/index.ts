/**
 * mcp-stdio — Zero-dependency MCP server for stdio transport.
 *
 * Implements the Model Context Protocol over stdin/stdout using JSON-RPC 2.0.
 * Supports tools only (no resources, prompts, or sampling).
 *
 * Usage:
 *   import { createMcpServer } from 'mcp-stdio';
 *
 *   createMcpServer({
 *     name: 'my-server',
 *     version: '1.0.0',
 *     tools: {
 *       greet: {
 *         description: 'Say hello',
 *         parameters: { type: 'object', properties: { name: { type: 'string' } } },
 *         handler: async ({ name }) => `Hello ${name}!`,
 *       },
 *     },
 *   });
 */

import { createInterface } from 'readline';

// ─── Public types ───────────────────────────────────────────────────────────

export interface ToolDefinition {
  description: string;
  parameters?: JsonSchema;
  handler: (params: Record<string, unknown>) => Promise<string | ToolContent[]>;
}

export interface ToolContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface JsonSchema {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface McpServerOptions {
  name: string;
  version?: string;
  tools: Record<string, ToolDefinition>;
}

// ─── JSON-RPC 2.0 types ────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── JSON-RPC error codes ───────────────────────────────────────────────────

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

// ─── Core server ────────────────────────────────────────────────────────────

function send(msg: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function sendResult(id: string | number | null, result: unknown): void {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id: string | number | null, code: number, message: string): void {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

function log(...args: unknown[]): void {
  // MCP requires stdout for protocol only — use stderr for diagnostics
  process.stderr.write(args.map(String).join(' ') + '\n');
}

function normalizeContent(result: string | ToolContent[]): ToolContent[] {
  if (typeof result === 'string') {
    return [{ type: 'text', text: result }];
  }
  return result;
}

async function handleRequest(
  req: JsonRpcRequest,
  options: McpServerOptions,
): Promise<void> {
  const { id, method, params } = req;

  // Notifications (no id) — acknowledge silently
  if (id === undefined || id === null) {
    // notifications/initialized, notifications/cancelled, etc.
    return;
  }

  switch (method) {
    case 'initialize': {
      sendResult(id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: options.name,
          version: options.version || '0.1.0',
        },
      });
      return;
    }

    case 'tools/list': {
      const tools = Object.entries(options.tools).map(([name, def]) => ({
        name,
        description: def.description,
        inputSchema: def.parameters || { type: 'object', properties: {} },
      }));
      sendResult(id, { tools });
      return;
    }

    case 'tools/call': {
      const toolName = (params as { name?: string })?.name;
      const toolArgs = (params as { arguments?: Record<string, unknown> })?.arguments || {};

      if (!toolName || !(toolName in options.tools)) {
        sendResult(id, {
          content: [{ type: 'text', text: `Error: Unknown tool "${toolName}"` }],
          isError: true,
        });
        return;
      }

      try {
        const result = await options.tools[toolName].handler(toolArgs);
        sendResult(id, {
          content: normalizeContent(result),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendResult(id, {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        });
      }
      return;
    }

    case 'ping': {
      sendResult(id, {});
      return;
    }

    default: {
      sendError(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Start an MCP server that reads JSON-RPC messages from stdin
 * and writes responses to stdout.
 *
 * Logs go to stderr (stdout is reserved for the MCP protocol).
 *
 * Returns a promise that resolves when stdin closes.
 */
export function createMcpServer(options: McpServerOptions): Promise<void> {
  return new Promise<void>((resolve) => {
    const rl = createInterface({ input: process.stdin });

    rl.on('line', async (line: string) => {
      if (!line.trim()) return;

      let req: JsonRpcRequest;
      try {
        req = JSON.parse(line);
      } catch {
        sendError(null, PARSE_ERROR, 'Parse error');
        return;
      }

      if (!req.jsonrpc || req.jsonrpc !== '2.0' || !req.method) {
        sendError(req.id ?? null, INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request');
        return;
      }

      try {
        await handleRequest(req, options);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log('Internal error:', message);
        sendError(req.id ?? null, INTERNAL_ERROR, 'Internal server error');
      }
    });

    rl.on('close', () => {
      resolve();
    });

    log(`${options.name} MCP server started (stdio)`);
  });
}
