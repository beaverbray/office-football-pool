"use strict";exports.id=880,exports.ids=[880],exports.modules={5594:(e,a,t)=>{t.d(a,{O:()=>m});var r=t(8319),s=t(1067);let o=new r.ZP({apiKey:process.env.OPENAI_API_KEY}),n=s.Ry({league:s.Km(["NFL","NCAAF"]).describe("League: NFL or NCAAF (college football)"),awayTeam:s.Z_().describe("Away team name (visiting team)"),awayRecord:s.Z_().optional().describe('Away team record if provided (e.g., "7-10")'),awaySpread:s.Rx().describe("Away team spread (positive or negative number)"),homeTeam:s.Z_().describe("Home team name (usually in CAPS in the picksheet)"),homeRecord:s.Z_().optional().describe("Home team record if provided"),homeSpread:s.Rx().describe("Home team spread (positive or negative number)"),gameDay:s.Z_().optional().describe('Day of week (e.g., "Thu", "Fri", "Sat", "Sun", "Mon")'),gameDate:s.Z_().optional().describe('Game date if provided (e.g., "January 5, 2025")'),gameTime:s.Z_().optional().describe('Game time (e.g., "5:20 PM", "1:00 PM")'),overUnder:s.Rx().optional().describe("Over/under total if provided (e.g., 42.5)"),points:s.Rx().optional().describe("Point value for this pick if provided")}),i=s.Ry({title:s.Z_().optional().describe("Title of the picksheet if provided"),week:s.Z_().optional().describe("Week number or description"),games:s.IX(n).describe("List of all games in the picksheet"),totalGames:s.Rx().describe("Total number of games parsed"),nflGames:s.Rx().describe("Number of NFL games"),ncaafGames:s.Rx().describe("Number of NCAAF/college games")});class m{static async parseWithLLM(e){try{let a;if(!process.env.OPENAI_API_KEY)throw Error("OpenAI API key not configured");console.log("Starting LLM parse with text length:",e.length);let t=`You are an expert sports betting picksheet parser. Your job is to extract structured data from picksheet text and return it as valid JSON.

IMPORTANT: You must return ONLY valid JSON, no other text or explanation.

You must return a JSON object with this exact structure:
{
  "title": "optional title string",
  "week": "optional week string",
  "games": [
    {
      "league": "NFL" or "NCAAF",
      "awayTeam": "team name",
      "awayRecord": "optional record",
      "awaySpread": number,
      "homeTeam": "team name",
      "homeRecord": "optional record", 
      "homeSpread": number,
      "gameDay": "optional day",
      "gameDate": "optional date",
      "gameTime": "optional time",
      "overUnder": optional number,
      "points": optional number
    }
  ],
  "totalGames": number,
  "nflGames": number,
  "ncaafGames": number
}

CRITICAL PARSING RULES:

1. HOME vs AWAY team identification (VERY IMPORTANT):
   - @ symbol: Team BEFORE @ is AWAY, team AFTER @ is HOME (e.g., "Buffalo @ New England" = Buffalo away, New England home)
   - vs keyword: Team BEFORE vs is HOME, team AFTER vs is AWAY (e.g., "Dallas vs Washington" = Dallas home, Washington away)
   - Capital letters: Team in ALL CAPS is usually HOME (when no @ or vs present)
   - Default: First team is AWAY, second team is HOME (if no other indicators)

2. Spread parsing:
   - Each team has opposite spreads (if one is +3.5, the other is -3.5)
   - The spread belongs to the team it's next to
   - PK or PICK means 0 spread for both teams
   - Parse decimal spreads accurately (e.g., -3.5, +7.5)

3. Over/Under (O/U) parsing:
   - Look for "O/U", "o/u", "Over/Under" followed by a number
   - This is the total points, store in overUnder field
   - Common format: "O/U 42.5" or "O/U: 48"

4. League identification:
   - NFL teams: Professional teams (Cowboys, Chiefs, Packers, Bills, etc.)
   - NFL cities: Dallas, Kansas City, Green Bay, Buffalo, etc.
   - NCAAF indicators: State, University, Tech, A&M, rankings (#1, #11), school names

5. Date and time extraction:
   - Extract full dates like "January 5, 2025" or "Monday, January 6, 2025"
   - Extract days of week (Monday, Tuesday, Sun, Mon, etc.)
   - Extract times (1:00 PM, 5:20 PM, etc.)

6. Records: Extract if shown in parentheses (e.g., "(7-10)", "(10-2)")

7. Point values: Extract if shown (e.g., "1 pt", "2 points")

Remember: Return ONLY valid JSON, no explanations or additional text.`,r=`Parse this picksheet and extract all games with their details:

${e}`,s=(await o.chat.completions.create({model:"gpt-4o-mini",messages:[{role:"system",content:t},{role:"user",content:r}],response_format:{type:"json_object"},temperature:0,max_tokens:16e3})).choices[0].message.content;if(!s)throw Error("No response from OpenAI");console.log("Raw LLM response length:",s.length);try{a=JSON.parse(s)}catch(t){console.error("JSON parse error:",t),console.error("Raw response (first 500 chars):",s.substring(0,500)),console.error("Raw response (last 500 chars):",s.substring(s.length-500));let e=s;if(!e.trim().endsWith("}")){console.log("Response appears truncated, attempting to fix...");let a=e.lastIndexOf("},");if(a>0){let t=((e=e.substring(0,a+1)+"],").match(/"league":/g)||[]).length,r=(e.match(/"league"\s*:\s*"NFL"/g)||[]).length,s=(e.match(/"league"\s*:\s*"NCAAF"/g)||[]).length;e+=`"totalGames":${t},"nflGames":${r},"ncaafGames":${s}}`}}if(((e=e.replace(/,(\s*[}\]])/g,"$1")).match(/"/g)||[]).length%2!=0){let a=e.lastIndexOf('"'),t=e.substring(a+1);if(!t.includes('"')&&(t.includes(",")||t.includes("}")||t.includes("]"))){let r=t.match(/[,}\]]/);if(r){let s=a+1+t.indexOf(r[0]);e=e.substring(0,s)+'"'+e.substring(s)}}}try{a=JSON.parse(e),console.log("Successfully repaired JSON")}catch(e){throw console.error("Failed to repair JSON:",e),Error(`Failed to parse LLM response as JSON. Response length: ${s.length}. Error: ${t}`)}}let n=(a.games||[]).map(e=>({...e,awayRecord:e.awayRecord||void 0,homeRecord:e.homeRecord||void 0,gameDay:e.gameDay||void 0,gameDate:e.gameDate||void 0,gameTime:e.gameTime||void 0,overUnder:e.overUnder??void 0,points:e.points??void 0}));return i.parse({title:a.title||void 0,week:a.week||void 0,games:n,totalGames:a.totalGames||n.length||0,nflGames:a.nflGames||n.filter(e=>"NFL"===e.league).length||0,ncaafGames:a.ncaafGames||n.filter(e=>"NCAAF"===e.league).length||0})}catch(e){throw console.error("Error parsing with LLM:",e),e}}static toDatabase(e,a){return e.games.map((e,t)=>({id:`llm-${t+1}`,source_run_id:a||null,league:e.league,event_date_local:e.gameDate||null,event_time_local:e.gameTime||null,home_name_raw:e.homeTeam,away_name_raw:e.awayTeam,home_spread_raw:e.homeSpread,away_spread_raw:e.awaySpread,total_raw:e.overUnder||null,market:"spread",raw_text:`${e.awayTeam} ${e.awaySpread} @ ${e.homeTeam} ${e.homeSpread}${e.overUnder?` O/U ${e.overUnder}`:""}`,metadata:{awayRecord:e.awayRecord,homeRecord:e.homeRecord,gameDay:e.gameDay,gameDate:e.gameDate,points:e.points,overUnder:e.overUnder,parsedWithLLM:!0}}))}static formatForDisplay(e){return e.games.map(e=>({league:e.league,awayTeam:e.awayTeam,awaySpread:e.awaySpread,homeTeam:e.homeTeam,homeSpread:e.homeSpread,overUnder:e.overUnder||null,gameTime:`${e.gameDay||""} ${e.gameDate||""} ${e.gameTime||""}`.trim()||null}))}}},9880:(e,a,t)=>{t.d(a,{w:()=>m});var r=t(5594),s=t(2468),o=t(7359),n=t(5382);class i{async runPipeline(e,a={}){let t=this.generatePipelineId(),r=Date.now(),s={id:t,timestamp:new Date().toISOString(),status:"success",stage:"initializing",config:a};this.log(`Starting pipeline ${t}`);try{let o=e.picksheetGames;if(e.picksheetText&&!o){if(s.parsing=await this.parsePicksheet(e.picksheetText,a.useLLM),!s.parsing?.success)throw s.status="failed",s.stage="parsing",Error(s.parsing?.error||"Parsing failed");o=s.parsing?.games}if(!o||0===o.length)throw Error("No picksheet games to process");let n=e.marketGames;if(a.useOddsAPI&&!n&&(s.oddsRetrieval=await this.retrieveOdds(),s.oddsRetrieval?.success?n=s.oddsRetrieval?.games:(s.status="partial",s.stage="odds_retrieval",this.log(`Warning: Odds retrieval failed: ${s.oddsRetrieval?.error||"Unknown error"}`))),!n||0===n.length)throw Error("No market games available for comparison");if(s.matching=await this.matchGames(o,n,a.matchingThreshold),0===s.matching.matchRate)throw s.status="failed",s.stage="matching",Error("No games could be matched");return s.matching.matchRate<.5&&(s.status="partial",this.log(`Warning: Low match rate: ${(100*s.matching.matchRate).toFixed(1)}%`)),s.comparison=await this.compareGames(o,n,s.matching),s.comparison?.success||(s.status="partial",s.stage="comparison"),s.stage="completed",s.totalDuration=Date.now()-r,a.includeLogs&&(s.logs=[...this.logs]),this.results.set(t,s),this.log(`Pipeline ${t} completed in ${s.totalDuration}ms`),s}catch(e){throw s.status="failed",s.totalDuration=Date.now()-r,a.includeLogs&&(s.logs=[...this.logs]),this.log(`Pipeline ${t} failed: ${e instanceof Error?e.message:"Unknown error"}`),this.results.set(t,s),e}finally{this.clearLogs(),this._lastMatches=null}}async parsePicksheet(e,a=!0){let t=Date.now();this.currentStage="parsing",this.log("Starting picksheet parsing");try{let a=await r.O.parseWithLLM(e);if(!a||!a.games)return{success:!1,gamesFound:0,error:"Failed to parse picksheet",duration:Date.now()-t};this.log(`Parsed ${a.games.length} games from picksheet`);let s=a.games.map(e=>({homeTeam:e.homeTeam,awayTeam:e.awayTeam,spread:e.homeSpread,gameDate:e.gameDate||void 0}));return{success:!0,gamesFound:s.length,games:s,duration:Date.now()-t}}catch(e){return{success:!1,gamesFound:0,error:e instanceof Error?e.message:"Unknown parsing error",duration:Date.now()-t}}}async retrieveOdds(){let e=Date.now();this.currentStage="odds_retrieval",this.log("Retrieving odds from API");try{let a=(0,s.Rr)(),{nfl:t,ncaaf:r}=await a.getAllSpreads(),o=t.map(e=>{let a=s.q1.getBestSpread(e);return{gameId:e.id,homeTeam:a.homeTeam,awayTeam:a.awayTeam,homeSpread:a.homeSpread||0,gameTime:e.commence_time,league:"NFL"}}),n=r.map(e=>{let a=s.q1.getBestSpread(e);return{gameId:e.id,homeTeam:a.homeTeam,awayTeam:a.awayTeam,homeSpread:a.homeSpread||0,gameTime:e.commence_time,league:"NCAAF"}}),i=[...o,...n];return this.log(`Retrieved ${t.length} NFL and ${r.length} NCAAF games`),{success:!0,nflGames:t.length,ncaafGames:r.length,games:i,duration:Date.now()-e}}catch(a){return{success:!1,nflGames:0,ncaafGames:0,error:a instanceof Error?a.message:"Unknown API error",duration:Date.now()-e}}}async matchGames(e,a,t=.6){let r=Date.now();this.currentStage="matching",this.log("Matching games between picksheet and market");try{let s=new o.c,n=[];for(let r=0;r<e.length;r++){let o=e[r],i={marketIndex:-1,confidence:0};for(let e=0;e<a.length;e++){let r=a[e],n=await s.matchTeam(o.homeTeam),m=await s.matchTeam(r.homeTeam),l=await s.matchTeam(o.awayTeam),c=await s.matchTeam(r.awayTeam),d=n.matchedName===m.matchedName&&l.matchedName===c.matchedName,g=n.matchedName===c.matchedName&&l.matchedName===m.matchedName;if(d||g){let a=Math.min(n.confidence,l.confidence,m.confidence,c.confidence);a>=t&&a>i.confidence&&(i={marketIndex:e,confidence:a})}}-1!==i.marketIndex&&n.push({picksheetIndex:r,marketIndex:i.marketIndex,confidence:i.confidence})}let i=n.length/e.length;return this.log(`Matched ${n.length} of ${e.length} games (${(100*i).toFixed(1)}%)`),this._lastMatches=n,{success:!0,matchRate:i,matches:n.length,totalGames:e.length,duration:Date.now()-r}}catch(a){return{success:!1,matchRate:0,matches:0,totalGames:e.length,error:a instanceof Error?a.message:"Unknown matching error",duration:Date.now()-r}}}async compareGames(e,a,t){let r=Date.now();this.currentStage="comparison",this.log("Comparing games and calculating KPIs");try{let t=n.b.compareGames(e,a,this._lastMatches||[]);return this.log(`Calculated KPIs: Avg delta ${t.kpis.avgSpreadDelta}, Key crossings ${t.kpis.keyNumberCrossings}`),{success:!0,kpis:t.kpis,comparisons:t.comparisons,unmatched:t.unmatched,duration:Date.now()-r}}catch(e){return{success:!1,error:e instanceof Error?e.message:"Unknown comparison error",duration:Date.now()-r}}}getPipelineResult(e){return this.results.get(e)}getAllResults(){return Array.from(this.results.values()).sort((e,a)=>new Date(a.timestamp).getTime()-new Date(e.timestamp).getTime())}clearResults(){this.results.clear(),this.log("Cleared all pipeline results")}getCurrentStage(){return this.currentStage}log(e){let a=new Date().toISOString(),t=`[${a}] [${this.currentStage}] ${e}`;this.logs.push(t),console.log(t)}clearLogs(){this.logs=[]}generatePipelineId(){return`pipeline_${Date.now()}_${Math.random().toString(36).substr(2,9)}`}constructor(){this.logs=[],this.currentStage="idle",this.results=new Map}}let m=new i}};