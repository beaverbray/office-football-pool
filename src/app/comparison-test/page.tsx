'use client'

import { useState } from 'react'
import { ComparisonEngine } from '@/services/comparison-engine'

interface ComparisonResult {
  comparisons: Array<{
    gameId: string
    homeTeam: string
    awayTeam: string
    gameTime: string
    picksheetSpread: number
    marketSpread: number
    spreadDelta: number
    crossesKeyNumber: boolean
    keyNumbersCrossed: number[]
    favoriteFlipped: boolean
    confidence: number
  }>
  kpis: {
    totalGames: number
    matchedGames: number
    unmatchedGames: number
    matchRate: number
    avgSpreadDelta: number
    medianSpreadDelta: number
    p95SpreadDelta: number
    stdDevSpreadDelta: number
    keyNumberCrossings: number
    keyNumberCrossingRate: number
    favoriteFlips: number
    favoriteFlipRate: number
    largestDelta: {
      gameId: string
      teams: string
      delta: number
    } | null
    timestamp: string
  }
  unmatched: Array<{
    source: 'picksheet' | 'market'
    gameInfo: string
    reason: string
  }>
}

export default function ComparisonTestPage() {
  const [picksheetInput, setPicksheetInput] = useState('')
  const [marketInput, setMarketInput] = useState('')
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [useOddsAPI, setUseOddsAPI] = useState(false)

  const samplePicksheet = `Dallas Cowboys @ Philadelphia Eagles -3
Kansas City Chiefs @ LA Chargers +7.5
Tampa Bay Buccaneers @ Atlanta Falcons -2.5
#11 Alabama @ Michigan State +14
Ohio State @ Tennessee -7
New England Patriots @ Buffalo Bills -9.5`

  const sampleMarket = `Philadelphia Eagles @ Dallas Cowboys -3.5
LA Chargers @ Kansas City Chiefs +6.5
Atlanta Falcons @ Tampa Bay Buccaneers -3
Michigan State @ Alabama +13.5
Tennessee @ Ohio State -6.5
Buffalo Bills @ New England Patriots -10`

  const parseGames = (input: string, isPicksheet: boolean) => {
    const lines = input.trim().split('\n').filter(line => line.trim())
    
    return lines.map(line => {
      // Parse format: "Away Team @ Home Team +/-Spread"
      const atIndex = line.lastIndexOf('@')
      if (atIndex === -1) return null
      
      const awayTeam = line.substring(0, atIndex).trim()
      const homeAndSpread = line.substring(atIndex + 1).trim()
      
      // Find where the spread starts (last occurrence of +/- followed by number)
      const spreadMatch = homeAndSpread.match(/([+-]?\d+\.?\d*)$/)
      if (!spreadMatch) return null
      
      const spread = parseFloat(spreadMatch[0])
      const homeTeam = homeAndSpread.substring(0, homeAndSpread.lastIndexOf(spreadMatch[0])).trim()
      
      if (isPicksheet) {
        return { awayTeam, homeTeam, spread }
      } else {
        return {
          gameId: `${awayTeam}-${homeTeam}`.toLowerCase().replace(/\s+/g, '-'),
          awayTeam,
          homeTeam,
          homeSpread: spread,
          gameTime: new Date().toISOString()
        }
      }
    }).filter(Boolean)
  }

  const runComparison = async () => {
    setLoading(true)
    
    try {
      const picksheetGames = parseGames(picksheetInput, true)
      const marketGames = useOddsAPI ? null : parseGames(marketInput, false)
      
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          picksheetGames,
          marketGames,
          useOddsAPI
        })
      })
      
      const data = await response.json()
      if (data.success) {
        setResult({
          comparisons: data.comparisons,
          kpis: data.kpis,
          unmatched: data.unmatched
        })
      }
    } catch (error) {
      console.error('Error running comparison:', error)
    } finally {
      setLoading(false)
    }
  }

  const getRiskColor = (delta: number) => {
    const risk = ComparisonEngine.getRiskLevel(delta)
    return ComparisonEngine.getRiskColor(risk)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            📊 Spread Comparison & KPI Calculator
          </h1>
          <p className="text-gray-600">
            Compare picksheet spreads against market odds and calculate key performance indicators
          </p>
        </div>

        {/* Input Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Picksheet Games</h2>
            <textarea
              value={picksheetInput}
              onChange={(e) => setPicksheetInput(e.target.value)}
              className="w-full h-48 p-3 border rounded-lg font-mono text-sm"
              placeholder="Format: Away Team @ Home Team +/-Spread"
            />
            <button
              onClick={() => setPicksheetInput(samplePicksheet)}
              className="mt-2 px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Load Sample
            </button>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">
              Market Odds
              <label className="ml-4 text-sm font-normal">
                <input
                  type="checkbox"
                  checked={useOddsAPI}
                  onChange={(e) => setUseOddsAPI(e.target.checked)}
                  className="mr-2"
                />
                Use Live Odds API
              </label>
            </h2>
            <textarea
              value={marketInput}
              onChange={(e) => setMarketInput(e.target.value)}
              className="w-full h-48 p-3 border rounded-lg font-mono text-sm"
              placeholder="Format: Away Team @ Home Team +/-Spread"
              disabled={useOddsAPI}
            />
            <button
              onClick={() => setMarketInput(sampleMarket)}
              className="mt-2 px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
              disabled={useOddsAPI}
            >
              Load Sample
            </button>
          </div>
        </div>

        <div className="flex justify-center mb-6">
          <button
            onClick={runComparison}
            disabled={loading || !picksheetInput || (!marketInput && !useOddsAPI)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Comparing...' : 'Compare Spreads'}
          </button>
        </div>

        {/* KPIs Section */}
        {result?.kpis && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📈 Key Performance Indicators</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-sm text-gray-600">Match Rate</div>
                <div className="text-2xl font-bold">
                  {(result.kpis.matchRate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">
                  {result.kpis.matchedGames}/{result.kpis.totalGames} games
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded">
                <div className="text-sm text-gray-600">Avg Spread Delta</div>
                <div className={`text-2xl font-bold ${getRiskColor(result.kpis.avgSpreadDelta)}`}>
                  {result.kpis.avgSpreadDelta}
                </div>
                <div className="text-xs text-gray-500">
                  σ = {result.kpis.stdDevSpreadDelta}
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded">
                <div className="text-sm text-gray-600">Median Delta</div>
                <div className={`text-2xl font-bold ${getRiskColor(result.kpis.medianSpreadDelta)}`}>
                  {result.kpis.medianSpreadDelta}
                </div>
                <div className="text-xs text-gray-500">
                  P95: {result.kpis.p95SpreadDelta}
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded">
                <div className="text-sm text-gray-600">Key # Crossings</div>
                <div className="text-2xl font-bold text-orange-600">
                  {result.kpis.keyNumberCrossings}
                </div>
                <div className="text-xs text-gray-500">
                  {(result.kpis.keyNumberCrossingRate * 100).toFixed(1)}% rate
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded">
                <div className="text-sm text-gray-600">Favorite Flips</div>
                <div className="text-2xl font-bold text-purple-600">
                  {result.kpis.favoriteFlips}
                </div>
                <div className="text-xs text-gray-500">
                  {(result.kpis.favoriteFlipRate * 100).toFixed(1)}% rate
                </div>
              </div>

              {result.kpis.largestDelta && (
                <div className="bg-gray-50 p-3 rounded md:col-span-3">
                  <div className="text-sm text-gray-600">Largest Delta</div>
                  <div className={`text-lg font-bold ${getRiskColor(result.kpis.largestDelta.delta)}`}>
                    {result.kpis.largestDelta.delta} points
                  </div>
                  <div className="text-xs text-gray-500">
                    {result.kpis.largestDelta.teams}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Comparisons Table */}
        {result?.comparisons && result.comparisons.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b">
              <h2 className="text-xl font-semibold">🏈 Game Comparisons</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Game</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Picksheet</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Market</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Delta</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Flags</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {result.comparisons.map((comp, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm">
                        <div>{comp.awayTeam}</div>
                        <div className="text-gray-500">@ {comp.homeTeam}</div>
                      </td>
                      <td className="px-4 py-2 text-sm font-mono">
                        {comp.picksheetSpread > 0 ? '+' : ''}{comp.picksheetSpread}
                      </td>
                      <td className="px-4 py-2 text-sm font-mono">
                        {comp.marketSpread > 0 ? '+' : ''}{comp.marketSpread}
                      </td>
                      <td className={`px-4 py-2 text-sm font-bold ${getRiskColor(comp.spreadDelta)}`}>
                        {comp.spreadDelta > 0 ? '+' : ''}{comp.spreadDelta.toFixed(1)}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <div className="flex gap-1">
                          {comp.crossesKeyNumber && (
                            <span className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded">
                              Key #{comp.keyNumbersCrossed.join(', ')}
                            </span>
                          )}
                          {comp.favoriteFlipped && (
                            <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded">
                              Fav Flip
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <div className={`font-mono ${
                          comp.confidence >= 0.9 ? 'text-green-600' :
                          comp.confidence >= 0.7 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {(comp.confidence * 100).toFixed(0)}%
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Unmatched Games */}
        {result?.unmatched && result.unmatched.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-xl font-semibold">⚠️ Unmatched Games</h2>
            </div>
            <div className="p-6">
              <div className="space-y-2">
                {result.unmatched.map((game, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <span className={`px-2 py-1 text-xs rounded ${
                      game.source === 'picksheet' 
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {game.source}
                    </span>
                    <div>
                      <div className="font-medium">{game.gameInfo}</div>
                      <div className="text-gray-500">{game.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}