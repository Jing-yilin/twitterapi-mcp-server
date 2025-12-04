#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { encode } from '@toon-format/toon';
import * as fs from 'fs';
import * as path from 'path';

// Data cleaners for Twitter entities
const DataCleaners = {
  cleanUser: (user: any): any => {
    if (!user) return null;
    return {
      id: user.id,
      username: user.userName || user.screen_name || user.username,
      name: user.name,
      description: user.description,
      verified: user.isVerified || user.verified || user.isBlueVerified,
      followers: user.followers ?? user.followers_count,
      following: user.following ?? user.following_count,
      tweets: user.statusesCount ?? user.statuses_count ?? user.tweet_count,
      location: user.location || undefined,
      url: user.url || undefined,
      created: user.createdAt || user.created_at,
    };
  },

  cleanTweet: (tweet: any): any => {
    if (!tweet) return null;
    return {
      id: tweet.id,
      text: tweet.text,
      author: tweet.author ? DataCleaners.cleanUser(tweet.author) : undefined,
      created: tweet.createdAt || tweet.created_at,
      retweets: tweet.retweetCount ?? tweet.public_metrics?.retweet_count,
      likes: tweet.likeCount ?? tweet.public_metrics?.like_count,
      replies: tweet.replyCount ?? tweet.public_metrics?.reply_count,
      quotes: tweet.quoteCount ?? tweet.public_metrics?.quote_count,
      views: tweet.viewCount,
      isReply: tweet.isReply,
      isRetweet: tweet.isRetweet,
      inReplyTo: tweet.inReplyToId || tweet.in_reply_to,
      conversationId: tweet.conversationId,
      lang: tweet.lang,
    };
  },

  cleanUserList: (users: any[]): any[] => {
    if (!Array.isArray(users)) return [];
    return users.map(DataCleaners.cleanUser).filter(Boolean);
  },

  cleanTweetList: (tweets: any[]): any[] => {
    if (!Array.isArray(tweets)) return [];
    return tweets.map(DataCleaners.cleanTweet).filter(Boolean);
  },
};

/**
 * TwitterAPI.io MCP Server
 * Provides access to Twitter data through TwitterAPI.io service
 */
class TwitterAPIMCPServer {
  private server: Server;
  private apiClient: AxiosInstance;
  private apiKey: string;
  private loginCookie: string | null = null;

