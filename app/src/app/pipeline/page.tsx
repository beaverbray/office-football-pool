'use client'

import { useState, useEffect } from 'react'
import { ComparisonEngine } from '@/services/comparison-engine'

interface PipelineResult {
  id: string
  timestamp: string
  status: 'success' | 'partial' | 'failed'
  stage: string
  config: {
    useOddsAPI?: boolean
    useLLM?: boolean
    includeLogs?: boolean
    matchingThreshold?: number
  }
  parsing?: {
    success: boolean
    gamesFound: number
    duration?: number
    error?: string
  }
  oddsRetrieval?: {
    success: boolean
    nflGames: number
    ncaafGames: number
    duration?: number
    error?: string
  }
  matching?: {
    success: boolean
    matchRate: number
    matches: number
    totalGames: number
    duration?: number
    error?: string
  }
  comparison?: {
    success: boolean
    kpis?: any
    comparisons?: any[]
    unmatched?: any[]
    duration?: number
    error?: string
  }
  logs?: string[]
  totalDuration?: number
}

export default function PipelineDashboard() {
  const [picksheetText, setPicksheetText] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentPipeline, setCurrentPipeline] = useState<PipelineResult | null>(null)
  const [pipelineHistory, setPipelineHistory] = useState<PipelineResult[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const samplePicksheet = `Week 15 NFL Games
Dallas @ Philadelphia -3
Kansas City @ LA Chargers +7.5
Tampa Bay @ Atlanta -2.5
New England @ Buffalo -9.5

College Games
#11 Alabama @ Michigan State +14
Ohio State @ Tennessee -7
Texas Tech @ Penn State -10`

  // Fetch pipeline history
  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/pipeline/status')
      const data = await response.json()
      if (data.success) {
        setPipelineHistory(data.pipelines || [])
      }
    } catch (error) {
      console.error('Failed to fetch pipeline history:', error)
    }
  }

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
          includeLogs: showLogs,
          matchingThreshold: 0.6
        })
      })
      
      const data = await response.json()
      if (data.success || data.pipeline) {
        setCurrentPipeline(data.pipeline)
        fetchHistory()
      } else {
        alert(`Pipeline failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Pipeline error:', error)
      alert('Failed to run pipeline')
    } finally {
      setLoading(false)
    }
  }

  // Clear history
  const clearHistory = async () => {
    if (!confirm('Clear all pipeline history?')) return
    
    try {
      await fetch('/api/pipeline/status', { method: 'DELETE' })
      setPipelineHistory([])
      setCurrentPipeline(null)
    } catch (error) {
      console.error('Failed to clear history:', error)
    }
  }

  // Auto-refresh
  useEffect(() => {
    fetchHistory()
    
    if (autoRefresh) {
      const interval = setInterval(fetchHistory, 5000)
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600'
      case 'partial': return 'text-yellow-600'
      case 'failed': return 'text-red-600'
      default: return 'text-gray-600'
    }
  }

  // Get stage icon
  const getStageIcon = (stage: string, success?: boolean) => {
    if (success === false) return '❌'
    if (success === true) return '✅'
    
    switch (stage) {
      case 'parsing': return '📄'
      case 'odds_retrieval': return '📊'
      case 'matching': return '🔗'
      case 'comparison': return '📈'
      case 'completed': return '🎯'
      default: return '⏳'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🚀 Pipeline Orchestrator Dashboard
          </h1>
          <p className="text-gray-600">
            End-to-end picksheet analysis pipeline with real-time odds comparison
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Run New Pipeline</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Picksheet Text
            </label>
            <textarea
              value={picksheetText}
              onChange={(e) => setPicksheetText(e.target.value)}
              className="w-full h-48 p-3 border rounded-lg font-mono text-sm"
              placeholder="Paste picksheet text here..."
            />
          </div>

          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showLogs}
                onChange={(e) => setShowLogs(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Include detailed logs</span>
            </label>
            
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm">Auto-refresh (5s)</span>
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={runPipeline}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? '⏳ Running Pipeline...' : '🚀 Run Pipeline'}
            </button>
            
            <button
              onClick={() => setPicksheetText(samplePicksheet)}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Load Sample
            </button>
            
            <button
              onClick={clearHistory}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 ml-auto"
            >
              Clear History
            </button>
          </div>
        </div>

        {/* Current Pipeline Result */}
        {currentPipeline && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Current Pipeline Result</h2>
                <span className={`px-3 py-1 text-sm font-medium rounded ${
                  currentPipeline.status === 'success' ? 'bg-green-100 text-green-800' :
                  currentPipeline.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {currentPipeline.status.toUpperCase()}
                </span>
              </div>
            </div>
            
            <div className="p-6">
              {/* Pipeline Stages */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                {/* Parsing Stage */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Parsing</span>
                    <span>{getStageIcon('parsing', currentPipeline.parsing?.success)}</span>
                  </div>
                  {currentPipeline.parsing && (
                    <>
                      <div className="text-sm text-gray-600">
                        Games: {currentPipeline.parsing.gamesFound}
                      </div>
                      <div className="text-xs text-gray-500">
                        {currentPipeline.parsing.duration}ms
                      </div>
                      {currentPipeline.parsing.error && (
                        <div className="text-xs text-red-600 mt-1">
                          {currentPipeline.parsing.error}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Odds Retrieval Stage */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Odds API</span>
                    <span>{getStageIcon('odds_retrieval', currentPipeline.oddsRetrieval?.success)}</span>
                  </div>
                  {currentPipeline.oddsRetrieval && (
                    <>
                      <div className="text-sm text-gray-600">
                        NFL: {currentPipeline.oddsRetrieval.nflGames}
                      </div>
                      <div className="text-sm text-gray-600">
                        NCAAF: {currentPipeline.oddsRetrieval.ncaafGames}
                      </div>
                      <div className="text-xs text-gray-500">
                        {currentPipeline.oddsRetrieval.duration}ms
                      </div>
                    </>
                  )}
                </div>

                {/* Matching Stage */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Matching</span>
                    <span>{getStageIcon('matching', currentPipeline.matching?.success)}</span>
                  </div>
                  {currentPipeline.matching && (
                    <>
                      <div className="text-sm text-gray-600">
                        Rate: {(currentPipeline.matching.matchRate * 100).toFixed(1)}%
                      </div>
                      <div className="text-sm text-gray-600">
                        {currentPipeline.matching.matches}/{currentPipeline.matching.totalGames}
                      </div>
                      <div className="text-xs text-gray-500">
                        {currentPipeline.matching.duration}ms
                      </div>
                    </>
                  )}
                </div>

                {/* Comparison Stage */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">KPIs</span>
                    <span>{getStageIcon('comparison', currentPipeline.comparison?.success)}</span>
                  </div>
                  {currentPipeline.comparison?.kpis && (
                    <>
                      <div className="text-sm text-gray-600">
                        Avg Δ: {currentPipeline.comparison.kpis.avgSpreadDelta}
                      </div>
                      <div className="text-sm text-gray-600">
                        Key #: {currentPipeline.comparison.kpis.keyNumberCrossings}
                      </div>
                      <div className="text-xs text-gray-500">
                        {currentPipeline.comparison.duration}ms
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* KPI Details */}
              {currentPipeline.comparison?.kpis && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <h3 className="font-medium mb-2">Key Performance Indicators</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Match Rate:</span>
                      <span className="ml-2 font-medium">
                        {(currentPipeline.comparison.kpis.matchRate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Avg Delta:</span>
                      <span className="ml-2 font-medium">
                        {currentPipeline.comparison.kpis.avgSpreadDelta}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Key Crossings:</span>
                      <span className="ml-2 font-medium">
                        {currentPipeline.comparison.kpis.keyNumberCrossings}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Median Delta:</span>
                      <span className="ml-2 font-medium">
                        {currentPipeline.comparison.kpis.medianSpreadDelta}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Favorite Flips:</span>
                      <span className="ml-2 font-medium">
                        {currentPipeline.comparison.kpis.favoriteFlips}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">P95 Delta:</span>
                      <span className="ml-2 font-medium">
                        {currentPipeline.comparison.kpis.p95SpreadDelta}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Total Duration */}
              <div className="text-sm text-gray-600">
                Total Duration: {currentPipeline.totalDuration}ms
              </div>

              {/* Logs */}
              {currentPipeline.logs && currentPipeline.logs.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-medium mb-2">Pipeline Logs</h3>
                  <div className="bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono max-h-48 overflow-y-auto">
                    {currentPipeline.logs.map((log, idx) => (
                      <div key={idx}>{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pipeline History */}
        {pipelineHistory.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h2 className="text-xl font-semibold">Pipeline History</h2>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Games</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Match Rate</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Avg Delta</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {pipelineHistory.map((pipeline) => (
                      <tr key={pipeline.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm">
                          {new Date(pipeline.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-2">
                          <span className={`text-sm font-medium ${getStatusColor(pipeline.status)}`}>
                            {pipeline.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {pipeline.parsing?.gamesFound || 0}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {pipeline.matching 
                            ? `${(pipeline.matching.matchRate * 100).toFixed(1)}%`
                            : '-'}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {pipeline.comparison?.kpis?.avgSpreadDelta || '-'}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {pipeline.totalDuration}ms
                        </td>
                        <td className="px-4 py-2 text-sm">
                          <button
                            onClick={() => setCurrentPipeline(pipeline)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}