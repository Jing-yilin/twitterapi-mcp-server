# TwitterAPI MCP Server

A Model Context Protocol (MCP) server that provides access to Twitter data through the [TwitterAPI.io](https://twitterapi.io/) service. This server enables Claude and other MCP clients to interact with Twitter's ecosystem without requiring Twitter developer account approval.

> **Attribution**: This project is a fork of [kinhunt/twitterapi-mcp](https://github.com/kinhunt/twitterapi-mcp) with bug fixes and improvements to match the official TwitterAPI.io documentation.

## Features

- **User Information**: Get detailed user profiles, followers, and following lists
- **Tweet Operations**: Search tweets, get tweet details, replies, and user timelines
- **Search Capabilities**: Advanced search for both tweets and users
- **Write Actions**: Post tweets and interact with content (requires login)
- **Pagination Support**: All list endpoints support cursor-based pagination
- **Enterprise Ready**: Proxy support and robust error handling
- **No Twitter Auth**: Uses TwitterAPI.io which doesn't require Twitter developer approval

## Installation

### Quick Start with npx (Recommended)

```bash
npx twitterapi-mcp-server
```

### Global Installation

```bash
npm install -g twitterapi-mcp-server
```

### Local Installation

```bash
npm install twitterapi-mcp-server
```

## Configuration

### Getting an API Key

1. Visit [TwitterAPI.io](https://twitterapi.io/)
2. Create an account and log in
3. Get your API key from the dashboard
4. The API key format looks like: `new1_xxxxxxxxxxxxxxxxxxxxx`

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TWITTERAPI_API_KEY` | Yes | Your TwitterAPI.io API key |
| `PROXY_URL` | No | Proxy URL for enterprise environments |
| `HTTP_PROXY` | No | Alternative proxy configuration |
| `HTTPS_PROXY` | No | Alternative proxy configuration |

## MCP Client Configuration

### Claude Desktop

Add this to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "twitterapi": {
      "command": "npx",
      "args": ["-y", "twitterapi-mcp-server"],
      "env": {
        "TWITTERAPI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Claude Desktop with Proxy

```json
{
  "mcpServers": {
    "twitterapi": {
      "command": "npx",
      "args": ["-y", "twitterapi-mcp-server"],
      "env": {
        "TWITTERAPI_API_KEY": "your_api_key_here",
        "PROXY_URL": "http://proxy.company.com:8080"
      }
    }
  }
}
```

### Cursor IDE

Add to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "twitterapi": {
      "command": "npx",
      "args": ["-y", "twitterapi-mcp-server"],
      "env": {
        "TWITTERAPI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "twitterapi": {
      "command": "npx",
      "args": ["-y", "twitterapi-mcp-server"],
      "env": {
        "TWITTERAPI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Using with Node directly

If you prefer to run with Node directly instead of npx:

```json
{
  "mcpServers": {
    "twitterapi": {
      "command": "node",
      "args": ["/path/to/twitterapi-mcp-server/build/index.js"],
      "env": {
        "TWITTERAPI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Available Tools

### User Information

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `get_user_by_username` | Get user details by username | `username` | - |
| `get_user_by_id` | Get user details by user ID | `user_id` | - |
| `get_user_followers` | Get user's followers (200/page) | `username` | `cursor`, `pageSize` |
| `get_user_following` | Get users someone follows (200/page) | `username` | `cursor`, `pageSize` |
| `search_users` | Search for users by keyword | `query` | `cursor` |

### Tweet Operations

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `get_user_tweets` | Get tweets from a user (20/page) | `username` or `userId` | `cursor`, `includeReplies` |
| `search_tweets` | Search tweets by keywords | `query` | `queryType` (Latest/Top), `cursor` |
| `get_tweet_by_id` | Get tweets by IDs | `tweet_ids` (array) | - |
| `get_tweet_replies` | Get replies to a tweet (20/page) | `tweetId` | `cursor`, `sinceTime`, `untilTime` |

### Write Actions (Requires Login)

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `login_user` | Login to Twitter account | `user_name`, `email`, `password`, `proxy` | `totp_secret` |
| `create_tweet` | Post new tweets | `tweet_text`, `proxy` | `reply_to_tweet_id`, `attachment_url`, `media_ids` |

## Examples

### Get User Information

```typescript
// Get user by username
await get_user_by_username({ username: "elonmusk" })

// Get user followers with pagination
await get_user_followers({
  username: "elonmusk",
  pageSize: 100
})

// Get next page using cursor
await get_user_followers({
  username: "elonmusk",
  cursor: "next_cursor_from_previous_response"
})
```

### Search and Retrieve Tweets

```typescript
// Search latest tweets
await search_tweets({
  query: "artificial intelligence",
  queryType: "Latest"
})

// Search top/popular tweets
await search_tweets({
  query: "OpenAI",
  queryType: "Top"
})

// Advanced search with operators
await search_tweets({
  query: "AI from:elonmusk since:2024-01-01"
})

// Get user's recent tweets
await get_user_tweets({ username: "openai" })

// Get user's tweets including replies
await get_user_tweets({
  username: "openai",
  includeReplies: true
})

// Get specific tweets by IDs
await get_tweet_by_id({
  tweet_ids: ["1234567890123456789", "9876543210987654321"]
})

// Get replies to a tweet
await get_tweet_replies({
  tweetId: "1234567890123456789"
})
```

### Create Content (Requires Login)

```typescript
// Login first (requires residential proxy)
await login_user({
  user_name: "your_username",
  email: "your_email@example.com",
  password: "your_password",
  proxy: "http://user:pass@proxy:port"
})

// Post a tweet
await create_tweet({
  tweet_text: "Hello from MCP!",
  proxy: "http://user:pass@proxy:port"
})

// Reply to a tweet
await create_tweet({
  tweet_text: "Great point!",
  reply_to_tweet_id: "1234567890123456789",
  proxy: "http://user:pass@proxy:port"
})
```

## Pagination

All list endpoints return paginated results with cursor-based navigation:

```json
{
  "data": [...],
  "has_next_page": true,
  "next_cursor": "cursor_string_for_next_page"
}
```

To get the next page, pass the `next_cursor` value as the `cursor` parameter in your next request.

## API Pricing

TwitterAPI.io offers pay-as-you-go pricing:

| Operation | Price |
|-----------|-------|
| Tweets | $0.15 per 1,000 |
| User profiles | $0.18 per 1,000 |
| Followers/Following | $0.15 per 1,000 |
| Login | $0.003 per call |
| Create tweet | $0.003 per call |

- Minimum charge: $0.00015 per request
- No monthly fees
- Free trial credits available
- Discounted rates for students and research institutions

## Development

### Building from Source

```bash
git clone https://github.com/Jing-yilin/twitterapi-mcp-server.git
cd twitterapi-mcp-server
npm install
npm run build
```

### Running Tests

```bash
# Using bun
bun test

# Or with npm (requires bun installed)
npm test
```

### Testing the Server Manually

```bash
# Set your API key
export TWITTERAPI_API_KEY="your_api_key"

# Test tools list
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node build/index.js

# Test a tool call
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_user_by_username", "arguments": {"username": "elonmusk"}}}' | node build/index.js
```

## Project Structure

```
twitterapi-mcp-server/
├── src/
│   ├── index.ts           # Main server implementation
│   ├── index.test.ts      # Unit tests
│   └── integration.test.ts # Integration tests
├── build/                  # Compiled JavaScript
├── package.json
├── tsconfig.json
└── README.md
```

## Error Handling

The server handles common errors:

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid API key | Check your `TWITTERAPI_API_KEY` |
| 402 Payment Required | Insufficient credits | Add credits at TwitterAPI.io dashboard |
| 429 Rate Limited | Too many requests | Wait and retry, or reduce request rate |
| 400 Bad Request | Invalid parameters | Check parameter names and formats |

## Security Considerations

- Store API keys as environment variables, never in code
- Login credentials are used only for authentication, not stored persistently
- All API requests use HTTPS
- Proxy support available for enterprise security requirements
- The `login_cookie` from login is stored in memory only for the session

## Troubleshooting

### "Unauthorized" error
- Verify your API key is correct
- Check that `TWITTERAPI_API_KEY` environment variable is set

### "Credits not enough" error
- Add credits to your TwitterAPI.io account
- Check your usage at the dashboard

### Server not starting
- Ensure Node.js >= 18.0.0 is installed
- Run `npm run build` to compile TypeScript
- Check for error messages in stderr

### Proxy issues
- Verify proxy URL format: `http://user:pass@host:port`
- Test proxy connectivity independently
- For HTTPS proxies, use `HTTPS_PROXY` variable

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **API Documentation**: [docs.twitterapi.io](https://docs.twitterapi.io/)
- **Issues**: [GitHub Issues](https://github.com/Jing-yilin/twitterapi-mcp-server/issues)
- **TwitterAPI.io Support**: [twitterapi.io](https://twitterapi.io/)

## Acknowledgments

- Originally forked from [kinhunt/twitterapi-mcp](https://github.com/kinhunt/twitterapi-mcp)
- Built on [TwitterAPI.io](https://twitterapi.io/) service
- Uses the [Model Context Protocol](https://modelcontextprotocol.io/)
- Part of the growing MCP ecosystem

---

**Note**: This is an unofficial MCP server for TwitterAPI.io. Make sure to comply with Twitter's Terms of Service when using this tool.
