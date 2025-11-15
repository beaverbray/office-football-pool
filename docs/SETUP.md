# Setup Guide

## Required API Keys

This application requires two API keys to function properly:

### 1. OpenAI API Key (Required)
Used for parsing picksheet text using GPT-4.

**How to get it:**
1. Go to https://platform.openai.com/account/api-keys
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (it starts with `sk-`)

**Environment variable:**
```
OPENAI_API_KEY=sk-your-key-here
```

### 2. The Odds API Key (Required)
Used for fetching real-time sports betting odds.

**How to get it:**
1. Go to https://the-odds-api.com/
2. Click "Get API Key" or sign up
3. You'll receive a free API key with 500 requests/month
4. Copy your API key

**Environment variable:**
```
THE_ODDS_API_KEY=your-odds-api-key-here
```
or
```
ODDS_API_KEY=your-odds-api-key-here
```

## Supabase Database Connection

### Step 1: Get Your Supabase Credentials

1. Go to your Supabase Dashboard
2. Navigate to **Project Settings** → **Database**
3. Scroll to **Connection string** section
4. Select **Transaction pooler** mode
5. Copy the connection string (it will look like):
   ```
   postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```

### Step 2: Update .mcp.json

Replace the placeholder connection string in `.mcp.json`:

**Before:**
```json
"postgresql://postgres.YOUR_PROJECT_REF:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
```

**After** (with your actual credentials):
```json
"postgresql://postgres.abcdefghijk:your_actual_password@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
```

⚠️ **Important Notes**:
- Use the **Transaction pooler** connection string (port 6543), not the direct connection
- Your region may be different (e.g., `us-west-1` instead of `us-east-1`)
- The password is your database password, not your Supabase account password
- If you haven't set a database password, you'll need to reset it in Project Settings → Database

### Step 3: Alternative - Use Environment Variables (More Secure)

Instead of hardcoding the connection string, you can use environment variables:

**Update .mcp.json:**
```json
"supabase": {
  "type": "stdio",
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-postgres",
    "${SUPABASE_DATABASE_URL}"
  ]
}
```

**Add to your .env:**
```bash
SUPABASE_DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
```

This keeps your credentials out of the `.mcp.json` file.

## Environment Setup

1. Create a `.env` file in the project root:
```bash
touch .env
```

2. Add your API keys to the `.env` file:
```env
OPENAI_API_KEY=sk-your-openai-key-here
THE_ODDS_API_KEY=your-odds-api-key-here
SUPABASE_DATABASE_URL=postgresql://postgres.xxx:xxx@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

3. Restart the development server:
```bash
npm run dev
```

## Testing Your Setup

### Test via Control Panel:
1. Navigate to http://localhost:3000/control-panel
2. Enter some picksheet data (or use the sample below)
3. Click "EXECUTE_ANALYSIS"

### Sample Picksheet Data:
```
1 pt Green Bay -3.5 Sun 1:00 PM CHICAGO +3.5
1 pt Dallas -7 Sun 1:00 PM WASHINGTON +7
1 pt Kansas City -10.5 Sun 1:00 PM DENVER +10.5
1 pt Buffalo -3.5 Sun 1:00 PM NEW ENGLAND +3.5
```

## Troubleshooting

### OpenAI API Key Issues:
- **401 Error**: Your API key is invalid or expired
- **429 Error**: You've hit rate limits
- **Solution**: Verify your key at https://platform.openai.com/account/api-keys

### Odds API Issues:
- **No odds data**: API key may be invalid or you've exceeded your quota
- **Solution**: Check your usage at https://the-odds-api.com/account

### Supabase Connection Issues:

**"Connection refused" or "timeout"**
- Check that you're using the **Transaction pooler** connection string (port 6543)
- Verify your project is not paused (Supabase pauses inactive projects)
- Check your network/firewall settings

**"Authentication failed"**
- Verify your database password is correct
- Reset your database password if needed: Project Settings → Database → Reset Password

**"npx not found"**
- Ensure Node.js is installed: `node --version`
- Install Node.js from https://nodejs.org if needed

**MCP server not loading**
- Check `.mcp.json` syntax is valid JSON (no trailing commas)
- Look for error messages when starting Claude Code
- Try running the npx command directly to test:
  ```bash
  npx -y @modelcontextprotocol/server-postgres "YOUR_CONNECTION_STRING"
  ```

### Environment Variables Not Loading:
- Make sure `.env` file is in the project root
- Restart the development server after adding/changing keys
- Check that there are no spaces around the `=` sign in `.env`

## Restart Claude Code

After updating `.mcp.json`, restart Claude Code:

```bash
# Exit current session (Ctrl+C or type 'exit')
# Then restart
claude
```

Once restarted, Claude will have access to MCP tools for database operations.
