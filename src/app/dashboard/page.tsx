'use client'

import { useState, useEffect } from 'react'
import { ComparisonEngine } from '@/services/comparison-engine'

interface PipelineResult {
  id: string
  timestamp: string
  status: 'success' | 'partial' | 'failed'
  stage: string
  comparison?: {
    kpis?: {
      totalGames: number
      matchedGames: number
      unmatchedGames: number
      matchRate: number
      avgSpreadDelta: number
      medianSpreadDelta: number
      p95SpreadDelta: number
      keyNumberCrossings: number
      favoriteFlips: number
    }
    comparisons?: Array<{
      gameId: string
      homeTeam: string
      awayTeam: string
      gameTime: string
      league?: 'NFL' | 'NCAAF'
      picksheetSpread: number
      marketSpread: number
      spreadDelta: number
      crossesKeyNumber: boolean
      keyNumbersCrossed: number[]
      favoriteFlipped: boolean
      confidence: number
    }>
    unmatched?: Array<{
      source: string
      gameInfo: string
      reason: string
    }>
  }
}

export default function Dashboard() {
  const [loading, setLoading] = useState(false)
  const [picksheetText, setPicksheetText] = useState('')
  const [currentPipeline, setCurrentPipeline] = useState<PipelineResult | null>(null)
  const [sortColumn, setSortColumn] = useState<'league' | 'date' | 'team' | 'poolSpread' | 'marketSpread' | 'delta' | 'relDelta' | 'flags'>('delta')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [showOnlyIssues, setShowOnlyIssues] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)

  // Load data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('pipelineData')
    const savedPicksheet = localStorage.getItem('picksheetText')
    
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        setCurrentPipeline(parsed)
        setDataLoaded(true)
      } catch (e) {
        console.error('Failed to load saved data:', e)
      }
    }
    
    if (savedPicksheet) {
      setPicksheetText(savedPicksheet)
    }
  }, [])

  // Run pipeline
  const runPipeline = async () => {
    if (!picksheetText.trim()) {
      alert('Please enter picksheet text')
      return
    }

    setLoading(true)
    
    try {
      const response = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          picksheetText,
          useOddsAPI: true,
          useLLM: true,
          includeLogs: false
        })
      })
      
      const data = await response.json()
      if (data.pipeline) {
        setCurrentPipeline(data.pipeline)
        setDataLoaded(true)
        
        // Save to localStorage
        localStorage.setItem('pipelineData', JSON.stringify(data.pipeline))
        localStorage.setItem('picksheetText', picksheetText)
      }
    } catch (error) {
      console.error('Pipeline error:', error)
    } finally {
      setLoading(false)
    }
  }

  // Clear saved data
  const clearData = () => {
    localStorage.removeItem('pipelineData')
    localStorage.removeItem('picksheetText')
    setCurrentPipeline(null)
    setPicksheetText('')
    setDataLoaded(false)
  }

  // Handle column header clicks for sorting
  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  // Filter and sort comparisons
  const getFilteredComparisons = () => {
    if (!currentPipeline?.comparison?.comparisons) return []
    
    let filtered = [...currentPipeline.comparison.comparisons]
    
    // Filter by issues
    if (showOnlyIssues) {
      filtered = filtered.filter(c => 
        Math.abs(c.spreadDelta) > 3 || 
        c.crossesKeyNumber || 
        c.favoriteFlipped
      )
    }
    
    // Sort
    filtered.sort((a, b) => {
      let compareValue = 0
      
      switch (sortColumn) {
        case 'league':
          compareValue = (a.league || '').localeCompare(b.league || '')
          break
        case 'date':
          compareValue = new Date(a.gameTime || 0).getTime() - new Date(b.gameTime || 0).getTime()
          break
        case 'team':
          compareValue = a.homeTeam.localeCompare(b.homeTeam)
          break
        case 'poolSpread':
          compareValue = a.picksheetSpread - b.picksheetSpread
          break
        case 'marketSpread':
          compareValue = a.marketSpread - b.marketSpread
          break
        case 'delta':
          compareValue = Math.abs(a.spreadDelta) - Math.abs(b.spreadDelta)
          break
        case 'relDelta':
          const aRelDelta = a.picksheetSpread !== 0 ? (a.spreadDelta / Math.abs(a.picksheetSpread)) * 100 : 0
          const bRelDelta = b.picksheetSpread !== 0 ? (b.spreadDelta / Math.abs(b.picksheetSpread)) * 100 : 0
          compareValue = Math.abs(aRelDelta) - Math.abs(bRelDelta)
          break
        case 'flags':
          const aFlags = (a.crossesKeyNumber ? 2 : 0) + (a.favoriteFlipped ? 1 : 0)
          const bFlags = (b.crossesKeyNumber ? 2 : 0) + (b.favoriteFlipped ? 1 : 0)
          compareValue = aFlags - bFlags
          break
      }
      
      return sortDirection === 'asc' ? compareValue : -compareValue
    })
    
    return filtered
  }

  const getRiskColor = (delta: number) => {
    const absDelta = Math.abs(delta)
    if (absDelta <= 1) return 'text-green-500'
    if (absDelta <= 3) return 'text-orange-700'
    if (absDelta <= 5) return 'text-orange-800'
    return 'text-red-600'
  }

  return (
    <div className="min-h-screen bg-black text-gray-100">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-mono font-bold text-orange-700">
                SPREAD_ANALYSIS_SYSTEM
              </h1>
              <p className="text-xs font-mono text-gray-500 mt-1">
                PICKSHEET_MARKET_COMPARISON_ENGINE_V1.0
              </p>
            </div>
            <div className="flex items-center gap-4">
              {dataLoaded && (
                <span className="text-xs font-mono text-green-500">
                  ● DATA_LOADED
                </span>
              )}
              <div className="text-xs font-mono text-gray-500">
                {currentPipeline && `TIMESTAMP: ${new Date(currentPipeline.timestamp).toISOString()}`}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Control Panel */}
        <div className="bg-zinc-900 rounded border border-zinc-800 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono text-orange-700">CONTROL_PANEL</h2>
            <div className="flex gap-2">
              <button
                onClick={clearData}
                className="px-3 py-1 text-xs font-mono bg-zinc-900 text-orange-700 border border-orange-800 rounded hover:bg-orange-950 transition-colors"
              >
                CLEAR_DATA
              </button>
              {dataLoaded && (
                <button
                  onClick={() => window.location.reload()}
                  className="px-3 py-1 text-xs font-mono bg-zinc-900 text-gray-400 border border-gray-600 rounded hover:bg-zinc-800 transition-colors"
                >
                  REFRESH_SYSTEM
                </button>
              )}
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-xs font-mono text-gray-400 mb-2">
              INPUT: PICKSHEET_DATA
            </label>
            <textarea
              value={picksheetText}
              onChange={(e) => setPicksheetText(e.target.value)}
              className="w-full h-32 p-3 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none placeholder-zinc-600"
              placeholder="[TEAM_AWAY] @ [TEAM_HOME] [SPREAD]&#10;Example: Dallas @ Philadelphia -3&#10;..."
              disabled={dataLoaded}
            />
          </div>
          
          <button
            onClick={runPipeline}
            disabled={loading || dataLoaded}
            className="px-6 py-2 bg-orange-700 text-black font-mono text-sm font-bold rounded hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <span className="flex items-center">
                <span className="animate-pulse mr-2">●</span>
                PROCESSING...
              </span>
            ) : dataLoaded ? 'DATA_LOCKED' : 'EXECUTE_ANALYSIS'}
          </button>
        </div>

        {/* KPI Metrics */}
        {currentPipeline?.comparison?.kpis && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <div className="text-xs font-mono text-gray-500 mb-1">METRIC: MATCH_RATE</div>
              <div className="text-2xl font-mono font-bold text-orange-700">
                {(currentPipeline.comparison.kpis.matchRate * 100).toFixed(1)}%
              </div>
              <div className="text-xs font-mono text-gray-600 mt-1">
                MATCHED: {currentPipeline.comparison.kpis.matchedGames}/{currentPipeline.comparison.kpis.totalGames}
              </div>
            </div>

            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <div className="text-xs font-mono text-gray-500 mb-1">METRIC: AVG_DELTA</div>
              <div className={`text-2xl font-mono font-bold ${getRiskColor(currentPipeline.comparison.kpis.avgSpreadDelta)}`}>
                {currentPipeline.comparison.kpis.avgSpreadDelta.toFixed(2)}
              </div>
              <div className="text-xs font-mono text-gray-600 mt-1">
                MEDIAN: {currentPipeline.comparison.kpis.medianSpreadDelta.toFixed(2)}
              </div>
            </div>

            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <div className="text-xs font-mono text-gray-500 mb-1">METRIC: KEY_VIOLATIONS</div>
              <div className="text-2xl font-mono font-bold text-orange-700">
                {currentPipeline.comparison.kpis.keyNumberCrossings}
              </div>
              <div className="text-xs font-mono text-gray-600 mt-1">
                THRESHOLDS: [3,7,10,14]
              </div>
            </div>

            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <div className="text-xs font-mono text-gray-500 mb-1">METRIC: FAV_FLIPS</div>
              <div className="text-2xl font-mono font-bold text-purple-400">
                {currentPipeline.comparison.kpis.favoriteFlips}
              </div>
              <div className="text-xs font-mono text-gray-600 mt-1">
                INVERSIONS_DETECTED
              </div>
            </div>
          </div>
        )}

        {/* Filter Controls */}
        {currentPipeline?.comparison?.comparisons && (
          <div className="bg-zinc-900 rounded border border-zinc-800 p-4 mb-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-mono">
                <input
                  type="checkbox"
                  checked={showOnlyIssues}
                  onChange={(e) => setShowOnlyIssues(e.target.checked)}
                  className="rounded bg-zinc-950 border-zinc-700 text-orange-700 focus:ring-orange-700"
                />
                <span className="text-gray-500">FILTER: ISSUES_ONLY</span>
              </label>
              
              <div className="ml-auto text-xs font-mono text-gray-500">
                SHOWING: {getFilteredComparisons().length} / {currentPipeline?.comparison?.comparisons?.length || 0}
              </div>
            </div>
          </div>
        )}

        {/* Data Grid */}
        {currentPipeline?.comparison?.comparisons && (
          <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-950 border-b border-zinc-800">
                  <tr>
                    <th 
                      onClick={() => handleSort('league')}
                      className="px-4 py-3 text-center text-xs font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
                    >
                      <div className="flex items-center justify-center gap-1">
                        LEAGUE
                        {sortColumn === 'league' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('date')}
                      className="px-4 py-3 text-center text-xs font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
                    >
                      <div className="flex items-center justify-center gap-1">
                        DATE
                        {sortColumn === 'date' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('team')}
                      className="px-4 py-3 text-left text-xs font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        MATCH
                        {sortColumn === 'team' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('poolSpread')}
                      className="px-4 py-3 text-center text-xs font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
                    >
                      <div className="flex items-center justify-center gap-1">
                        POOL
                        {sortColumn === 'poolSpread' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('marketSpread')}
                      className="px-4 py-3 text-center text-xs font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
                    >
                      <div className="flex items-center justify-center gap-1">
                        MARKET
                        {sortColumn === 'marketSpread' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('delta')}
                      className="px-4 py-3 text-center text-xs font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
                    >
                      <div className="flex items-center justify-center gap-1">
                        DELTA
                        {sortColumn === 'delta' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('relDelta')}
                      className="px-4 py-3 text-center text-xs font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
                    >
                      <div className="flex items-center justify-center gap-1">
                        REL_DELTA
                        {sortColumn === 'relDelta' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('flags')}
                      className="px-4 py-3 text-center text-xs font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
                    >
                      <div className="flex items-center justify-center gap-1">
                        FLAGS
                        {sortColumn === 'flags' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {getFilteredComparisons().map((comp, idx) => {
                    const gameDate = comp.gameTime ? new Date(comp.gameTime) : null
                    const dateStr = gameDate ? 
                      `${(gameDate.getMonth() + 1).toString().padStart(2, '0')}/${gameDate.getDate().toString().padStart(2, '0')}` : 
                      'N/A'
                    const timeStr = gameDate ? 
                      `${gameDate.getHours().toString().padStart(2, '0')}:${gameDate.getMinutes().toString().padStart(2, '0')}` : 
                      ''
                    
                    // Calculate relative delta (spread delta / pool spread)
                    const relDelta = comp.picksheetSpread !== 0 ? 
                      (comp.spreadDelta / Math.abs(comp.picksheetSpread)) * 100 : 0
                    
                    return (
                      <tr key={idx} className="hover:bg-zinc-800 transition-colors">
                        <td className="px-4 py-3 text-center">
                          <span className={`font-mono text-xs ${comp.league === 'NFL' ? 'text-blue-400' : 'text-green-400'}`}>
                            {comp.league || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="text-xs font-mono text-gray-400">
                            <div>{dateStr}</div>
                            <div className="text-gray-600">{timeStr}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-mono text-gray-300">{comp.awayTeam}</div>
                          <div className="text-xs font-mono text-gray-500">@ {comp.homeTeam}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-mono text-sm text-gray-200">
                            {-comp.picksheetSpread > 0 ? '+' : ''}{-comp.picksheetSpread}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-mono text-sm text-gray-200">
                            {-comp.marketSpread > 0 ? '+' : ''}{-comp.marketSpread}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-mono text-sm font-bold ${getRiskColor(comp.spreadDelta)}`}>
                            {comp.spreadDelta > 0 ? '+' : ''}{comp.spreadDelta.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-mono text-sm ${Math.abs(relDelta) > 50 ? 'text-red-500 font-bold' : Math.abs(relDelta) > 25 ? 'text-orange-600' : 'text-gray-400'}`}>
                            {relDelta > 0 ? '+' : ''}{relDelta.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex justify-center gap-1">
                            {comp.crossesKeyNumber && (
                              <span className="px-2 py-1 text-xs font-mono bg-orange-950 text-orange-700 rounded">
                                K{comp.keyNumbersCrossed.join(',')}
                              </span>
                            )}
                            {comp.favoriteFlipped && (
                              <span className="px-2 py-1 text-xs font-mono bg-purple-950 text-purple-400 rounded">
                                FLP
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Unmatched Data */}
        {currentPipeline?.comparison?.unmatched && currentPipeline.comparison.unmatched.length > 0 && (
          <div className="mt-6 bg-zinc-900 rounded border border-zinc-800 p-4">
            <h3 className="text-sm font-mono text-orange-700 mb-3">UNMATCHED_ENTRIES</h3>
            <div className="space-y-2">
              {currentPipeline.comparison.unmatched.map((game, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs font-mono">
                  <span className={`px-2 py-1 rounded ${
                    game.source === 'picksheet' 
                      ? 'bg-blue-950 text-blue-400'
                      : 'bg-green-950 text-green-400'
                  }`}>
                    {game.source.toUpperCase()}
                  </span>
                  <div className="text-gray-400">
                    {game.gameInfo}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* System Status */}
        <div className="mt-6 text-center">
          <p className="text-xs font-mono text-gray-600">
            SYSTEM_STATUS: {dataLoaded ? 'DATA_PERSISTENT' : 'READY'} | 
            CACHE_MODE: {dataLoaded ? 'LOCKED' : 'DISABLED'} | 
            REFRESH_TO_RESET
          </p>
        </div>
      </div>
    </div>
  )
}