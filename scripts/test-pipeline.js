#!/usr/bin/env node

// Test script to run the pipeline with sample data
// Usage: node scripts/test-pipeline.js

const samplePicksheet = `Week 18 NFL & NCAAF Games

NFL Games:
1 pt Army (1-2) +5.5 Thu 4:30 PM EAST CAROLINA (2-2) -5.5
1 pt #24 TCU (3-0) +2.5 Fri 6:00 PM ARIZONA ST. (3-1) -2.5
1 pt Marshall (2-2) +1.5 Sat 5:00 PM UL LAFAYETTE (1-3) -1.5
1 pt Baylor (2-2) -20.5 Sat 12:30 PM OKLAHOMA ST. (1-2) +20.5
1 pt Green Bay -3.5 Sun 1:00 PM CHICAGO +3.5
1 pt Dallas -7 Sun 1:00 PM WASHINGTON +7
1 pt Kansas City -10.5 Sun 1:00 PM DENVER +10.5
1 pt Buffalo -3.5 Sun 1:00 PM NEW ENGLAND +3.5
1 pt Tennessee +6 Sun 4:00 PM HOUSTON -6
1 pt Seattle -4 Sun 4:00 PM SAN FRANCISCO +4
1 pt Minnesota -2.5 Mon 1:00 PM DETROIT +2.5
`;

async function runPipeline() {
  console.log('🚀 Starting pipeline test...\n');

  try {
    const response = await fetch('http://localhost:3000/api/pipeline/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        picksheetText: samplePicksheet,
        useOddsAPI: true,
        useLLM: true,
        includeLogs: true,
        matchingThreshold: 0.4
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.pipeline) {
      console.log('✅ Pipeline executed successfully!\n');

      // Display summary
      const pipeline = data.pipeline;
      console.log('📊 Summary:');
      console.log(`   Status: ${pipeline.status}`);
      console.log(`   Stage: ${pipeline.stage}`);

      if (pipeline.parsing) {
        console.log(`\n📝 Parsing:`);
        console.log(`   Games found: ${pipeline.parsing.gamesFound}`);
        console.log(`   Success: ${pipeline.parsing.success}`);
      }

      if (pipeline.oddsRetrieval) {
        console.log(`\n🎲 Odds Retrieval:`);
        console.log(`   NFL games: ${pipeline.oddsRetrieval.nflGames}`);
        console.log(`   NCAAF games: ${pipeline.oddsRetrieval.ncaafGames}`);
        console.log(`   Success: ${pipeline.oddsRetrieval.success}`);
      }

      if (pipeline.matching) {
        console.log(`\n🔗 Matching:`);
        console.log(`   Match rate: ${(pipeline.matching.matchRate * 100).toFixed(1)}%`);
        console.log(`   Matched: ${pipeline.matching.matches} / ${pipeline.matching.totalGames}`);
      }

      if (pipeline.comparison && pipeline.comparison.kpis) {
        const kpis = pipeline.comparison.kpis;
        console.log(`\n📈 Comparison KPIs:`);
        console.log(`   Total games: ${kpis.totalGames}`);
        console.log(`   Matched games: ${kpis.matchedGames}`);
        console.log(`   Average spread delta: ${kpis.avgSpreadDelta.toFixed(2)}`);
        console.log(`   Key number crossings: ${kpis.keyNumberCrossings}`);
        console.log(`   Favorite flips: ${kpis.favoriteFlips}`);
      }

      if (pipeline.comparison && pipeline.comparison.comparisons) {
        console.log(`\n🏈 Game Comparisons (showing first 5):`);
        pipeline.comparison.comparisons.slice(0, 5).forEach(comp => {
          console.log(`\n   ${comp.awayTeam} @ ${comp.homeTeam}`);
          console.log(`   Pool: ${comp.picksheetSpread > 0 ? '+' : ''}${comp.picksheetSpread}`);
          console.log(`   Market: ${comp.marketSpread > 0 ? '+' : ''}${comp.marketSpread}`);
          console.log(`   Delta: ${comp.spreadDelta.toFixed(1)}`);
          if (comp.crossesKeyNumber) {
            console.log(`   ⚠️  Crosses key numbers: ${comp.keyNumbersCrossed.join(', ')}`);
          }
          if (comp.favoriteFlipped) {
            console.log(`   ⚠️  Favorite flipped!`);
          }
        });
      }

      // Save to localStorage for the frontend
      if (typeof window !== 'undefined') {
        localStorage.setItem('pipelineData', JSON.stringify(pipeline));
        console.log('\n💾 Data saved to localStorage');
      }

      console.log('\n✨ Pipeline test complete!');
      console.log('📱 Open http://localhost:3000 to view the results');

    } else {
      console.error('❌ Pipeline failed:', data.error || 'Unknown error');
      if (data.pipeline && data.pipeline.logs) {
        console.log('\n📋 Logs:');
        data.pipeline.logs.forEach(log => console.log(`   ${log}`));
      }
    }
  } catch (error) {
    console.error('❌ Error running pipeline:', error);
    console.log('\nMake sure:');
    console.log('1. The development server is running (npm run dev)');
    console.log('2. API keys are configured in .env file:');
    console.log('   - OPENAI_API_KEY');
    console.log('   - THE_ODDS_API_KEY or ODDS_API_KEY');
  }
}

// Run the test
runPipeline();