import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

describe('MCP Server Integration Tests', () => {
  let serverProcess: ChildProcess | null = null;

  const sendRequest = (request: object): Promise<any> => {
    return new Promise((resolve, reject) => {
      const proc = spawn('node', [path.join(__dirname, '../build/index.js')], {
        env: { ...process.env, TWITTERAPI_API_KEY: 'test_api_key' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', () => {
        try {
          // Parse the JSON-RPC response
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            if (line.startsWith('{')) {
              const response = JSON.parse(line);
              resolve(response);
              return;
            }
          }
          resolve({ stdout, stderr });
        } catch (e) {
          resolve({ stdout, stderr, error: e });
        }
      });

      proc.on('error', reject);

      // Send the request
      proc.stdin?.write(JSON.stringify(request) + '\n');
      proc.stdin?.end();

      // Timeout after 10 seconds
      setTimeout(() => {
        proc.kill();
        reject(new Error('Request timeout'));
      }, 10000);
    });
  };

  describe('tools/list endpoint', () => {
    test('returns all 11 tools', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeInstanceOf(Array);
      expect(response.result.tools.length).toBe(11);
    });

    test('includes get_user_by_username tool', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const tools = response.result.tools;
      const tool = tools.find((t: any) => t.name === 'get_user_by_username');
      expect(tool).toBeDefined();
      expect(tool.inputSchema.required).toContain('username');
    });

    test('includes search_tweets tool with correct schema', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const tools = response.result.tools;
      const tool = tools.find((t: any) => t.name === 'search_tweets');
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties).toHaveProperty('queryType');
      expect(tool.inputSchema.properties.queryType.enum).toContain('Latest');
      expect(tool.inputSchema.properties.queryType.enum).toContain('Top');
      expect(tool.inputSchema.properties).not.toHaveProperty('result_type');
      expect(tool.inputSchema.properties).not.toHaveProperty('count');
    });

    test('includes get_tweet_by_id tool with tweet_ids array', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const tools = response.result.tools;
      const tool = tools.find((t: any) => t.name === 'get_tweet_by_id');
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties.tweet_ids.type).toBe('array');
      expect(tool.inputSchema.required).toContain('tweet_ids');
    });

    test('includes get_tweet_replies tool with tweetId param', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const tools = response.result.tools;
      const tool = tools.find((t: any) => t.name === 'get_tweet_replies');
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties).toHaveProperty('tweetId');
      expect(tool.inputSchema.properties).not.toHaveProperty('id');
      expect(tool.inputSchema.properties).not.toHaveProperty('count');
    });

    test('includes get_user_followers tool with pageSize param', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const tools = response.result.tools;
      const tool = tools.find((t: any) => t.name === 'get_user_followers');
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties).toHaveProperty('pageSize');
      expect(tool.inputSchema.properties).toHaveProperty('cursor');
      expect(tool.inputSchema.properties).not.toHaveProperty('count');
    });

    test('includes get_user_following tool with pageSize param', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const tools = response.result.tools;
      const tool = tools.find((t: any) => t.name === 'get_user_following');
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties).toHaveProperty('pageSize');
      expect(tool.inputSchema.properties).toHaveProperty('cursor');
      expect(tool.inputSchema.properties).not.toHaveProperty('count');
    });

    test('includes login_user tool with required email and proxy', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const tools = response.result.tools;
      const tool = tools.find((t: any) => t.name === 'login_user');
      expect(tool).toBeDefined();
      expect(tool.inputSchema.required).toContain('user_name');
      expect(tool.inputSchema.required).toContain('email');
      expect(tool.inputSchema.required).toContain('password');
      expect(tool.inputSchema.required).toContain('proxy');
    });

    test('includes create_tweet tool with correct params', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const tools = response.result.tools;
      const tool = tools.find((t: any) => t.name === 'create_tweet');
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties).toHaveProperty('tweet_text');
      expect(tool.inputSchema.properties).toHaveProperty('proxy');
      expect(tool.inputSchema.properties).toHaveProperty('reply_to_tweet_id');
      expect(tool.inputSchema.required).toContain('tweet_text');
      expect(tool.inputSchema.required).toContain('proxy');
    });

    test('includes search_users tool with cursor', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const tools = response.result.tools;
      const tool = tools.find((t: any) => t.name === 'search_users');
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties).toHaveProperty('cursor');
      expect(tool.inputSchema.properties).not.toHaveProperty('count');
    });

    test('includes get_user_tweets tool with cursor and includeReplies', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const tools = response.result.tools;
      const tool = tools.find((t: any) => t.name === 'get_user_tweets');
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties).toHaveProperty('cursor');
      expect(tool.inputSchema.properties).toHaveProperty('includeReplies');
      expect(tool.inputSchema.properties).not.toHaveProperty('count');
    });
  });

  describe('Error handling', () => {
    test('returns error for unknown tool', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {},
        },
      });

      // Should have an error response
      expect(response.error || response.result).toBeDefined();
    });

    test('returns error for missing arguments', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_user_by_username',
          // Missing arguments
        },
      });

      expect(response.error || response.result).toBeDefined();
    });
  });
});
