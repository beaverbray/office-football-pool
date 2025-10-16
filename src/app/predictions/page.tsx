'use client'

import { useState } from 'react'
import NavBar from '@/components/NavBar'

interface Prediction {
  gameTime: string
  awayTeam: string
  homeTeam: string
  predictedWinner: 'home' | 'away'
  winProbability: number
  confidence: 'H' | 'M' | 'L'
  spread: number
  overUnder?: number
  source?: string
}

interface ScrapingResponse {
  success: boolean
  predictions: Prediction[]
  scrapedAt: string
  gameDate?: string
  week?: number
  season?: number
  error?: string
}

export default function PredictionsPage() {
  const [loading, setLoading] = useState(false)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [scrapedAt, setScrapedAt] = useState<string>('')
  const [gameDate, setGameDate] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  const [error, setError] = useState<string>('')
  const [sortColumn, setSortColumn] = useState<'time' | 'probability' | 'spread' | 'confidence'>('probability')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'H' | 'M' | 'L'>('all')
  const [selectedSource, setSelectedSource] = useState<'warren-nolan' | 'nfelo'>('warren-nolan')
  const [nflWeek, setNflWeek] = useState<number>(5)
  const [nflSeason, setNflSeason] = useState<number>(new Date().getFullYear())
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string>('')

  const fetchPredictions = async () => {
    setLoading(true)
    setError('')
    setSaveMessage('')

    try {
      let url: string
      if (selectedSource === 'warren-nolan') {
        url = `/api/warren-nolan/scrape?date=${selectedDate}`
      } else {
        url = `/api/nfelo/scrape?season=${nflSeason}&week=${nflWeek}`
      }

      const response = await fetch(url)
      const data: ScrapingResponse = await response.json()

      if (data.success) {
        setPredictions(data.predictions.map(p => ({ ...p, source: selectedSource })))
        setScrapedAt(data.scrapedAt)
        setGameDate(data.gameDate || `Week ${data.week}, ${data.season}`)
      } else {
        setError(data.error || 'Failed to fetch predictions')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setLoading(false)
    }
  }

  const saveToDatabase = async () => {
    setSaving(true)
    setSaveMessage('')
    setError('')

    try {
      let url: string
      let body: any

      if (selectedSource === 'warren-nolan') {
        url = '/api/warren-nolan/scrape'
        body = {
          date: selectedDate,
          saveToDatabase: true
        }
      } else {
        url = '/api/nfelo/scrape'
        body = {
          season: nflSeason,
          week: nflWeek,
          saveToDatabase: true
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (data.success) {
        setSaveMessage(`Successfully saved ${data.predictions.length} predictions to database!`)
      } else {
        setError(data.error || 'Failed to save predictions')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  const getFilteredAndSortedPredictions = () => {
    let filtered = [...predictions]

    // Apply confidence filter
    if (confidenceFilter !== 'all') {
      filtered = filtered.filter(p => p.confidence === confidenceFilter)
    }

    // Sort
    filtered.sort((a, b) => {
      let compareValue = 0

      switch (sortColumn) {
        case 'time':
          compareValue = a.gameTime.localeCompare(b.gameTime)
          break
        case 'probability':
          compareValue = a.winProbability - b.winProbability
          break
        case 'spread':
          compareValue = a.spread - b.spread
          break
        case 'confidence':
          const confidenceOrder = { H: 3, M: 2, L: 1 }
          compareValue = confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
          break
      }

      return sortDirection === 'asc' ? compareValue : -compareValue
    })

    return filtered
  }

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'H': return 'text-green-500'
      case 'M': return 'text-orange-500'
      case 'L': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const getProbabilityColor = (prob: number) => {
    if (prob >= 80) return 'text-green-500'
    if (prob >= 60) return 'text-orange-500'
    return 'text-red-500'
  }

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <NavBar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-mono text-orange-700 font-bold mb-2">
            PREDICTIONS_DASHBOARD
          </h1>
          <p className="text-sm font-mono text-gray-500">
            College and professional football game predictions with win probabilities
          </p>
        </div>

        {/* Controls */}
        <div className="bg-zinc-900 rounded border border-zinc-800 p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Source Selector */}
            <div>
              <label className="block text-xs font-mono text-gray-500 mb-2">
                DATA_SOURCE
              </label>
              <select
                value={selectedSource}
                onChange={(e) => setSelectedSource(e.target.value as 'warren-nolan' | 'nfelo')}
                className="px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
              >
                <option value="warren-nolan">WARREN_NOLAN (CFB)</option>
                <option value="nfelo">NFELO (NFL)</option>
              </select>
            </div>

            {/* Conditional inputs based on source */}
            {selectedSource === 'warren-nolan' ? (
              <div>
                <label className="block text-xs font-mono text-gray-500 mb-2">
                  GAME_DATE
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-mono text-gray-500 mb-2">
                    NFL_SEASON
                  </label>
                  <input
                    type="number"
                    value={nflSeason}
                    onChange={(e) => setNflSeason(parseInt(e.target.value))}
                    className="px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm font-mono text-gray-300 focus:border-orange-700 focus:outline-none w-24"
                    min="2020"
                    max="2030"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-gray-500 mb-2">
                    NFL_WEEK
                  </label>
                  <input
                    type="number"
                    value={nflWeek}
                    onChange={(e) => setNflWeek(parseInt(e.target.value))}
                    className="px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm font-mono text-gray-300 focus:border-orange-700 focus:outline-none w-20"
                    min="1"
                    max="18"
                  />
                </div>
              </>
            )}

            {/* Confidence Filter */}
            <div>
              <label className="block text-xs font-mono text-gray-500 mb-2">
                CONFIDENCE
              </label>
              <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value as 'all' | 'H' | 'M' | 'L')}
                className="px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-sm font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
              >
                <option value="all">ALL</option>
                <option value="H">HIGH</option>
                <option value="M">MEDIUM</option>
                <option value="L">LOW</option>
              </select>
            </div>

            {/* Fetch Button */}
            <button
              onClick={() => fetchPredictions()}
              disabled={loading}
              className="px-6 py-2 bg-orange-700 text-black font-mono text-sm font-bold rounded hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'LOADING...' : 'FETCH_PREDICTIONS'}
            </button>

            {/* Save to Database Button */}
            {predictions.length > 0 && (
              <button
                onClick={() => saveToDatabase()}
                disabled={saving}
                className="px-6 py-2 bg-green-700 text-black font-mono text-sm font-bold rounded hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'SAVING...' : 'SAVE_TO_DB'}
              </button>
            )}

            {/* Results Count */}
            {predictions.length > 0 && (
              <div className="ml-auto text-sm font-mono text-gray-500">
                SHOWING: {getFilteredAndSortedPredictions().length} / {predictions.length}
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-4 px-4 py-3 bg-red-950 border border-red-800 rounded text-sm font-mono text-red-400">
              ERROR: {error}
            </div>
          )}

          {/* Save Success Message */}
          {saveMessage && (
            <div className="mt-4 px-4 py-3 bg-green-950 border border-green-800 rounded text-sm font-mono text-green-400">
              ✓ {saveMessage}
            </div>
          )}

          {/* Metadata */}
          {scrapedAt && (
            <div className="mt-4 text-xs font-mono text-gray-600">
              SCRAPED: {new Date(scrapedAt).toLocaleString()} | DATE: {gameDate}
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {predictions.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <div className="text-xs font-mono text-gray-500 mb-1">TOTAL_GAMES</div>
              <div className="text-2xl font-mono font-bold text-orange-700">
                {predictions.length}
              </div>
            </div>
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <div className="text-xs font-mono text-gray-500 mb-1">HIGH_CONFIDENCE</div>
              <div className="text-2xl font-mono font-bold text-green-500">
                {predictions.filter(p => p.confidence === 'H').length}
              </div>
            </div>
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <div className="text-xs font-mono text-gray-500 mb-1">AVG_WIN_PROB</div>
              <div className="text-2xl font-mono font-bold text-orange-700">
                {(predictions.reduce((sum, p) => sum + p.winProbability, 0) / predictions.length).toFixed(1)}%
              </div>
            </div>
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <div className="text-xs font-mono text-gray-500 mb-1">AVG_SPREAD</div>
              <div className="text-2xl font-mono font-bold text-orange-700">
                {(predictions.reduce((sum, p) => sum + p.spread, 0) / predictions.length).toFixed(1)}
              </div>
            </div>
          </div>
        )}

        {/* Predictions Table */}
        {predictions.length > 0 && (
          <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-950 border-b border-zinc-800">
                  <tr>
                    <th
                      onClick={() => handleSort('time')}
                      className="px-4 py-3 text-left text-sm font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        TIME
                        {sortColumn === 'time' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-mono text-gray-500">
                      MATCHUP
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-mono text-gray-500">
                      PREDICTED_WINNER
                    </th>
                    <th
                      onClick={() => handleSort('probability')}
                      className="px-4 py-3 text-center text-sm font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-2">
                        WIN_PROB
                        {sortColumn === 'probability' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('spread')}
                      className="px-4 py-3 text-center text-sm font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-2">
                        SPREAD
                        {sortColumn === 'spread' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('confidence')}
                      className="px-4 py-3 text-center text-sm font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-2">
                        CONF
                        {sortColumn === 'confidence' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {getFilteredAndSortedPredictions().map((pred, idx) => (
                    <tr
                      key={idx}
                      className={`${idx % 2 === 0 ? 'bg-zinc-800/50' : 'bg-zinc-900/50'} hover:bg-zinc-700 transition-colors`}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-gray-400">
                        {pred.gameTime}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-mono text-gray-300">{pred.awayTeam}</div>
                        <div className="text-sm font-mono text-gray-500">@ {pred.homeTeam}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-mono text-sm font-bold ${
                          pred.predictedWinner === 'home' ? 'text-blue-400' : 'text-green-400'
                        }`}>
                          {pred.predictedWinner === 'home' ? pred.homeTeam : pred.awayTeam}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-mono text-sm font-bold ${getProbabilityColor(pred.winProbability)}`}>
                          {pred.winProbability.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono text-sm text-gray-200">
                          {pred.spread.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded font-mono text-xs font-bold ${getConfidenceColor(pred.confidence)}`}>
                          {pred.confidence}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && predictions.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-mono text-gray-500 mb-2">NO_PREDICTIONS_LOADED</h3>
            <p className="text-sm font-mono text-gray-600">
              Select a date and click FETCH_PREDICTIONS to load data
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-zinc-900 border-t border-zinc-800 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <p className="text-center text-xs font-mono text-gray-500">
            BEAVERBRAY | © 2025 | DATA: WARREN_NOLAN (CFB) & NFELO (NFL)
          </p>
        </div>
      </footer>
    </div>
  )
}
