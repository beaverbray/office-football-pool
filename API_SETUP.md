# API Setup Guide

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

## Setup Instructions

1. Create a `.env` file in the project root if it doesn't exist:
```bash
touch .env
```

2. Add your API keys to the `.env` file:
```env
OPENAI_API_KEY=sk-your-openai-key-here
THE_ODDS_API_KEY=your-odds-api-key-here
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

### Test via Script:
Run the test script:
```bash
node scripts/test-pipeline.js
```

## Troubleshooting

### OpenAI API Key Issues:
- **401 Error**: Your API key is invalid or expired
- **429 Error**: You've hit rate limits
- **Solution**: Verify your key at https://platform.openai.com/account/api-keys

### Odds API Issues:
- **No odds data**: API key may be invalid or you've exceeded your quota
- **Solution**: Check your usage at https://the-odds-api.com/account

### Environment Variables Not Loading:
- Make sure `.env` file is in the project root
- Restart the development server after adding/changing keys
- Check that there are no spaces around the `=` sign in `.env`

## Current Issue

⚠️ **Your OpenAI API key appears to be invalid.**

The error message indicates:
```
401 Incorrect API key provided: sk-proj-...
```

Please:
1. Get a new API key from https://platform.openai.com/account/api-keys
2. Update your `.env` file with the new key
3. Restart the development server