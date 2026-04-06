import { createMcpServer } from '../dist/index.js';

createMcpServer({
  name: 'test-server',
  version: '1.0.0',
  tools: {
    greet: {
      description: 'Say hello',
      parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      handler: async ({ name }) => `Hello ${name}!`,
    },
    fail: {
      description: 'Always fails',
      parameters: { type: 'object', properties: {} },
      handler: async () => { throw new Error('intentional error'); },
    },
    multi: {
      description: 'Returns multiple content blocks',
      parameters: { type: 'object', properties: {} },
      handler: async () => [
        { type: 'text', text: 'line 1' },
        { type: 'text', text: 'line 2' },
      ],
    },
  },
});