  constructor() {
    // Get API key from environment
    this.apiKey = process.env.TWITTERAPI_API_KEY || '';
    if (!this.apiKey) {
      console.error('Warning: TWITTERAPI_API_KEY environment variable not set');
    }

    this.server = new Server(
      {
        name: 'twitterapi-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Configure axios client with proxy support
    const axiosConfig: AxiosRequestConfig = {
      baseURL: 'https://api.twitterapi.io/twitter',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TwitterAPI-MCP-Server/1.0.0'
      }
    };

    // Proxy support for enterprise environments
    const proxyUrl = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    if (proxyUrl) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
      axiosConfig.proxy = false;
      console.log('Using proxy:', proxyUrl);
    }

    this.apiClient = axios.create(axiosConfig);

    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_user_by_username',
            description: 'Get Twitter user info by username. Returns cleaned data in TOON format.',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Twitter username (without @)',
                },
                save_dir: {
                  type: 'string',
                  description: 'Directory to save cleaned JSON data',
                },
                max_items: {
                  type: 'integer',
                  description: 'Maximum number of items to return in arrays (default: 3). Cleaned data output.',
                  default: 3,
                },
              },
              required: ['username'],
            },
          } as Tool,
          {
            name: 'get_user_by_id',
            description: 'Get Twitter user info by ID. Returns cleaned data in TOON format.',
            inputSchema: {
              type: 'object',
              properties: {
                user_id: {
                  type: 'string',
                  description: 'Twitter user ID',
                },
                save_dir: {
                  type: 'string',
                  description: 'Directory to save cleaned JSON data',
                },
                max_items: {
                  type: 'integer',
                  description: 'Maximum number of items to return in arrays (default: 3). Cleaned data output.',
                  default: 3,
                },
              },
              required: ['user_id'],
            },
          } as Tool,
          {
            name: 'get_user_tweets',
            description: 'Get tweets from a user. Returns cleaned data in TOON format.',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Twitter username (without @)',
                },
                userId: {
                  type: 'string',
                  description: 'Twitter user ID (alternative to username)',
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor for fetching next page',
                },
                includeReplies: {
                  type: 'boolean',
                  description: 'Include reply tweets (default: false)',
                  default: false,
                },
                save_dir: {
                  type: 'string',
                  description: 'Directory to save cleaned JSON data',
                },
                max_items: {
                  type: 'integer',
                  description: 'Maximum number of items to return in arrays (default: 3). Cleaned data output.',
                  default: 3,
                },
              },
              required: [],
            },
          } as Tool,
          {
            name: 'search_tweets',
            description: 'Search tweets by keywords. Returns cleaned data in TOON format.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for tweets (e.g., "AI" OR "Twitter" from:elonmusk since:2021-12-31)',
                },
                queryType: {
                  type: 'string',
                  description: 'Type of search results',
                  enum: ['Latest', 'Top'],
                  default: 'Latest',
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor for fetching next page (empty string for first page)',
                },
                save_dir: {
                  type: 'string',
                  description: 'Directory to save cleaned JSON data',
                },
                max_items: {
                  type: 'integer',
                  description: 'Maximum number of items to return in arrays (default: 3). Cleaned data output.',
                  default: 3,
                },
              },
              required: ['query'],
            },
          } as Tool,
          {
            name: 'get_tweet_by_id',
            description: 'Get tweets by IDs. Returns cleaned data in TOON format.',
            inputSchema: {
              type: 'object',
              properties: {
                tweet_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of Twitter tweet IDs to retrieve',
                },
                save_dir: {
                  type: 'string',
                  description: 'Directory to save cleaned JSON data',
                },
                max_items: {
                  type: 'integer',
                  description: 'Maximum number of items to return in arrays (default: 3). Cleaned data output.',
                  default: 3,
                },
              },
              required: ['tweet_ids'],
            },
          } as Tool,
          {
            name: 'get_tweet_replies',
            description: 'Get tweet replies. Returns cleaned data in TOON format.',
            inputSchema: {
              type: 'object',
              properties: {
                tweetId: {
                  type: 'string',
                  description: 'Twitter tweet ID (must be an original tweet, not a reply)',
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor for fetching next page',
                },
                sinceTime: {
                  type: 'integer',
                  description: 'Unix timestamp in seconds - get replies on or after this time',
                },
                untilTime: {
                  type: 'integer',
                  description: 'Unix timestamp in seconds - get replies before this time',
                },
                save_dir: {
                  type: 'string',
                  description: 'Directory to save cleaned JSON data',
                },
                max_items: {
                  type: 'integer',
                  description: 'Maximum number of items to return in arrays (default: 3). Cleaned data output.',
                  default: 3,
                },
              },
              required: ['tweetId'],
            },
          } as Tool,
          {
            name: 'get_user_followers',
            description: 'Get user followers. Returns cleaned data in TOON format.',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Twitter username (without @)',
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor for fetching next page',
                },
                pageSize: {
                  type: 'integer',
                  description: 'Number of followers per page (default: 200, max: 200)',
                  minimum: 1,
                  maximum: 200,
                },
                save_dir: {
                  type: 'string',
                  description: 'Directory to save cleaned JSON data',
                },
                max_items: {
                  type: 'integer',
                  description: 'Maximum number of items to return in arrays (default: 3). Cleaned data output.',
                  default: 3,
                },
              },
              required: ['username'],
            },
          } as Tool,
          {
            name: 'get_user_following',
            description: 'Get user following. Returns cleaned data in TOON format.',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Twitter username (without @)',
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor for fetching next page',
                },
                pageSize: {
                  type: 'integer',
                  description: 'Number of following per page (default: 200, max: 200)',
                  minimum: 1,
                  maximum: 200,
                },
                save_dir: {
                  type: 'string',
                  description: 'Directory to save cleaned JSON data',
                },
                max_items: {
                  type: 'integer',
                  description: 'Maximum number of items to return in arrays (default: 3). Cleaned data output.',
                  default: 3,
                },
              },
              required: ['username'],
            },
          } as Tool,
          {
            name: 'search_users',
            description: 'Search users by keyword. Returns cleaned data in TOON format.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search keyword for finding users',
                },
                cursor: {
                  type: 'string',
                  description: 'Pagination cursor for fetching next page',
                },
                save_dir: {
                  type: 'string',
                  description: 'Directory to save cleaned JSON data',
                },
                max_items: {
                  type: 'integer',
                  description: 'Maximum number of items to return in arrays (default: 3). Cleaned data output.',
                  default: 3,
                },
              },
              required: ['query'],
            },
          } as Tool,
          {
            name: 'login_user',
            description: 'Login to Twitter account for write actions (posting tweets, etc.)',
            inputSchema: {
              type: 'object',
              properties: {
                user_name: {
                  type: 'string',
                  description: 'Twitter username',
                },
                email: {
                  type: 'string',
                  description: 'Email associated with Twitter account',
                },
                password: {
                  type: 'string',
                  description: 'Twitter password',
                },
                proxy: {
                  type: 'string',
                  description: 'High-quality residential proxy in format: http://username:password@ip:port',
                },
                totp_secret: {
                  type: 'string',
                  description: '2FA secret from user profile (optional, improves login reliability)',
                },
              },
              required: ['user_name', 'email', 'password', 'proxy'],
            },
          } as Tool,
          {
            name: 'create_tweet',
            description: 'Create a new tweet (requires login first)',
            inputSchema: {
              type: 'object',
              properties: {
                tweet_text: {
                  type: 'string',
                  description: 'Tweet text content (max 280 characters)',
                  maxLength: 280,
                },
                proxy: {
                  type: 'string',
                  description: 'Proxy configuration (same proxy used for login)',
                },
                reply_to_tweet_id: {
                  type: 'string',
                  description: 'Tweet ID to reply to (optional)',
                },
                attachment_url: {
                  type: 'string',
                  description: 'URL for attached content (optional)',
                },
                media_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of media IDs to attach (optional)',
                },
              },
              required: ['tweet_text', 'proxy'],
            },
          } as Tool,
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: args } = request.params;
        
        if (!args) {
          throw new McpError(ErrorCode.InvalidParams, 'Missing arguments');
        }

        switch (name) {
          case 'get_user_by_username':
            return await this.getUserByUsername(
              args.username as string,
              args.save_dir as string | undefined,
              args.max_items as number | undefined
            );

          case 'get_user_by_id':
            return await this.getUserById(
              args.user_id as string,
              args.save_dir as string | undefined,
              args.max_items as number | undefined
            );

          case 'get_user_tweets':
            return await this.getUserTweets(
              args.username as string,
              args.userId as string,
              args.cursor as string,
              args.includeReplies as boolean,
              args.save_dir as string | undefined,
              args.max_items as number | undefined
            );

          case 'search_tweets':
            return await this.searchTweets(
              args.query as string,
              args.queryType as string,
              args.cursor as string,
              args.save_dir as string | undefined,
              args.max_items as number | undefined
            );

          case 'get_tweet_by_id':
            return await this.getTweetById(
              args.tweet_ids as string[],
              args.save_dir as string | undefined,
              args.max_items as number | undefined
            );

          case 'get_tweet_replies':
            return await this.getTweetReplies(
              args.tweetId as string,
              args.cursor as string,
              args.sinceTime as number,
              args.untilTime as number,
              args.save_dir as string | undefined,
              args.max_items as number | undefined
            );

          case 'get_user_followers':
            return await this.getUserFollowers(
              args.username as string,
              args.cursor as string,
              args.pageSize as number,
              args.save_dir as string | undefined,
              args.max_items as number | undefined
            );

          case 'get_user_following':
            return await this.getUserFollowing(
              args.username as string,
              args.cursor as string,
              args.pageSize as number,
              args.save_dir as string | undefined,
              args.max_items as number | undefined
            );

          case 'search_users':
            return await this.searchUsers(
              args.query as string,
              args.cursor as string,
              args.save_dir as string | undefined,
              args.max_items as number | undefined
            );

          case 'login_user':
            return await this.loginUser(
              args.user_name as string,
              args.email as string,
              args.password as string,
              args.proxy as string,
              args.totp_secret as string
            );

          case 'create_tweet':
            return await this.createTweet(
              args.tweet_text as string,
              args.proxy as string,
              args.reply_to_tweet_id as string,
              args.attachment_url as string,
              args.media_ids as string[]
            );

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new McpError(ErrorCode.InternalError, `TwitterAPI.io error: ${message}`);
      }
    });
  }

  private async makeRequest(endpoint: string, params?: Record<string, any>): Promise<any> {
    try {
      const config: AxiosRequestConfig = {
        headers: {},
        params: params || {},
      };

      // Add API key if available
      if (this.apiKey && config.headers) {
        config.headers['x-api-key'] = this.apiKey;
      }

      // Add login cookie for write actions
      if (this.loginCookie && config.headers) {
        config.headers['Cookie'] = this.loginCookie;
      }

      const response = await this.apiClient.get(endpoint, config);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.error || error.message;
        throw new Error(`TwitterAPI.io API error (${statusCode}): ${errorMessage}`);
      }
      throw error;
    }
  }

  private async makePostRequest(endpoint: string, data: Record<string, any>): Promise<any> {
    try {
      const config: AxiosRequestConfig = {
        headers: {},
      };

      // Add API key if available
      if (this.apiKey && config.headers) {
        config.headers['x-api-key'] = this.apiKey;
      }

      // Add login cookie for write actions
      if (this.loginCookie && config.headers) {
        config.headers['Cookie'] = this.loginCookie;
      }

      const response = await this.apiClient.post(endpoint, data, config);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.error || error.message;
        throw new Error(`TwitterAPI.io API error (${statusCode}): ${errorMessage}`);
      }
      throw error;
    }
  }

  private saveData(data: any, dir: string, toolName: string): string {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filename = `${toolName}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const filepath = path.join(dir, filename);
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      return filepath;
    } catch (e) {
      return `Error saving: ${e}`;
    }
  }

  private formatResponse(cleanedData: any, options: { saveDir?: string; toolName?: string; pagination?: any }): CallToolResult {
    const output: any = { data: cleanedData };
    if (options.pagination) {
      output.pagination = {
        hasNextPage: options.pagination.has_next_page,
        nextCursor: options.pagination.next_cursor,
      };
    }

    let savedPath = '';
    if (options.saveDir && options.toolName) {
      savedPath = this.saveData(output, options.saveDir, options.toolName);
    }

    let text = encode(output);
    if (savedPath) text += `\n\n[Cleaned data saved to: ${savedPath}]`;

    return { content: [{ type: 'text', text }] };
  }

  private async getUserByUsername(username: string, saveDir?: string, maxItems?: number): Promise<CallToolResult> {
    const data = await this.makeRequest(`/user/info`, { userName: username });
    const cleaned = DataCleaners.cleanUser(data.data || data);
    return this.formatResponse(cleaned, { ...(saveDir && { saveDir }), toolName: 'get_user_by_username' });
  }

  private async getUserById(userId: string, saveDir?: string, maxItems?: number): Promise<CallToolResult> {
    const data = await this.makeRequest(`/user/info`, { user_id: userId });
    const cleaned = DataCleaners.cleanUser(data.data || data);
    return this.formatResponse(cleaned, { ...(saveDir && { saveDir }), toolName: 'get_user_by_id' });
  }

  private async getUserTweets(
    username?: string,
    userId?: string,
    cursor?: string,
    includeReplies: boolean = false,
    saveDir?: string,
    maxItems?: number
  ): Promise<CallToolResult> {
    if (!username && !userId) {
      throw new Error('Either username or userId must be provided');
    }

    const params: Record<string, any> = {};
    if (username) params.userName = username;
    if (userId) params.userId = userId;
    if (cursor) params.cursor = cursor;
    params.includeReplies = includeReplies;

    const data = await this.makeRequest(`/user/last_tweets`, params);
    const tweets = data.tweets || data.data || [];
    const max = maxItems || 10;
    const cleaned = DataCleaners.cleanTweetList(tweets).slice(0, max);
    return this.formatResponse(cleaned, {
      ...(saveDir && { saveDir }),
      toolName: 'get_user_tweets',
      pagination: { has_next_page: data.has_next_page, next_cursor: data.next_cursor }
    });
  }

  private async searchTweets(
    query: string,
    queryType: string = 'Latest',
    cursor?: string,
    saveDir?: string,
    maxItems?: number
  ): Promise<CallToolResult> {
    const params: Record<string, any> = { query, queryType };
    if (cursor) params.cursor = cursor;

    const data = await this.makeRequest(`/tweet/advanced_search`, params);
    const tweets = data.tweets || data.data || [];
    const max = maxItems || 10;
    const cleaned = DataCleaners.cleanTweetList(tweets).slice(0, max);
    return this.formatResponse(cleaned, {
      ...(saveDir && { saveDir }),
      toolName: 'search_tweets',
      pagination: { has_next_page: data.has_next_page, next_cursor: data.next_cursor }
    });
  }

  private async getTweetById(tweetIds: string[], saveDir?: string, maxItems?: number): Promise<CallToolResult> {
    const data = await this.makeRequest(`/tweets`, { tweet_ids: tweetIds.join(',') });
    const tweets = data.tweets || data.data || [];
    const cleaned = DataCleaners.cleanTweetList(tweets);
    return this.formatResponse(cleaned, { ...(saveDir && { saveDir }), toolName: 'get_tweet_by_id' });
  }

  private async getTweetReplies(
    tweetId: string,
    cursor?: string,
    sinceTime?: number,
    untilTime?: number,
    saveDir?: string,
    maxItems?: number
  ): Promise<CallToolResult> {
    const params: Record<string, any> = { tweetId };
    if (cursor) params.cursor = cursor;
    if (sinceTime) params.sinceTime = sinceTime;
    if (untilTime) params.untilTime = untilTime;

    const data = await this.makeRequest(`/tweet/replies`, params);
    const tweets = data.tweets || data.replies || data.data || [];
    const max = maxItems || 10;
    const cleaned = DataCleaners.cleanTweetList(tweets).slice(0, max);
    return this.formatResponse(cleaned, {
      ...(saveDir && { saveDir }),
      toolName: 'get_tweet_replies',
      pagination: { has_next_page: data.has_next_page, next_cursor: data.next_cursor }
    });
  }

  private async getUserFollowers(
    username: string,
    cursor?: string,
    pageSize: number = 200,
    saveDir?: string,
    maxItems?: number
  ): Promise<CallToolResult> {
    const params: Record<string, any> = {
      userName: username,
      pageSize: Math.min(pageSize, 200),
    };
    if (cursor) params.cursor = cursor;

    const data = await this.makeRequest(`/user/followers`, params);
    const users = data.users || data.followers || data.data || [];
    const max = maxItems || 10;
    const cleaned = DataCleaners.cleanUserList(users).slice(0, max);
    return this.formatResponse(cleaned, {
      ...(saveDir && { saveDir }),
      toolName: 'get_user_followers',
      pagination: { has_next_page: data.has_next_page, next_cursor: data.next_cursor }
    });
  }

  private async getUserFollowing(
    username: string,
    cursor?: string,
    pageSize: number = 200,
    saveDir?: string,
    maxItems?: number
  ): Promise<CallToolResult> {
    const params: Record<string, any> = {
      userName: username,
      pageSize: Math.min(pageSize, 200),
    };
    if (cursor) params.cursor = cursor;

    const data = await this.makeRequest(`/user/followings`, params);
    const users = data.followings || data.users || data.data || [];
    const max = maxItems || 10;
    const cleaned = DataCleaners.cleanUserList(users).slice(0, max);
    return this.formatResponse(cleaned, {
      ...(saveDir && { saveDir }),
      toolName: 'get_user_following',
      pagination: { has_next_page: data.has_next_page, next_cursor: data.next_cursor }
    });
  }

  private async searchUsers(query: string, cursor?: string, saveDir?: string, maxItems?: number): Promise<CallToolResult> {
    const params: Record<string, any> = { query };
    if (cursor) params.cursor = cursor;

    const data = await this.makeRequest(`/user/search`, params);
    const users = data.users || data.data || [];
    const max = maxItems || 10;
    const cleaned = DataCleaners.cleanUserList(users).slice(0, max);
    return this.formatResponse(cleaned, {
      ...(saveDir && { saveDir }),
      toolName: 'search_users',
      pagination: { has_next_page: data.has_next_page, next_cursor: data.next_cursor }
    });
  }

  private async loginUser(
    userName: string,
    email: string,
    password: string,
    proxy: string,
    totpSecret?: string
  ): Promise<CallToolResult> {
    try {
      const loginPayload: Record<string, any> = {
        user_name: userName,
        email,
        password,
        proxy,
      };
      if (totpSecret) {
        loginPayload.totp_secret = totpSecret;
      }

      const loginData = await this.makePostRequest('/user_login_v2', loginPayload);

      // Store login cookie for future requests (API returns login_cookie)
      if (loginData.login_cookie) {
        this.loginCookie = loginData.login_cookie;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: loginData.status === 'success',
              message: loginData.msg || 'Login successful',
              login_cookie: loginData.login_cookie,
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Login failed',
            }, null, 2),
          },
        ],
      };
    }
  }

  private async createTweet(
    tweetText: string,
    proxy: string,
    replyToTweetId?: string,
    attachmentUrl?: string,
    mediaIds?: string[]
  ): Promise<CallToolResult> {
    if (!this.loginCookie) {
      throw new Error('Must login first before creating tweets');
    }

    const tweetData: Record<string, any> = {
      login_cookies: this.loginCookie,
      tweet_text: tweetText,
      proxy,
    };
    if (replyToTweetId) {
      tweetData.reply_to_tweet_id = replyToTweetId;
    }
    if (attachmentUrl) {
      tweetData.attachment_url = attachmentUrl;
    }
    if (mediaIds && mediaIds.length > 0) {
      tweetData.media_ids = mediaIds;
    }

    const data = await this.makePostRequest('/create_tweet_v2', tweetData);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('TwitterAPI.io MCP server running on stdio');
  }
}

const server = new TwitterAPIMCPServer();
server.run().catch(console.error);