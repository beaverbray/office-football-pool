'use client'

import { useState } from 'react'
import { EntityResolver } from '@/services/entity-resolution'

interface ParsedGame {
  league: string
  awayTeam: string
  awaySpread: number
  homeTeam: string
  homeSpread: number
  overUnder?: number | null
  gameTime: string | null
}

interface OddsGame {
  gameId: string
  homeTeam: string
  awayTeam: string
  homeSpread: number | null
  awaySpread: number | null
  gameTime: string
  bookmaker: string | null
}

interface MatchResult {
  picksheetGame: ParsedGame
  oddsGame?: OddsGame
  homeMatch: {
    confidence: number
    method: string
  }
  awayMatch: {
    confidence: number
    method: string
  }
  overallConfidence: number
  matched: boolean
}

export default function IntegrationTestPage() {
  const [picksheetText, setPicksheetText] = useState('')
  const [parsedGames, setParsedGames] = useState<ParsedGame[]>([])
  const [oddsGames, setOddsGames] = useState<{ nfl: OddsGame[], ncaaf: OddsGame[] }>({ nfl: [], ncaaf: [] })
  const [matchResults, setMatchResults] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState({ parsing: false, odds: false, matching: false })
  const [activeTab, setActiveTab] = useState<'input' | 'parsed' | 'odds' | 'matches'>('input')

  const samplePicksheet = `NFL Week 18
Sunday, January 5, 2025

Buffalo Bills @ New England Patriots -3.5 O/U 42.5
Dallas Cowboys vs Washington Commanders +7 
Green Bay Packers @ Chicago Bears PK
Kansas City Chiefs vs Denver Broncos -10.5 O/U 48
Las Vegas Raiders @ Los Angeles Chargers +8.5

Monday, January 6, 2025
1:00 PM
Detroit Lions vs Minnesota Vikings -2.5 O/U 56.5

NCAAF Bowl Games
Monday, January 6, 2025

#11 Alabama (10-2) vs Michigan State (7-5) -14.5
#5 Georgia @ #12 Florida State (9-3) +21 O/U 55.5
Notre Dame vs Penn State -1.5`

  // Step 1: Parse picksheet with LLM
  const parsePicksheet = async () => {
    setLoading({ ...loading, parsing: true })
    
    try {
      const response = await fetch('/api/parse-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: picksheetText })
      })
      
      const data = await response.json()
      if (data.success) {
        setParsedGames(data.displayRows || [])
        setActiveTab('parsed')
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      console.error('Error parsing picksheet:', error)
      alert('Failed to parse picksheet. Make sure OpenAI API key is configured.')
    } finally {
      setLoading({ ...loading, parsing: false })
    }
  }

  // Step 2: Fetch odds from API
  const fetchOdds = async () => {
    setLoading({ ...loading, odds: true })
    
    try {
      const response = await fetch('/api/odds?sport=all')
      const data = await response.json()
      
      if (data.success && data.data) {
        setOddsGames({
          nfl: data.data.nfl?.games || [],
          ncaaf: data.data.ncaaf?.games || []
        })
        setActiveTab('odds')
      } else {
        throw new Error(data.error || 'Failed to fetch odds')
      }
    } catch (error) {
      console.error('Error fetching odds:', error)
      alert('Failed to fetch odds. Make sure THE_ODDS_API_KEY is configured.')
    } finally {
      setLoading({ ...loading, odds: false })
    }
  }

  // Step 3: Match picksheet games to odds
  const matchGames = async () => {
    if (parsedGames.length === 0 || (oddsGames.nfl.length === 0 && oddsGames.ncaaf.length === 0)) {
      alert('Please parse picksheet and fetch odds first')
      return
    }

    setLoading({ ...loading, matching: true })
    
    try {
      const resolver = new EntityResolver()
      const results: MatchResult[] = []
      
      // Get all odds games combined
      const allOddsGames = [
        ...oddsGames.nfl.map(g => ({ ...g, league: 'NFL' })),
        ...oddsGames.ncaaf.map(g => ({ ...g, league: 'NCAAF' }))
      ]
      
      // Match each parsed game
      for (const parsedGame of parsedGames) {
        // Get team matches - normalize parsed team names
        const homeMatch = await resolver.matchTeam(parsedGame.homeTeam, parsedGame.league as 'NFL' | 'NCAAF')
        const awayMatch = await resolver.matchTeam(parsedGame.awayTeam, parsedGame.league as 'NFL' | 'NCAAF')
        
        // Find best matching odds game
        let bestOddsMatch: OddsGame | undefined
        let bestScore = 0
        let bestSpreadDiff = 999
        
        // Helper function to parse date/time from game time string
        const parseGameDate = (timeStr: string | null) => {
          if (!timeStr) return null
          try {
            // Handle different date formats
            // Picksheet format: "Sun Jan 5 1:00 PM" or similar
            // Odds format: ISO string
            return new Date(timeStr)
          } catch {
            return null
          }
        }
        
        // Get parsed game date if available
        const parsedGameDate = parseGameDate(parsedGame.gameTime)
        
        for (const oddsGame of allOddsGames) {
          // First check if leagues match
          const leagueMatches = (parsedGame.league === 'NFL' && oddsGame.league === 'NFL') ||
                              (parsedGame.league === 'NCAAF' && oddsGame.league === 'NCAAF')
          
          if (!leagueMatches) continue
          
          // TEMPORARILY DISABLED: Time window filtering
          // Uncomment this block to enable date filtering
          /*
          const oddsGameDate = parseGameDate(oddsGame.gameTime)
          if (parsedGameDate && oddsGameDate) {
            const timeDiff = Math.abs(oddsGameDate.getTime() - parsedGameDate.getTime())
            const maxTimeDiff = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
            
            // Skip if games are more than a week apart
            if (timeDiff > maxTimeDiff) continue
          }
          */
          
          // Match odds teams to get their normalized names
          const oddsHomeMatch = await resolver.matchTeam(oddsGame.homeTeam)
          const oddsAwayMatch = await resolver.matchTeam(oddsGame.awayTeam)
          
          // Calculate match score based on whether the normalized names match
          let score = 0
          
          // Check if both home teams match AND both away teams match
          const homeTeamsMatch = homeMatch.matchedName.toLowerCase() === oddsHomeMatch.matchedName.toLowerCase()
          const awayTeamsMatch = awayMatch.matchedName.toLowerCase() === oddsAwayMatch.matchedName.toLowerCase()
          
          // Calculate spread difference for tie-breaking
          let spreadDiff = 999
          if (parsedGame.homeSpread !== null && oddsGame.homeSpread !== null) {
            spreadDiff = Math.abs(parsedGame.homeSpread - oddsGame.homeSpread)
          }
          
          // Only consider it a match if BOTH teams match correctly
          if (homeTeamsMatch && awayTeamsMatch) {
            score = 1.0 // Full match
            
            // Use spread difference as a tie-breaker
            // If we find multiple matches (rare), prefer the one with closer spread
            if (score > bestScore || (score === bestScore && spreadDiff < bestSpreadDiff)) {
              bestScore = score
              bestOddsMatch = oddsGame
              bestSpreadDiff = spreadDiff
            }
          }
        }
        
        results.push({
          picksheetGame: parsedGame,
          oddsGame: bestScore >= 1.0 ? bestOddsMatch : undefined,
          homeMatch: {
            confidence: homeMatch.confidence,
            method: homeMatch.method
          },
          awayMatch: {
            confidence: awayMatch.confidence,
            method: awayMatch.method
          },
          overallConfidence: (homeMatch.confidence + awayMatch.confidence) / 2,
          matched: bestScore >= 1.0
        })
      }
      
      setMatchResults(results)
      setActiveTab('matches')
    } catch (error) {
      console.error('Error matching games:', error)
      alert('Failed to match games')
    } finally {
      setLoading({ ...loading, matching: false })
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800'
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800'
    return 'bg-red-100 text-red-800'
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🔄 Full Pipeline Integration Test
          </h1>
          <p className="text-gray-600">
            Test the complete flow: Parse Picksheet → Fetch Odds → Match Games
          </p>
        </div>

        {/* Pipeline Steps */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Pipeline Steps</h2>
          <div className="flex gap-4 items-center">
            <button
              onClick={parsePicksheet}
              disabled={loading.parsing || !picksheetText}
              className={`px-4 py-2 rounded-lg text-white ${
                parsedGames.length > 0 ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
              } disabled:bg-gray-400`}
            >
              {loading.parsing ? '⏳ Parsing...' : parsedGames.length > 0 ? '✅ Parsed' : '1. Parse Picksheet'}
            </button>
            
            <span className="text-gray-400">→</span>
            
            <button
              onClick={fetchOdds}
              disabled={loading.odds}
              className={`px-4 py-2 rounded-lg text-white ${
                oddsGames.nfl.length > 0 || oddsGames.ncaaf.length > 0 ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
              } disabled:bg-gray-400`}
            >
              {loading.odds ? '⏳ Fetching...' : 
               (oddsGames.nfl.length > 0 || oddsGames.ncaaf.length > 0) ? '✅ Fetched' : '2. Fetch Odds'}
            </button>
            
            <span className="text-gray-400">→</span>
            
            <button
              onClick={matchGames}
              disabled={loading.matching || parsedGames.length === 0 || (oddsGames.nfl.length === 0 && oddsGames.ncaaf.length === 0)}
              className={`px-4 py-2 rounded-lg text-white ${
                matchResults.length > 0 ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
              } disabled:bg-gray-400`}
            >
              {loading.matching ? '⏳ Matching...' : matchResults.length > 0 ? '✅ Matched' : '3. Match Games'}
            </button>
            
            <button
              onClick={() => {
                setPicksheetText(samplePicksheet)
                setActiveTab('input')
              }}
              className="ml-auto px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Load Sample
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('input')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'input'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Input
              </button>
              <button
                onClick={() => setActiveTab('parsed')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'parsed'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Parsed ({parsedGames.length})
              </button>
              <button
                onClick={() => setActiveTab('odds')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'odds'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Odds ({oddsGames.nfl.length + oddsGames.ncaaf.length})
              </button>
              <button
                onClick={() => setActiveTab('matches')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'matches'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Matches ({matchResults.length})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* Input Tab */}
            {activeTab === 'input' && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Picksheet Text
                </label>
                <textarea
                  value={picksheetText}
                  onChange={(e) => setPicksheetText(e.target.value)}
                  className="w-full h-64 p-3 border rounded-lg font-mono text-xs"
                  placeholder="Paste your picksheet text here..."
                />
              </div>
            )}

            {/* Parsed Games Tab */}
            {activeTab === 'parsed' && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">League</th>
                      <th className="px-3 py-2 text-left">Away Team</th>
                      <th className="px-3 py-2 text-center">Spread</th>
                      <th className="px-3 py-2 text-left">Home Team</th>
                      <th className="px-3 py-2 text-center">Spread</th>
                      <th className="px-3 py-2 text-center">O/U</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedGames.map((game, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            game.league === 'NFL' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {game.league}
                          </span>
                        </td>
                        <td className="px-3 py-2">{game.awayTeam}</td>
                        <td className="px-3 py-2 text-center font-mono">
                          {game.awaySpread > 0 ? '+' : ''}{game.awaySpread}
                        </td>
                        <td className="px-3 py-2 font-medium">{game.homeTeam}</td>
                        <td className="px-3 py-2 text-center font-mono">
                          {game.homeSpread > 0 ? '+' : ''}{game.homeSpread}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-gray-600">
                          {game.overUnder || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Odds Tab */}
            {activeTab === 'odds' && (
              <div className="space-y-6">
                {oddsGames.nfl.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">NFL Games ({oddsGames.nfl.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Time</th>
                            <th className="px-3 py-2 text-left">Away</th>
                            <th className="px-3 py-2 text-center">Spread</th>
                            <th className="px-3 py-2 text-left">Home</th>
                            <th className="px-3 py-2 text-center">Spread</th>
                            <th className="px-3 py-2 text-left">Book</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {oddsGames.nfl.map((game, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 text-xs">{formatDate(game.gameTime)}</td>
                              <td className="px-3 py-2">{game.awayTeam}</td>
                              <td className="px-3 py-2 text-center font-mono">
                                {game.awaySpread ? `${game.awaySpread > 0 ? '+' : ''}${game.awaySpread}` : '-'}
                              </td>
                              <td className="px-3 py-2 font-medium">{game.homeTeam}</td>
                              <td className="px-3 py-2 text-center font-mono">
                                {game.homeSpread ? `${game.homeSpread > 0 ? '+' : ''}${game.homeSpread}` : '-'}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">{game.bookmaker || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {oddsGames.ncaaf.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">NCAAF Games ({oddsGames.ncaaf.length})</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Time</th>
                            <th className="px-3 py-2 text-left">Away</th>
                            <th className="px-3 py-2 text-center">Spread</th>
                            <th className="px-3 py-2 text-left">Home</th>
                            <th className="px-3 py-2 text-center">Spread</th>
                            <th className="px-3 py-2 text-left">Book</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {oddsGames.ncaaf.map((game, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 text-xs">{formatDate(game.gameTime)}</td>
                              <td className="px-3 py-2">{game.awayTeam}</td>
                              <td className="px-3 py-2 text-center font-mono">
                                {game.awaySpread ? `${game.awaySpread > 0 ? '+' : ''}${game.awaySpread}` : '-'}
                              </td>
                              <td className="px-3 py-2 font-medium">{game.homeTeam}</td>
                              <td className="px-3 py-2 text-center font-mono">
                                {game.homeSpread ? `${game.homeSpread > 0 ? '+' : ''}${game.homeSpread}` : '-'}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">{game.bookmaker || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Matches Tab */}
            {activeTab === 'matches' && (
              <div className="space-y-4">
                {matchResults.map((result, idx) => (
                  <div key={idx} className={`border rounded-lg p-4 ${
                    result.matched ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'
                  }`}>
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-semibold">
                        Game {idx + 1}: {result.picksheetGame.awayTeam} @ {result.picksheetGame.homeTeam}
                      </h3>
                      <div className="flex gap-2">
                        <span className={`px-2 py-1 text-xs rounded ${getConfidenceColor(result.overallConfidence)}`}>
                          {(result.overallConfidence * 100).toFixed(0)}% Confidence
                        </span>
                        <span className={`px-2 py-1 text-xs rounded ${
                          result.matched ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {result.matched ? '✅ Matched' : '❌ No Match'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-gray-600 mb-2">Picksheet Data</h4>
                        <div className="bg-white rounded p-3 text-sm space-y-1">
                          <p><span className="font-medium">Away:</span> {result.picksheetGame.awayTeam} ({result.picksheetGame.awaySpread > 0 ? '+' : ''}{result.picksheetGame.awaySpread})</p>
                          <p><span className="font-medium">Home:</span> {result.picksheetGame.homeTeam} ({result.picksheetGame.homeSpread > 0 ? '+' : ''}{result.picksheetGame.homeSpread})</p>
                          <p><span className="font-medium">League:</span> {result.picksheetGame.league}</p>
                          {result.picksheetGame.overUnder && (
                            <p><span className="font-medium">O/U:</span> {result.picksheetGame.overUnder}</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-gray-600 mb-2">Matched Odds Data</h4>
                        {result.oddsGame ? (
                          <div className="bg-white rounded p-3 text-sm space-y-1">
                            <p><span className="font-medium">Away:</span> {result.oddsGame.awayTeam} ({result.oddsGame.awaySpread ? `${result.oddsGame.awaySpread > 0 ? '+' : ''}${result.oddsGame.awaySpread}` : 'N/A'})</p>
                            <p><span className="font-medium">Home:</span> {result.oddsGame.homeTeam} ({result.oddsGame.homeSpread ? `${result.oddsGame.homeSpread > 0 ? '+' : ''}${result.oddsGame.homeSpread}` : 'N/A'})</p>
                            <p><span className="font-medium">Time:</span> {formatDate(result.oddsGame.gameTime)}</p>
                            <p><span className="font-medium">Book:</span> {result.oddsGame.bookmaker || 'N/A'}</p>
                          </div>
                        ) : (
                          <div className="bg-white rounded p-3 text-sm text-gray-500">
                            No matching game found in odds data
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 p-2 bg-gray-100 rounded text-xs space-y-1">
                      <div className="flex gap-4">
                        <span>Away Match: <strong>{result.awayMatch.method}</strong> ({(result.awayMatch.confidence * 100).toFixed(0)}%)</span>
                        <span>Home Match: <strong>{result.homeMatch.method}</strong> ({(result.homeMatch.confidence * 100).toFixed(0)}%)</span>
                      </div>
                      {result.oddsGame && (
                        <div className="text-gray-600">
                          Spread Difference: {Math.abs((result.picksheetGame.homeSpread || 0) - (result.oddsGame.homeSpread || 0)).toFixed(1)} points
                        </div>
                      )}
                      {!result.matched && (
                        <div className="text-red-600">
                          ⚠️ No matching game found with both teams correct in {result.picksheetGame.league} odds data
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {matchResults.length > 0 && (
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h3 className="font-semibold text-blue-900 mb-2">Match Summary</h3>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-blue-700">Total Games:</span>
                        <p className="font-semibold">{matchResults.length}</p>
                      </div>
                      <div>
                        <span className="text-blue-700">Matched:</span>
                        <p className="font-semibold text-green-600">
                          {matchResults.filter(r => r.matched).length} ({(matchResults.filter(r => r.matched).length / matchResults.length * 100).toFixed(0)}%)
                        </p>
                      </div>
                      <div>
                        <span className="text-blue-700">Avg Confidence:</span>
                        <p className="font-semibold">
                          {(matchResults.reduce((sum, r) => sum + r.overallConfidence, 0) / matchResults.length * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}