#!/bin/bash
# Quick test script to verify pipeline_current data sync

echo "🧪 Testing Pipeline Current Data Sync"
echo "======================================"

# Get your production URL
PROD_URL=${1:-"https://office-football-pool.vercel.app"}

echo ""
echo "📡 Fetching current pipeline data from: $PROD_URL"
echo ""

# Test the API endpoint
curl -s "$PROD_URL/api/pipeline/current" | jq '.'

echo ""
echo "======================================"
echo "✅ If you see pipeline data above, the sync is working!"
echo "❌ If you see 'No current pipeline data available', try saving data in control panel first"
