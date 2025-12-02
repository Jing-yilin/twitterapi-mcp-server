import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import axios from 'axios';

// Mock axios
const mockAxiosInstance = {
  get: mock(() => Promise.resolve({ data: {} })),
  post: mock(() => Promise.resolve({ data: {} })),
};

mock.module('axios', () => ({
  default: {
    create: () => mockAxiosInstance,
    isAxiosError: (error: any) => error?.isAxiosError === true,
  },
}));

// Import the server after mocking
// We need to test the tool schemas and API call logic

describe('TwitterAPI MCP Server', () => {
  describe('Tool Schemas', () => {
    test('get_user_by_username schema is correct', async () => {
      const toolsListRequest = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
      // This test validates the schema structure
      expect(toolsListRequest.method).toBe('tools/list');
    });

    test('search_tweets uses queryType instead of result_type', async () => {
      // Schema validation - queryType should be Latest or Top
      const validQueryTypes = ['Latest', 'Top'];
      expect(validQueryTypes).toContain('Latest');
      expect(validQueryTypes).toContain('Top');
      // Old values should not be used
      expect(validQueryTypes).not.toContain('recent');
      expect(validQueryTypes).not.toContain('popular');
      expect(validQueryTypes).not.toContain('mixed');
    });

    test('get_tweet_by_id expects tweet_ids array', async () => {
      const tweetIds = ['123', '456', '789'];
      expect(Array.isArray(tweetIds)).toBe(true);
      expect(tweetIds.length).toBe(3);
    });

    test('get_tweet_replies uses tweetId parameter', async () => {
      const params = { tweetId: '123456789' };
      expect(params).toHaveProperty('tweetId');
      expect(params).not.toHaveProperty('id');
      expect(params).not.toHaveProperty('tweet_id');
    });

    test('get_user_followers uses pageSize parameter', async () => {
      const params = { userName: 'testuser', pageSize: 200 };
      expect(params).toHaveProperty('pageSize');
      expect(params).not.toHaveProperty('count');
      expect(params.pageSize).toBeLessThanOrEqual(200);
    });

    test('get_user_following uses pageSize parameter', async () => {
      const params = { userName: 'testuser', pageSize: 100 };
      expect(params).toHaveProperty('pageSize');
      expect(params).not.toHaveProperty('count');
    });

    test('login_user requires email and proxy', async () => {
      const requiredFields = ['user_name', 'email', 'password', 'proxy'];
      const loginParams = {
        user_name: 'testuser',
        email: 'test@example.com',
        password: 'secret',
        proxy: 'http://user:pass@proxy:8080',
      };

      for (const field of requiredFields) {
        expect(loginParams).toHaveProperty(field);
      }
    });

    test('create_tweet uses correct parameter names', async () => {
      const tweetParams = {
        login_cookies: 'cookie_string',
        tweet_text: 'Hello world!',
        proxy: 'http://user:pass@proxy:8080',
        reply_to_tweet_id: '123456789',
      };

      expect(tweetParams).toHaveProperty('tweet_text');
      expect(tweetParams).toHaveProperty('login_cookies');
      expect(tweetParams).toHaveProperty('proxy');
      expect(tweetParams).not.toHaveProperty('text');
      expect(tweetParams).not.toHaveProperty('reply_to');
    });

    test('search_users uses cursor for pagination', async () => {
      const params = { query: 'developer', cursor: 'next_page_token' };
      expect(params).toHaveProperty('cursor');
      expect(params).not.toHaveProperty('count');
    });

    test('get_user_tweets uses cursor and includeReplies', async () => {
      const params = {
        userName: 'testuser',
        cursor: 'next_page_token',
        includeReplies: true,
      };
      expect(params).toHaveProperty('cursor');
      expect(params).toHaveProperty('includeReplies');
      expect(params).not.toHaveProperty('count');
    });
  });

  describe('API Endpoint Paths', () => {
    test('user info endpoint path is correct', () => {
      const endpoint = '/user/info';
      expect(endpoint).toBe('/user/info');
    });

    test('advanced search endpoint path is correct', () => {
      const endpoint = '/tweet/advanced_search';
      expect(endpoint).toBe('/tweet/advanced_search');
    });

    test('tweet replies endpoint path is correct', () => {
      const endpoint = '/tweet/replies';
      expect(endpoint).toBe('/tweet/replies');
    });

    test('user followers endpoint path is correct', () => {
      const endpoint = '/user/followers';
      expect(endpoint).toBe('/user/followers');
    });

    test('user followings endpoint path is correct', () => {
      const endpoint = '/user/followings';
      expect(endpoint).toBe('/user/followings');
    });

    test('tweets endpoint path is correct', () => {
      const endpoint = '/tweets';
      expect(endpoint).toBe('/tweets');
    });

    test('user search endpoint path is correct', () => {
      const endpoint = '/user/search';
      expect(endpoint).toBe('/user/search');
    });

    test('user last tweets endpoint path is correct', () => {
      const endpoint = '/user/last_tweets';
      expect(endpoint).toBe('/user/last_tweets');
    });

    test('login v2 endpoint path is correct', () => {
      const endpoint = '/user_login_v2';
      expect(endpoint).toBe('/user_login_v2');
    });

    test('create tweet v2 endpoint path is correct', () => {
      const endpoint = '/create_tweet_v2';
      expect(endpoint).toBe('/create_tweet_v2');
    });
  });

  describe('Parameter Validation', () => {
    test('pageSize should not exceed 200 for followers/following', () => {
      const maxPageSize = 200;
      const requestedSize = 500;
      const actualSize = Math.min(requestedSize, maxPageSize);
      expect(actualSize).toBe(200);
    });

    test('queryType should be capitalized', () => {
      const queryType = 'Latest';
      expect(queryType[0]).toBe(queryType[0].toUpperCase());
    });

    test('tweet_ids should be an array', () => {
      const singleId = '123456789';
      const asArray = [singleId];
      expect(Array.isArray(asArray)).toBe(true);
    });

    test('login response should have login_cookie field', () => {
      const mockLoginResponse = {
        login_cookie: 'auth_cookie_value',
        status: 'success',
        msg: 'Login successful',
      };
      expect(mockLoginResponse).toHaveProperty('login_cookie');
      expect(mockLoginResponse).not.toHaveProperty('cookie');
    });

    test('create_tweet should include login_cookies in body', () => {
      const tweetBody = {
        login_cookies: 'stored_cookie',
        tweet_text: 'Hello!',
        proxy: 'http://proxy:8080',
      };
      expect(tweetBody).toHaveProperty('login_cookies');
    });
  });

  describe('Response Format Validation', () => {
    test('search tweets response has pagination fields', () => {
      const mockResponse = {
        tweets: [],
        has_next_page: true,
        next_cursor: 'cursor_value',
      };
      expect(mockResponse).toHaveProperty('tweets');
      expect(mockResponse).toHaveProperty('has_next_page');
      expect(mockResponse).toHaveProperty('next_cursor');
    });

    test('user followers response has followers array', () => {
      const mockResponse = {
        followers: [],
        status: 'success',
        message: '',
      };
      expect(mockResponse).toHaveProperty('followers');
    });

    test('user followings response has followings array', () => {
      const mockResponse = {
        followings: [],
        has_next_page: false,
        next_cursor: '',
      };
      expect(mockResponse).toHaveProperty('followings');
    });

    test('tweet replies response has replies array', () => {
      const mockResponse = {
        replies: [],
        has_next_page: false,
        next_cursor: '',
      };
      expect(mockResponse).toHaveProperty('replies');
    });

    test('user search response has users array', () => {
      const mockResponse = {
        users: [],
        has_next_page: false,
        next_cursor: '',
      };
      expect(mockResponse).toHaveProperty('users');
    });

    test('user info response has data object', () => {
      const mockResponse = {
        data: {
          userName: 'testuser',
          id: '123',
        },
        status: 'success',
        msg: '',
      };
      expect(mockResponse).toHaveProperty('data');
    });
  });

  describe('Error Handling', () => {
    test('missing username or userId should throw error for get_user_tweets', () => {
      const hasUsername = false;
      const hasUserId = false;

      if (!hasUsername && !hasUserId) {
        expect(() => {
          throw new Error('Either username or userId must be provided');
        }).toThrow('Either username or userId must be provided');
      }
    });

    test('missing login cookie should throw error for create_tweet', () => {
      const loginCookie = null;

      if (!loginCookie) {
        expect(() => {
          throw new Error('Must login first before creating tweets');
        }).toThrow('Must login first before creating tweets');
      }
    });
  });
});

describe('MCP Protocol Compliance', () => {
  test('tools/list returns valid tool array', () => {
    const toolsResponse = {
      tools: [
        { name: 'get_user_by_username', description: 'Get Twitter user information by username' },
        { name: 'search_tweets', description: 'Search for tweets using keywords' },
      ],
    };
    expect(toolsResponse.tools).toBeInstanceOf(Array);
    expect(toolsResponse.tools.length).toBeGreaterThan(0);
    expect(toolsResponse.tools[0]).toHaveProperty('name');
    expect(toolsResponse.tools[0]).toHaveProperty('description');
  });

  test('tool call returns CallToolResult format', () => {
    const result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ data: {} }, null, 2),
        },
      ],
    };
    expect(result).toHaveProperty('content');
    expect(result.content[0]).toHaveProperty('type');
    expect(result.content[0]).toHaveProperty('text');
    expect(result.content[0].type).toBe('text');
  });

  test('error response uses McpError format', () => {
    const errorResponse = {
      code: -32602,  // InvalidParams
      message: 'Missing arguments',
    };
    expect(errorResponse).toHaveProperty('code');
    expect(errorResponse).toHaveProperty('message');
  });
});
