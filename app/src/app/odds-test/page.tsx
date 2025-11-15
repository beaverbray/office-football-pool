'use client'

import { useState } from 'react'

interface Game {
  gameId: string
  homeTeam: string
  awayTeam: string
  homeSpread: number | null
  awaySpread: number | null
  gameTime: string
  bookmaker: string | null
}

interface OddsData {
  nfl?: {
    sport: string
    games: Game[]
    count: number
  }
  ncaaf?: {
    sport: string
    games: Game[]
    count: number
  }
  timestamp?: string
}

export default function OddsTestPage() {
  const [loading, setLoading] = useState(false)
  const [oddsData, setOddsData] = useState<OddsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedSport, setSelectedSport] = useState<'all' | 'nfl' | 'ncaaf'>('all')

  const fetchOdds = async (refresh = false) => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        sport: selectedSport,
        refresh: refresh.toString()
      })
      
      const response = await fetch(`/api/odds?${params}`)
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to fetch odds')
      }
      
      setOddsData(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setOddsData(null)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })
  }

  const renderGames = (games: Game[], sport: string) => {
    if (!games || games.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          No {sport} games available
        </div>
      )
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Game Time
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Away Team
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Spread
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Home Team
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Spread
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Book
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {games.map((game) => (
              <tr key={game.gameId} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900">
                  {formatDate(game.gameTime)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                  {game.awayTeam}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-center font-mono">
                  {game.awaySpread !== null ? (
                    <span className={game.awaySpread > 0 ? 'text-green-600' : 'text-red-600'}>
                      {game.awaySpread > 0 ? '+' : ''}{game.awaySpread}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                  {game.homeTeam}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-center font-mono">
                  {game.homeSpread !== null ? (
                    <span className={game.homeSpread > 0 ? 'text-green-600' : 'text-red-600'}>
                      {game.homeSpread > 0 ? '+' : ''}{game.homeSpread}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                  {game.bookmaker || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🏈 Live Odds from The Odds API
          </h1>
          <p className="text-gray-600">
            Fetching real-time spread data for NFL and NCAAF games
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex gap-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="all"
                  checked={selectedSport === 'all'}
                  onChange={(e) => setSelectedSport(e.target.value as 'all')}
                  className="mr-2"
                />
                <span>All Sports</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="nfl"
                  checked={selectedSport === 'nfl'}
                  onChange={(e) => setSelectedSport(e.target.value as 'nfl')}
                  className="mr-2"
                />
                <span>NFL Only</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="ncaaf"
                  checked={selectedSport === 'ncaaf'}
                  onChange={(e) => setSelectedSport(e.target.value as 'ncaaf')}
                  className="mr-2"
                />
                <span>NCAAF Only</span>
              </label>
            </div>

            <div className="flex gap-2 sm:ml-auto">
              <button
                onClick={() => fetchOdds(false)}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? '⏳ Loading...' : '📊 Fetch Odds'}
              </button>
              <button
                onClick={() => fetchOdds(true)}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              >
                🔄 Refresh Cache
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg">
              ❌ {error}
            </div>
          )}
        </div>

        {/* Results */}
        {oddsData && (
          <div className="space-y-6">
            {/* NFL Games */}
            {oddsData.nfl && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">
                    NFL Games ({oddsData.nfl.count})
                  </h2>
                </div>
                <div className="p-6">
                  {renderGames(oddsData.nfl.games, 'NFL')}
                </div>
              </div>
            )}

            {/* NCAAF Games */}
            {oddsData.ncaaf && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">
                    NCAAF Games ({oddsData.ncaaf.count})
                  </h2>
                </div>
                <div className="p-6">
                  {renderGames(oddsData.ncaaf.games, 'NCAAF')}
                </div>
              </div>
            )}

            {/* Timestamp */}
            {oddsData.timestamp && (
              <div className="text-center text-sm text-gray-500">
                Last updated: {formatDate(oddsData.timestamp)}
              </div>
            )}
          </div>
        )}

        {/* Info Box */}
        {!oddsData && !loading && (
          <div className="bg-blue-50 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-2">📋 How to use:</h3>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Make sure THE_ODDS_API_KEY is set in your .env file</li>
              <li>Get a free API key from <a href="https://the-odds-api.com" className="underline" target="_blank" rel="noopener noreferrer">the-odds-api.com</a></li>
              <li>Select which sport to fetch (All, NFL, or NCAAF)</li>
              <li>Click "Fetch Odds" to get live spread data</li>
              <li>Data is cached for 5 minutes to conserve API requests</li>
              <li>Use "Refresh Cache" to force fetch new data</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}