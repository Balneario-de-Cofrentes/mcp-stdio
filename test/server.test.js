import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverScript = join(__dirname, 'fixture-server.js');

function spawnServer() {
  const proc = spawn('node', [serverScript], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: join(__dirname, '..'),
  });

  const rl = createInterface({ input: proc.stdout });
  const lines = [];
  rl.on('line', (line) => lines.push(line));

  async function sendAndReceive(msg) {
    const before = lines.length;
    proc.stdin.write(JSON.stringify(msg) + '\n');
    for (let i = 0; i < 40; i++) {
      if (lines.length > before) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    const raw = lines[lines.length - 1];
    return raw ? JSON.parse(raw) : null;
  }

  async function sendNotification(msg) {
    proc.stdin.write(JSON.stringify(msg) + '\n');
    await new Promise((r) => setTimeout(r, 50));
  }

  function close() {
    proc.stdin.end();
    proc.kill();
  }

  return { sendAndReceive, sendNotification, close, lines };
}

describe('mcp-stdio server', async () => {
  const server = spawnServer();
  // Wait for server startup
  await new Promise((r) => setTimeout(r, 300));

  it('should handle initialize', async () => {
    const res = await server.sendAndReceive({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test' } },
    });
    assert.equal(res.jsonrpc, '2.0');
    assert.equal(res.id, 1);
    assert.equal(res.result.serverInfo.name, 'test-server');
    assert.equal(res.result.serverInfo.version, '1.0.0');
    assert.ok(res.result.capabilities.tools);
  });

  it('should accept notifications without response', async () => {
    const before = server.lines.length;
    await server.sendNotification({ jsonrpc: '2.0', method: 'notifications/initialized' });
    // No new line should appear (notifications don't get responses)
    assert.equal(server.lines.length, before);
  });

  it('should list tools', async () => {
    const res = await server.sendAndReceive({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.equal(res.result.tools.length, 3);
    const greet = res.result.tools.find((t) => t.name === 'greet');
    assert.ok(greet);
    assert.equal(greet.description, 'Say hello');
    assert.deepEqual(greet.inputSchema.required, ['name']);
  });

  it('should call a tool successfully', async () => {
    const res = await server.sendAndReceive({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'greet', arguments: { name: 'World' } },
    });
    assert.equal(res.result.content[0].type, 'text');
    assert.equal(res.result.content[0].text, 'Hello World!');
  });

  it('should handle tool errors gracefully', async () => {
    const res = await server.sendAndReceive({
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: { name: 'fail', arguments: {} },
    });
    assert.equal(res.result.isError, true);
    assert.ok(res.result.content[0].text.includes('intentional error'));
  });

  it('should handle unknown tool', async () => {
    const res = await server.sendAndReceive({
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'nonexistent', arguments: {} },
    });
    assert.equal(res.result.isError, true);
    assert.ok(res.result.content[0].text.includes('Unknown tool'));
  });

  it('should handle unknown method', async () => {
    const res = await server.sendAndReceive({
      jsonrpc: '2.0', id: 6, method: 'resources/list',
    });
    assert.ok(res.error);
    assert.equal(res.error.code, -32601);
  });

  it('should handle ping', async () => {
    const res = await server.sendAndReceive({ jsonrpc: '2.0', id: 7, method: 'ping' });
    assert.deepEqual(res.result, {});
  });

  it('should handle multi-content responses', async () => {
    const res = await server.sendAndReceive({
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'multi', arguments: {} },
    });
    assert.equal(res.result.content.length, 2);
    assert.equal(res.result.content[0].text, 'line 1');
    assert.equal(res.result.content[1].text, 'line 2');
  });

  it('should handle invalid JSON-RPC (missing method)', async () => {
    const res = await server.sendAndReceive({ jsonrpc: '2.0', id: 99 });
    assert.ok(res.error);
    assert.equal(res.error.code, -32600);
  });

  after(() => server.close());
});
