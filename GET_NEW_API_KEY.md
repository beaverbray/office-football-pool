# ⚠️ URGENT: OpenAI API Key Issue

Your current OpenAI API key is **INVALID** and needs to be replaced immediately.

## The Problem

Your current key in `.env`:
```
OPENAI_API_KEY=sk-proj-yesl2MeonuLGBLH36...
```

Is being rejected by OpenAI with error:
```
401 Incorrect API key provided
```

## How to Fix This Issue

### Step 1: Get a New API Key

1. Go to https://platform.openai.com/api-keys
2. Sign in to your OpenAI account
3. Click "+ Create new secret key"
4. Give it a name like "office-football-pool"
5. **IMPORTANT**: Copy the ENTIRE key immediately (you won't be able to see it again!)

### Step 2: Update Your .env File

1. Open `.env` in your editor
2. Replace the entire line with your new key:
```
OPENAI_API_KEY=sk-proj-YOUR_NEW_KEY_HERE
```

### Step 3: Restart the Server

```bash
# Kill the current server
pkill -f "next dev"

# Start it again
npm run dev
```

### Step 4: Test It Works

Go to http://localhost:3000/control-panel and paste this sample data:

```
1 pt Green Bay -3.5 Sun 1:00 PM CHICAGO +3.5
1 pt Dallas -7 Sun 1:00 PM WASHINGTON +7
1 pt Kansas City -10.5 Sun 1:00 PM DENVER +10.5
1 pt Buffalo -3.5 Sun 1:00 PM NEW ENGLAND +3.5
```

Then click "EXECUTE_ANALYSIS"

## Alternative: Use a Different Model Provider

If you don't want to use OpenAI, you can use other providers:

### Option 1: Use Anthropic Claude
1. Get API key from https://console.anthropic.com/
2. Update `.env`:
```
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
```
3. Update the LLM parser to use Claude instead of GPT-4

### Option 2: Use Google Gemini (Free tier available)
1. Get API key from https://makersuite.google.com/app/apikey
2. Update `.env`:
```
GOOGLE_API_KEY=YOUR_KEY_HERE
```
3. Update the LLM parser to use Gemini

## Need Help?

If you're still having issues after getting a new key:
1. Make sure you copied the ENTIRE key (it should be about 50-164 characters)
2. Make sure there are no spaces or quotes around the key in `.env`
3. Try testing the key directly at https://platform.openai.com/playground

Your application is ready to work - it just needs a valid API key!