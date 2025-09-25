#!/usr/bin/env node

const testData = {
  picksheetText: `1 pt Green Bay -3.5 Sun 1:00 PM CHICAGO +3.5
1 pt Dallas -7 Sun 1:00 PM WASHINGTON +7
1 pt Kansas City -10.5 Sun 1:00 PM DENVER +10.5
1 pt Buffalo -3.5 Sun 1:00 PM NEW ENGLAND +3.5`,
  useOddsAPI: true,
  useLLM: true,
  includeLogs: false
};

console.log('Testing pipeline with new API key...\n');

try {
  const response = await fetch('http://localhost:3000/api/pipeline/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(testData)
  });

  const result = await response.json();

  if (result.success) {
    console.log('✅ Pipeline executed successfully!\n');

    if (result.pipeline?.parsing) {
      console.log('Parsing:', {
        success: result.pipeline.parsing.success,
        gamesFound: result.pipeline.parsing.gamesFound
      });
    }

    if (result.pipeline?.matching) {
      console.log('Matching:', {
        matchRate: `${(result.pipeline.matching.matchRate * 100).toFixed(1)}%`,
        matched: result.pipeline.matching.matches
      });
    }

    if (result.pipeline?.comparison?.kpis) {
      console.log('KPIs:', {
        totalGames: result.pipeline.comparison.kpis.totalGames,
        matchedGames: result.pipeline.comparison.kpis.matchedGames,
        avgSpreadDelta: result.pipeline.comparison.kpis.avgSpreadDelta?.toFixed(2)
      });
    }

    console.log('\n🎉 Your pipeline is working! You can now:');
    console.log('1. Go to http://localhost:3000/control-panel');
    console.log('2. Paste your full picksheet data');
    console.log('3. Click EXECUTE_ANALYSIS');
    console.log('4. View results at http://localhost:3000');

  } else {
    console.error('❌ Pipeline failed:', result);
  }
} catch (error) {
  console.error('❌ Error:', error.message);
}