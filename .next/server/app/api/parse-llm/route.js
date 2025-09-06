"use strict";(()=>{var e={};e.id=963,e.ids=[963],e.modules={399:e=>{e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},517:e=>{e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},2117:(e,a,t)=>{t.r(a),t.d(a,{originalPathname:()=>g,patchFetch:()=>h,requestAsyncStorage:()=>p,routeModule:()=>d,serverHooks:()=>u,staticGenerationAsyncStorage:()=>c});var r={};t.r(r),t.d(r,{POST:()=>m});var o=t(9303),s=t(8716),n=t(670),i=t(7070),l=t(5594);async function m(e){try{let{text:a}=await e.json();if(!a)return i.NextResponse.json({error:"No text provided"},{status:400});if(!process.env.OPENAI_API_KEY)return console.error("OpenAI API key not found in environment variables"),i.NextResponse.json({error:"OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file"},{status:503});console.log("Parsing with LLM..."),console.log("API Key present:",!!process.env.OPENAI_API_KEY);let t=await l.O.parseWithLLM(a),r=l.O.toDatabase(t),o=l.O.formatForDisplay(t);return i.NextResponse.json({success:!0,parsed:t,rows:r,displayRows:o,summary:{total:t.totalGames,nfl:t.nflGames,ncaaf:t.ncaafGames,title:t.title,week:t.week}})}catch(e){if(console.error("Error in LLM parsing:",e),e instanceof Error&&e.message.includes("API key"))return i.NextResponse.json({error:"OpenAI API key not configured or invalid"},{status:503});return i.NextResponse.json({error:"Failed to parse picksheet with LLM"},{status:500})}}let d=new o.AppRouteRouteModule({definition:{kind:s.x.APP_ROUTE,page:"/api/parse-llm/route",pathname:"/api/parse-llm",filename:"route",bundlePath:"app/api/parse-llm/route"},resolvedPagePath:"/Users/jb/Development/office_football_pool/src/app/api/parse-llm/route.ts",nextConfigOutput:"",userland:r}),{requestAsyncStorage:p,staticGenerationAsyncStorage:c,serverHooks:u}=d,g="/api/parse-llm/route";function h(){return(0,n.patchFetch)({serverHooks:u,staticGenerationAsyncStorage:c})}},5594:(e,a,t)=>{t.d(a,{O:()=>l});var r=t(8319),o=t(1067);let s=new r.ZP({apiKey:process.env.OPENAI_API_KEY}),n=o.Ry({league:o.Km(["NFL","NCAAF"]).describe("League: NFL or NCAAF (college football)"),awayTeam:o.Z_().describe("Away team name (visiting team)"),awayRecord:o.Z_().optional().describe('Away team record if provided (e.g., "7-10")'),awaySpread:o.Rx().describe("Away team spread (positive or negative number)"),homeTeam:o.Z_().describe("Home team name (usually in CAPS in the picksheet)"),homeRecord:o.Z_().optional().describe("Home team record if provided"),homeSpread:o.Rx().describe("Home team spread (positive or negative number)"),gameDay:o.Z_().optional().describe('Day of week (e.g., "Thu", "Fri", "Sat", "Sun", "Mon")'),gameDate:o.Z_().optional().describe('Game date if provided (e.g., "January 5, 2025")'),gameTime:o.Z_().optional().describe('Game time (e.g., "5:20 PM", "1:00 PM")'),overUnder:o.Rx().optional().describe("Over/under total if provided (e.g., 42.5)"),points:o.Rx().optional().describe("Point value for this pick if provided")}),i=o.Ry({title:o.Z_().optional().describe("Title of the picksheet if provided"),week:o.Z_().optional().describe("Week number or description"),games:o.IX(n).describe("List of all games in the picksheet"),totalGames:o.Rx().describe("Total number of games parsed"),nflGames:o.Rx().describe("Number of NFL games"),ncaafGames:o.Rx().describe("Number of NCAAF/college games")});class l{static async parseWithLLM(e){try{let a;if(!process.env.OPENAI_API_KEY)throw Error("OpenAI API key not configured");console.log("Starting LLM parse with text length:",e.length);let t=`You are an expert sports betting picksheet parser. Your job is to extract structured data from picksheet text and return it as valid JSON.

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

${e}`,o=(await s.chat.completions.create({model:"gpt-4o-mini",messages:[{role:"system",content:t},{role:"user",content:r}],response_format:{type:"json_object"},temperature:0,max_tokens:16e3})).choices[0].message.content;if(!o)throw Error("No response from OpenAI");console.log("Raw LLM response length:",o.length);try{a=JSON.parse(o)}catch(t){console.error("JSON parse error:",t),console.error("Raw response (first 500 chars):",o.substring(0,500)),console.error("Raw response (last 500 chars):",o.substring(o.length-500));let e=o;if(!e.trim().endsWith("}")){console.log("Response appears truncated, attempting to fix...");let a=e.lastIndexOf("},");if(a>0){let t=((e=e.substring(0,a+1)+"],").match(/"league":/g)||[]).length,r=(e.match(/"league"\s*:\s*"NFL"/g)||[]).length,o=(e.match(/"league"\s*:\s*"NCAAF"/g)||[]).length;e+=`"totalGames":${t},"nflGames":${r},"ncaafGames":${o}}`}}if(((e=e.replace(/,(\s*[}\]])/g,"$1")).match(/"/g)||[]).length%2!=0){let a=e.lastIndexOf('"'),t=e.substring(a+1);if(!t.includes('"')&&(t.includes(",")||t.includes("}")||t.includes("]"))){let r=t.match(/[,}\]]/);if(r){let o=a+1+t.indexOf(r[0]);e=e.substring(0,o)+'"'+e.substring(o)}}}try{a=JSON.parse(e),console.log("Successfully repaired JSON")}catch(e){throw console.error("Failed to repair JSON:",e),Error(`Failed to parse LLM response as JSON. Response length: ${o.length}. Error: ${t}`)}}let n=(a.games||[]).map(e=>({...e,awayRecord:e.awayRecord||void 0,homeRecord:e.homeRecord||void 0,gameDay:e.gameDay||void 0,gameDate:e.gameDate||void 0,gameTime:e.gameTime||void 0,overUnder:e.overUnder??void 0,points:e.points??void 0}));return i.parse({title:a.title||void 0,week:a.week||void 0,games:n,totalGames:a.totalGames||n.length||0,nflGames:a.nflGames||n.filter(e=>"NFL"===e.league).length||0,ncaafGames:a.ncaafGames||n.filter(e=>"NCAAF"===e.league).length||0})}catch(e){throw console.error("Error parsing with LLM:",e),e}}static toDatabase(e,a){return e.games.map((e,t)=>({id:`llm-${t+1}`,source_run_id:a||null,league:e.league,event_date_local:e.gameDate||null,event_time_local:e.gameTime||null,home_name_raw:e.homeTeam,away_name_raw:e.awayTeam,home_spread_raw:e.homeSpread,away_spread_raw:e.awaySpread,total_raw:e.overUnder||null,market:"spread",raw_text:`${e.awayTeam} ${e.awaySpread} @ ${e.homeTeam} ${e.homeSpread}${e.overUnder?` O/U ${e.overUnder}`:""}`,metadata:{awayRecord:e.awayRecord,homeRecord:e.homeRecord,gameDay:e.gameDay,gameDate:e.gameDate,points:e.points,overUnder:e.overUnder,parsedWithLLM:!0}}))}static formatForDisplay(e){return e.games.map(e=>({league:e.league,awayTeam:e.awayTeam,awaySpread:e.awaySpread,homeTeam:e.homeTeam,homeSpread:e.homeSpread,overUnder:e.overUnder||null,gameTime:`${e.gameDay||""} ${e.gameDate||""} ${e.gameTime||""}`.trim()||null}))}}}};var a=require("../../../webpack-runtime.js");a.C(e);var t=e=>a(a.s=e),r=a.X(0,[948,972,319,67],()=>t(2117));module.exports=r})();