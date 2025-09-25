"use strict";exports.id=880,exports.ids=[880],exports.modules={5594:(e,a,t)=>{t.d(a,{O:()=>n});var r=t(8319),s=t(1067);let o=s.Ry({league:s.Km(["NFL","NCAAF"]).describe("League: NFL or NCAAF (college football)"),awayTeam:s.Z_().describe("Away team name (visiting team)"),awayRecord:s.Z_().optional().describe('Away team record if provided (e.g., "7-10")'),awaySpread:s.Rx().describe("Away team spread (positive or negative number)"),homeTeam:s.Z_().describe("Home team name (usually in CAPS in the picksheet)"),homeRecord:s.Z_().optional().describe("Home team record if provided"),homeSpread:s.Rx().describe("Home team spread (positive or negative number)"),gameDay:s.Z_().optional().describe('Day of week (e.g., "Thu", "Fri", "Sat", "Sun", "Mon")'),gameDate:s.Z_().optional().describe('Game date if provided (e.g., "January 5, 2025")'),gameTime:s.Z_().optional().describe('Game time (e.g., "5:20 PM", "1:00 PM")'),overUnder:s.Rx().optional().describe("Over/under total if provided (e.g., 42.5)"),points:s.Rx().optional().describe("Point value for this pick if provided")}),i=s.Ry({title:s.Z_().optional().describe("Title of the picksheet if provided"),week:s.Z_().optional().describe("Week number or description"),games:s.IX(o).describe("List of all games in the picksheet"),totalGames:s.Rx().describe("Total number of games parsed"),nflGames:s.Rx().describe("Number of NFL games"),ncaafGames:s.Rx().describe("Number of NCAAF/college games")});class n{static async parseWithLLM(e){try{let a;if(!process.env.OPENAI_API_KEY)throw Error("OpenAI API key not configured");let t=new r.ZP({apiKey:process.env.OPENAI_API_KEY});console.log("Starting LLM parse with text length:",e.length);let s=`You are an expert sports betting picksheet parser. Your job is to extract structured data from picksheet text and return it as valid JSON.

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

1. HOME vs AWAY team identification (VERY IMPORTANT - THIS IS THE PICKSHEET FORMAT):

   FORMAT: [points] [AWAY team] [AWAY spread] [day/time] [HOME team] [HOME spread]

   **KEY RULES**:
   - Team in ALL CAPS = HOME team (on the right side)
   - Team in regular case = AWAY team (on the left side)
   - The spread immediately follows each team name

   **SPECIAL CASES**:
   - Acronym teams (TCU, USC, UCLA, BYU, SMU, UNLV, UAB, UTEP, UTSA, etc.) may appear in caps even when away
   - If both teams appear capitalized, the NON-ACRONYM is HOME
   - Rankings (#1, #24, etc.) don't affect home/away determination

   **EXAMPLES FROM ACTUAL PICKSHEET**:
   - "1 pt Army (1-2) +5.5 Thu 4:30 PM EAST CAROLINA (2-2) -5.5"
     → Army = AWAY (left, regular case) with +5.5
     → EAST CAROLINA = HOME (right, ALL CAPS) with -5.5

   - "1 pt #24 TCU (3-0) +2.5 Fri 6:00 PM ARIZONA ST. (3-1) -2.5"
     → TCU = AWAY (left side, even though it's an acronym) with +2.5
     → ARIZONA ST. = HOME (right, ALL CAPS) with -2.5

   - "1 pt Baylor (2-2) -20.5 Sat 12:30 PM OKLAHOMA ST. (1-2) +20.5"
     → Baylor = AWAY (left, regular case) with -20.5
     → OKLAHOMA ST. = HOME (right, ALL CAPS) with +20.5

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

Remember: Return ONLY valid JSON, no explanations or additional text.`,o=`Parse this picksheet and extract all games with their details:

${e}`,n=(await t.chat.completions.create({model:"gpt-4o-mini",messages:[{role:"system",content:s},{role:"user",content:o}],response_format:{type:"json_object"},temperature:0,max_tokens:16e3})).choices[0].message.content;if(!n)throw Error("No response from OpenAI");console.log("Raw LLM response length:",n.length);try{a=JSON.parse(n)}catch(t){console.error("JSON parse error:",t),console.error("Raw response (first 500 chars):",n.substring(0,500)),console.error("Raw response (last 500 chars):",n.substring(n.length-500));let e=n;if(!e.trim().endsWith("}")){console.log("Response appears truncated, attempting to fix...");let a=e.lastIndexOf("},");if(a>0){let t=((e=e.substring(0,a+1)+"],").match(/"league":/g)||[]).length,r=(e.match(/"league"\s*:\s*"NFL"/g)||[]).length,s=(e.match(/"league"\s*:\s*"NCAAF"/g)||[]).length;e+=`"totalGames":${t},"nflGames":${r},"ncaafGames":${s}}`}}if(((e=e.replace(/,(\s*[}\]])/g,"$1")).match(/"/g)||[]).length%2!=0){let a=e.lastIndexOf('"'),t=e.substring(a+1);if(!t.includes('"')&&(t.includes(",")||t.includes("}")||t.includes("]"))){let r=t.match(/[,}\]]/);if(r){let s=a+1+t.indexOf(r[0]);e=e.substring(0,s)+'"'+e.substring(s)}}}try{a=JSON.parse(e),console.log("Successfully repaired JSON")}catch(e){throw console.error("Failed to repair JSON:",e),Error(`Failed to parse LLM response as JSON. Response length: ${n.length}. Error: ${t}`)}}let m=(a.games||[]).map(e=>({...e,awayRecord:e.awayRecord||void 0,homeRecord:e.homeRecord||void 0,gameDay:e.gameDay||void 0,gameDate:e.gameDate||void 0,gameTime:e.gameTime||void 0,overUnder:e.overUnder??void 0,points:e.points??void 0}));return i.parse({title:a.title||void 0,week:a.week||void 0,games:m,totalGames:a.totalGames||m.length||0,nflGames:a.nflGames||m.filter(e=>"NFL"===e.league).length||0,ncaafGames:a.ncaafGames||m.filter(e=>"NCAAF"===e.league).length||0})}catch(e){throw console.error("Error parsing with LLM:",e),e}}static toDatabase(e,a){return e.games.map((e,t)=>({id:`llm-${t+1}`,source_run_id:a||null,league:e.league,event_date_local:e.gameDate||null,event_time_local:e.gameTime||null,home_name_raw:e.homeTeam,away_name_raw:e.awayTeam,home_spread_raw:e.homeSpread,away_spread_raw:e.awaySpread,total_raw:e.overUnder||null,market:"spread",raw_text:`${e.awayTeam} ${e.awaySpread} @ ${e.homeTeam} ${e.homeSpread}${e.overUnder?` O/U ${e.overUnder}`:""}`,metadata:{awayRecord:e.awayRecord,homeRecord:e.homeRecord,gameDay:e.gameDay,gameDate:e.gameDate,points:e.points,overUnder:e.overUnder,parsedWithLLM:!0}}))}static formatForDisplay(e){return e.games.map(e=>({league:e.league,awayTeam:e.awayTeam,awaySpread:e.awaySpread,homeTeam:e.homeTeam,homeSpread:e.homeSpread,overUnder:e.overUnder||null,gameTime:`${e.gameDay||""} ${e.gameDate||""} ${e.gameTime||""}`.trim()||null}))}}},9880:(e,a,t)=>{t.d(a,{w:()=>m});var r=t(5594),s=t(2468),o=t(7359),i=t(5382);class n{async runPipeline(e,a={}){let t=this.generatePipelineId(),r=Date.now(),s={id:t,timestamp:new Date().toISOString(),status:"success",stage:"initializing",config:a};this.log(`Starting pipeline ${t}`);try{let o=e.picksheetGames;if(e.picksheetText&&!o){if(s.parsing=await this.parsePicksheet(e.picksheetText,a.useLLM),!s.parsing?.success)throw s.status="failed",s.stage="parsing",Error(s.parsing?.error||"Parsing failed");o=s.parsing?.games}if(!o||0===o.length)throw Error("No picksheet games to process");let i=e.marketGames;if(a.useOddsAPI&&!i&&(s.oddsRetrieval=await this.retrieveOdds(),s.oddsRetrieval?.success?i=s.oddsRetrieval?.games:(s.status="partial",s.stage="odds_retrieval",this.log(`Warning: Odds retrieval failed: ${s.oddsRetrieval?.error||"Unknown error"}`))),!i||0===i.length)throw Error("No market games available for comparison");if(s.matching=await this.matchGames(o,i,a.matchingThreshold),0===s.matching.matchRate)throw s.status="failed",s.stage="matching",Error("No games could be matched");return s.matching.matchRate<.5&&(s.status="partial",this.log(`Warning: Low match rate: ${(100*s.matching.matchRate).toFixed(1)}%`)),s.comparison=await this.compareGames(o,i,s.matching),s.comparison?.success||(s.status="partial",s.stage="comparison"),s.stage="completed",s.totalDuration=Date.now()-r,a.includeLogs&&(s.logs=[...this.logs]),this.results.set(t,s),this.log(`Pipeline ${t} completed in ${s.totalDuration}ms`),s}catch(e){throw s.status="failed",s.totalDuration=Date.now()-r,a.includeLogs&&(s.logs=[...this.logs]),this.log(`Pipeline ${t} failed: ${e instanceof Error?e.message:"Unknown error"}`),this.results.set(t,s),e}finally{this.clearLogs(),this._lastMatches=null}}async parsePicksheet(e,a=!0){let t=Date.now();this.currentStage="parsing",this.log("Starting picksheet parsing");try{let a=await r.O.parseWithLLM(e);if(!a||!a.games)return{success:!1,gamesFound:0,error:"Failed to parse picksheet",duration:Date.now()-t};this.log(`Parsed ${a.games.length} games from picksheet`);let s=a.games.map(e=>({homeTeam:e.homeTeam,awayTeam:e.awayTeam,spread:e.homeSpread,gameDate:e.gameDate||void 0}));return{success:!0,gamesFound:s.length,games:s,duration:Date.now()-t}}catch(e){return{success:!1,gamesFound:0,error:e instanceof Error?e.message:"Unknown parsing error",duration:Date.now()-t}}}async retrieveOdds(){let e=Date.now();this.currentStage="odds_retrieval",this.log("Retrieving odds from API");try{let a=(0,s.Rr)(),{nfl:t,ncaaf:r}=await a.getAllSpreads(),o=t.map(e=>{let a=s.q1.getBestSpread(e);return{gameId:e.id,homeTeam:a.homeTeam,awayTeam:a.awayTeam,homeSpread:a.homeSpread||0,gameTime:e.commence_time,league:"NFL"}}),i=r.map(e=>{let a=s.q1.getBestSpread(e);return{gameId:e.id,homeTeam:a.homeTeam,awayTeam:a.awayTeam,homeSpread:a.homeSpread||0,gameTime:e.commence_time,league:"NCAAF"}}),n=[...o,...i];return this.log(`Retrieved ${t.length} NFL and ${r.length} NCAAF games`),{success:!0,nflGames:t.length,ncaafGames:r.length,games:n,duration:Date.now()-e}}catch(a){return{success:!1,nflGames:0,ncaafGames:0,error:a instanceof Error?a.message:"Unknown API error",duration:Date.now()-e}}}async matchGames(e,a,t=.4){let r=Date.now();this.currentStage="matching",this.log("Matching games between picksheet and market");try{let s=new o.c,i=[];for(let r=0;r<e.length;r++){let o=e[r],n={marketIndex:-1,confidence:0,isSwapped:!1};for(let e=0;e<a.length;e++){let r=a[e],i=await s.matchTeam(o.homeTeam),m=await s.matchTeam(r.homeTeam),l=await s.matchTeam(o.awayTeam),c=await s.matchTeam(r.awayTeam),d=i.matchedName===m.matchedName&&l.matchedName===c.matchedName,h=i.matchedName===c.matchedName&&l.matchedName===m.matchedName;if(d||h){let a=Math.min(i.confidence,l.confidence,m.confidence,c.confidence);a>=t&&a>n.confidence&&(n={marketIndex:e,confidence:a,isSwapped:h})}}-1!==n.marketIndex&&i.push({picksheetIndex:r,marketIndex:n.marketIndex,confidence:n.confidence,isSwapped:n.isSwapped})}let n=i.length/e.length;return this.log(`Matched ${i.length} of ${e.length} games (${(100*n).toFixed(1)}%)`),this._lastMatches=i,{success:!0,matchRate:n,matches:i.length,totalGames:e.length,duration:Date.now()-r}}catch(a){return{success:!1,matchRate:0,matches:0,totalGames:e.length,error:a instanceof Error?a.message:"Unknown matching error",duration:Date.now()-r}}}async compareGames(e,a,t){let r=Date.now();this.currentStage="comparison",this.log("Comparing games and calculating KPIs");try{let s=a.map((e,a)=>{let r=t.matches?.find(e=>e.marketIndex===a);return r?.isSwapped?{...e,homeSpread:-e.homeSpread,homeTeam:e.awayTeam,awayTeam:e.homeTeam}:e}),o=i.b.compareGames(e,s,this._lastMatches||[]);return this.log(`Calculated KPIs: Avg delta ${o.kpis.avgSpreadDelta}, Key crossings ${o.kpis.keyNumberCrossings}`),{success:!0,kpis:o.kpis,comparisons:o.comparisons,unmatched:o.unmatched,duration:Date.now()-r}}catch(e){return{success:!1,error:e instanceof Error?e.message:"Unknown comparison error",duration:Date.now()-r}}}getPipelineResult(e){return this.results.get(e)}getAllResults(){return Array.from(this.results.values()).sort((e,a)=>new Date(a.timestamp).getTime()-new Date(e.timestamp).getTime())}clearResults(){this.results.clear(),this.log("Cleared all pipeline results")}getCurrentStage(){return this.currentStage}log(e){let a=new Date().toISOString(),t=`[${a}] [${this.currentStage}] ${e}`;this.logs.push(t),console.log(t)}clearLogs(){this.logs=[]}generatePipelineId(){return`pipeline_${Date.now()}_${Math.random().toString(36).substr(2,9)}`}constructor(){this.logs=[],this.currentStage="idle",this.results=new Map}}let m=new n}};