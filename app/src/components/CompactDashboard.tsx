'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { EntityResolver } from '@/services/entity-resolution'
import { OpeningLineEnricher, type EnrichedGameComparison } from '@/utils/opening-line-enricher'

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
      league?: 'NFL' | 'NCAA'
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
      gameTime?: string
    }>
  }
}

interface ELOPrediction {
  homeTeam: string
  awayTeam: string
  predictedWinner: 'home' | 'away'
  winProbability: number
  spread?: number
}

export default function CompactDashboard() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [currentPipeline, setCurrentPipeline] = useState<PipelineResult | null>(null)
  const [sortColumn, setSortColumn] = useState<'league' | 'date' | 'team' | 'delta' | 'opening'>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [showOnlyIssues, setShowOnlyIssues] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [eloPredictions, setEloPredictions] = useState<ELOPrediction[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentWeek, setCurrentWeek] = useState<number | null>(null)

  // Filter states
  const [filters, setFilters] = useState({
    league: 'all' as 'all' | 'NFL' | 'NCAA',
    dateFilter: 'all' as 'all' | 'today' | 'tomorrow' | 'week',
    eloFilter: 'all' as 'all' | 'with' | 'without',
    deltaMin: '',
    deltaMax: ''
  })

  // Memoize EntityResolver instance
  const entityResolver = useMemo(() => new EntityResolver(), [])

  // Pre-normalize all team names
  const normalizedTeamCache = useMemo(() => {
    const cache = new Map<string, string>()

    const normalizeTeam = (teamName: string): string | null => {
      if (cache.has(teamName)) return cache.get(teamName)!

      try {
        const match =
          entityResolver.findNFLTeamExact(teamName) ||
          entityResolver.findNFLTeamFuzzy(teamName) ||
          entityResolver.findNCAAFTeamExact(teamName) ||
          entityResolver.findNCAAFTeamFuzzy(teamName)

        const normalized = match?.matchedName || null
        cache.set(teamName, normalized!)
        return normalized
      } catch {
        cache.set(teamName, null!)
        return null
      }
    }

    currentPipeline?.comparison?.comparisons?.forEach(comp => {
      normalizeTeam(comp.homeTeam)
      normalizeTeam(comp.awayTeam)
    })

    eloPredictions.forEach(pred => {
      normalizeTeam(pred.homeTeam)
      normalizeTeam(pred.awayTeam)
    })

    return cache
  }, [eloPredictions, currentPipeline?.comparison?.comparisons, entityResolver])

  // Memoize ELO prediction lookups
  const eloPredictionMap = useMemo(() => {
    const map = new Map<string, ELOPrediction>()
    if (!currentPipeline?.comparison?.comparisons) return map

    const predictionIndex = new Map<string, ELOPrediction>()
    for (const pred of eloPredictions) {
      const normalizedHome = normalizedTeamCache.get(pred.homeTeam)
      const normalizedAway = normalizedTeamCache.get(pred.awayTeam)
      if (normalizedHome && normalizedAway) {
        predictionIndex.set(`${normalizedHome}|${normalizedAway}`, pred)
      }
    }

    for (const comp of currentPipeline.comparison.comparisons) {
      const normalizedHome = normalizedTeamCache.get(comp.homeTeam)
      const normalizedAway = normalizedTeamCache.get(comp.awayTeam)

      if (normalizedHome && normalizedAway) {
        const pred = predictionIndex.get(`${normalizedHome}|${normalizedAway}`)
        if (pred) {
          map.set(`${comp.homeTeam}|${comp.awayTeam}`, pred)
        }
      }
    }

    return map
  }, [eloPredictions, currentPipeline?.comparison?.comparisons, normalizedTeamCache])

  // Enrich comparisons with opening line data
  const enrichedComparisons = useMemo(() => {
    if (!currentPipeline?.comparison?.comparisons) return []
    return OpeningLineEnricher.enrichGames(currentPipeline.comparison.comparisons)
  }, [currentPipeline?.comparison?.comparisons])

  // Set mounted state
  useEffect(() => {
    setMounted(true)
  }, [])

  // Load data from API on mount (with localStorage fallback)
  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch current week and pipeline data in parallel
        const [weekResponse, pipelineResponse] = await Promise.all([
          fetch('/api/week'),
          fetch('/api/pipeline/current')
        ])

        // Handle week data
        if (weekResponse.ok) {
          const weekData = await weekResponse.json()
          if (weekData.success && weekData.nfl?.week) {
            setCurrentWeek(weekData.nfl.week)
          }
        }

        // Handle pipeline data
        if (pipelineResponse.ok) {
          const data = await pipelineResponse.json()
          if (data.pipeline) {
            // Merge the timestamp from the API response into the pipeline object
            const pipelineWithTimestamp = {
              ...data.pipeline,
              timestamp: data.updatedAt || data.pipeline.timestamp
            }
            setCurrentPipeline(pipelineWithTimestamp)
            setDataLoaded(true)
            console.log('Loaded pipeline from API')
            return
          }
        }
      } catch (error) {
        console.warn('Failed to load from API, trying localStorage...', error)
      }

      // Fallback to localStorage for pipeline data
      const savedData = localStorage.getItem('pipelineData')
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData)
          setCurrentPipeline(parsed)
          setDataLoaded(true)
          console.log('Loaded pipeline from localStorage')
        } catch (e) {
          console.error('Failed to load saved data:', e)
        }
      }
    }

    loadData()
  }, [])

  // Fetch ELO predictions from database
  useEffect(() => {
    const fetchEloPredictions = async () => {
      try {
        const response = await fetch('/api/predictions/latest')
        if (response.ok) {
          const data = await response.json()
          setEloPredictions(data.predictions || [])
        }
      } catch (error) {
        console.error('Failed to fetch ELO predictions:', error)
      }
    }

    if (dataLoaded) {
      fetchEloPredictions()
    }
  }, [dataLoaded])

  // Handle column header clicks for sorting
  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  // Share functionality
  const handleShare = async () => {
    if (!currentPipeline) return

    setSharing(true)
    try {
      const response = await fetch('/api/cache/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline: currentPipeline })
      })

      const result = await response.json()
      if (result.success) {
        const fullUrl = `${window.location.origin}/share/${result.shareId}`
        setShareUrl(fullUrl)

        await navigator.clipboard.writeText(fullUrl)
        alert('Share link copied to clipboard!')
      }
    } catch (error) {
      console.error('Error sharing:', error)
      alert('Failed to create share link')
    } finally {
      setSharing(false)
    }
  }

  // Refresh market data
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/pipeline/refresh', {
        method: 'POST'
      })

      const data = await response.json()

      if (!response.ok) {
        // Show specific error message if available
        if (data.message) {
          alert(`Refresh failed: ${data.message}`)
        } else if (data.error === 'No matching games found') {
          alert('The picksheet contains games that have already finished.\n\nPlease upload a new picksheet with upcoming games in the Control Panel.')
          router.push('/control-panel')
          return
        } else {
          alert('Failed to refresh market data. Please try again or upload a new picksheet.')
        }
        return
      }

      if (data.pipeline) {
        // Merge the timestamp from the API response into the pipeline object
        const pipelineWithTimestamp = {
          ...data.pipeline,
          timestamp: data.updatedAt || data.pipeline.timestamp
        }
        setCurrentPipeline(pipelineWithTimestamp)

        // Record new opening lines if needed
        if (data.pipeline.comparison?.comparisons) {
          OpeningLineEnricher.recordOpeningLinesFromComparisons(data.pipeline.comparison.comparisons)
        }

        alert('Market data refreshed successfully!')
      }
    } catch (error) {
      console.error('Error refreshing:', error)
      alert('Failed to refresh market data. Make sure a picksheet has been uploaded first.')
    } finally {
      setRefreshing(false)
    }
  }

  // Filter and sort comparisons
  const getFilteredComparisons = () => {
    let filtered = [...enrichedComparisons]

    // Apply filters
    filtered = filtered.filter(c => {
      // Search term filter (check both home and away teams)
      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase()
        const homeMatch = c.homeTeam.toLowerCase().includes(search)
        const awayMatch = c.awayTeam.toLowerCase().includes(search)
        if (!homeMatch && !awayMatch) return false
      }

      // League filter
      if (filters.league !== 'all' && c.league !== filters.league) return false

      // Date filter
      if (filters.dateFilter !== 'all' && c.gameTime) {
        const gameDate = new Date(c.gameTime)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const weekFromNow = new Date(today)
        weekFromNow.setDate(weekFromNow.getDate() + 7)

        if (filters.dateFilter === 'today') {
          const gameDateOnly = new Date(gameDate)
          gameDateOnly.setHours(0, 0, 0, 0)
          if (gameDateOnly.getTime() !== today.getTime()) return false
        } else if (filters.dateFilter === 'tomorrow') {
          const gameDateOnly = new Date(gameDate)
          gameDateOnly.setHours(0, 0, 0, 0)
          if (gameDateOnly.getTime() !== tomorrow.getTime()) return false
        } else if (filters.dateFilter === 'week') {
          if (gameDate < today || gameDate > weekFromNow) return false
        }
      }

      // ELO filter
      if (filters.eloFilter !== 'all') {
        const eloPred = eloPredictionMap.get(`${c.homeTeam}|${c.awayTeam}`)
        const hasElo = eloPred && eloPred.spread != null

        if (filters.eloFilter === 'with' && !hasElo) return false
        if (filters.eloFilter === 'without' && hasElo) return false
      }

      // Delta range filter
      const delta = Math.abs(c.spreadDelta ?? 0)
      if (filters.deltaMin !== '' && delta < parseFloat(filters.deltaMin)) return false
      if (filters.deltaMax !== '' && delta > parseFloat(filters.deltaMax)) return false

      // Issues filter
      if (showOnlyIssues) {
        return Math.abs(c.spreadDelta ?? 0) > 3 || c.crossesKeyNumber || c.favoriteFlipped
      }

      return true
    })

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
        case 'delta':
          compareValue = Math.abs(a.spreadDelta ?? 0) - Math.abs(b.spreadDelta ?? 0)
          break
        case 'opening':
          const aMovement = Math.abs(a.lineMovement?.movement ?? 0)
          const bMovement = Math.abs(b.lineMovement?.movement ?? 0)
          compareValue = aMovement - bMovement
          break
      }

      return sortDirection === 'asc' ? compareValue : -compareValue
    })

    return filtered
  }

  // Group games by date, hour, and league
  const getGroupedComparisons = () => {
    const comparisons = getFilteredComparisons()
    const grouped: { [key: string]: typeof comparisons } = {}

    comparisons.forEach(comp => {
      const gameDate = comp.gameTime ? new Date(comp.gameTime) : null
      const dateStr = gameDate ?
        gameDate.toLocaleDateString('en-US', {
          timeZone: 'America/Los_Angeles',
          month: '2-digit',
          day: '2-digit',
          year: 'numeric'
        }) : 'N/A'

      // Get hour for grouping (e.g., "9AM", "12PM")
      let hour = 'N/A'
      if (gameDate) {
        const timeString = gameDate.toLocaleTimeString('en-US', {
          timeZone: 'America/Los_Angeles',
          hour: 'numeric',
          hour12: true
        })
        const parts = timeString.split(' ')
        hour = parts.join('') // e.g., "9AM", "12PM"
      }

      const league = comp.league || 'N/A'
      const groupKey = `${dateStr}|${hour}|${league}`

      if (!grouped[groupKey]) {
        grouped[groupKey] = []
      }
      grouped[groupKey].push(comp)
    })

    return grouped
  }

  const getRiskColor = (delta: number | null) => {
    if (delta === null) return 'text-gray-500'
    const absDelta = Math.abs(delta)
    if (absDelta <= 1) return 'text-green-500'
    if (absDelta <= 3) return 'text-orange-700'
    if (absDelta <= 5) return 'text-orange-800'
    return 'text-red-600'
  }

  const getImportanceColor = (importance: string | undefined) => {
    switch (importance) {
      case 'minimal': return 'text-gray-500'        // <1%
      case 'low': return 'text-green-500'           // 1-2%
      case 'moderate': return 'text-orange-400'     // 2-4%
      case 'high': return 'text-orange-700'         // 4-8%
      case 'very-high': return 'text-red-600'       // >8%
      default: return 'text-gray-500'
    }
  }

  // Helper to find matching ELO prediction for a game
  const findEloPrediction = (homeTeam: string, awayTeam: string) => {
    return eloPredictionMap.get(`${homeTeam}|${awayTeam}`)
  }

  // Helper to determine if a team/spread has value
  const getTeamSpreadStyle = (
    isHomeTeam: boolean,
    poolSpread: number | null,
    marketSpread: number | null,
    homeTeam: string,
    awayTeam: string
  ) => {
    if (poolSpread === null || marketSpread === null) return ''

    let marketGivesValue = false
    let eloGivesValue = false

    if (isHomeTeam) {
      // Home team has value if market favors home MORE than pool does
      // Market spread < pool spread (more negative = home more favored)
      marketGivesValue = marketSpread < poolSpread

      const eloPred = findEloPrediction(homeTeam, awayTeam)
      if (eloPred && eloPred.spread != null) {
        const eloSpread = eloPred.predictedWinner === 'home' ? -eloPred.spread : eloPred.spread
        eloGivesValue = eloSpread < poolSpread
      }
    } else {
      // Away team has value if market favors away MORE than pool does
      // Market spread > pool spread (more positive or less negative = away more favored)
      marketGivesValue = marketSpread > poolSpread

      const eloPred = findEloPrediction(homeTeam, awayTeam)
      if (eloPred && eloPred.spread != null) {
        const eloSpread = eloPred.predictedWinner === 'home' ? -eloPred.spread : eloPred.spread
        eloGivesValue = eloSpread > poolSpread
      }
    }

    if (!marketGivesValue && !eloGivesValue) return ''

    if (marketGivesValue && eloGivesValue) {
      return 'bg-orange-900/50' // Both market and model agree - strong value
    } else if (marketGivesValue) {
      return 'bg-blue-900/50' // Market sees value
    } else if (eloGivesValue) {
      return 'bg-green-900/50' // Model sees value
    }

    return ''
  }

  // Show loading state during hydration
  if (!mounted) {
    return (
      <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm font-mono text-gray-500">Loading...</div>
        </div>
      </div>
    )
  }

  // If no data, redirect to control panel
  if (!dataLoaded) {
    return (
      <div className="min-h-screen bg-black text-gray-100 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-mono text-orange-700 mb-4">NO_DATA_LOADED</h2>
          <p className="text-sm font-mono text-gray-500 mb-6">Please upload picksheet data first</p>
          <button
            onClick={() => router.push('/control-panel')}
            className="px-6 py-3 bg-orange-700 text-black font-mono text-sm font-bold rounded hover:bg-orange-600 transition-colors"
          >
            GO_TO_CONTROL_PANEL
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <NavBar
        onRefresh={handleRefresh}
        refreshing={refreshing}
        showRefreshButton={!!currentPipeline?.comparison?.comparisons}
        onShare={handleShare}
        sharing={sharing}
        showShareButton={!!currentPipeline?.comparison?.comparisons}
      />
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-1 sm:py-6">
        {/* KPI Metrics */}
        {currentPipeline?.comparison?.kpis && (
          <div className="grid grid-cols-4 gap-1.5 sm:gap-4 mb-2 sm:mb-6">
            <div className="bg-zinc-900 rounded border border-zinc-800 p-1.5 sm:p-4">
              <div className="flex flex-col items-center sm:flex-row sm:items-baseline sm:gap-2">
                <span className="text-[8px] sm:text-[10px] font-mono text-gray-500 leading-tight">REM:</span>
                <span className="text-[13px] sm:text-xs font-mono font-bold text-orange-700">
                  {(() => {
                    const now = new Date()
                    const futureGames = currentPipeline.comparison.comparisons?.filter(comp => {
                      const gameDate = comp.gameTime ? new Date(comp.gameTime) : null
                      return gameDate && gameDate > now
                    }).length || 0
                    return futureGames
                  })()}
                </span>
              </div>
              <div className="text-[8px] sm:text-xs font-mono text-gray-600 mt-0.5 sm:mt-1 leading-tight hidden sm:block">
                {(() => {
                  const now = new Date()
                  const futureGames = currentPipeline.comparison.comparisons?.filter(comp => {
                    const gameDate = comp.gameTime ? new Date(comp.gameTime) : null
                    return gameDate && gameDate > now
                  }).length || 0
                  const totalGames = currentPipeline.comparison.kpis.totalGames
                  const percentage = totalGames > 0 ? ((futureGames / totalGames) * 100).toFixed(1) : '0.0'
                  return `${percentage}% OF POOL`
                })()}
              </div>
            </div>

            <div className="bg-zinc-900 rounded border border-zinc-800 p-1.5 sm:p-4">
              <div className="flex flex-col items-center sm:flex-row sm:items-baseline sm:gap-2">
                <span className="text-[8px] sm:text-[10px] font-mono text-gray-500 leading-tight">AVG Δ:</span>
                <span className={`text-[13px] sm:text-xs font-mono font-bold ${getRiskColor(currentPipeline.comparison.kpis.avgSpreadDelta)}`}>
                  {currentPipeline.comparison.kpis.avgSpreadDelta != null ? currentPipeline.comparison.kpis.avgSpreadDelta.toFixed(2) : '-'}
                </span>
              </div>
              <div className="text-[8px] sm:text-xs font-mono text-gray-600 mt-0.5 sm:mt-1 leading-tight hidden sm:block">
                MEDIAN: {currentPipeline.comparison.kpis.medianSpreadDelta != null ? currentPipeline.comparison.kpis.medianSpreadDelta.toFixed(2) : '-'}
              </div>
            </div>

            <div className="bg-zinc-900 rounded border border-zinc-800 p-1.5 sm:p-4">
              <div className="flex flex-col items-center sm:flex-row sm:items-baseline sm:gap-2">
                <span className="text-[8px] sm:text-[10px] font-mono text-gray-500 leading-tight">KEY #:</span>
                <span className="text-[13px] sm:text-xs font-mono font-bold text-orange-700">
                  {currentPipeline.comparison.kpis.keyNumberCrossings}
                </span>
              </div>
              <div className="text-[8px] sm:text-xs font-mono text-gray-600 mt-0.5 sm:mt-1 leading-tight hidden sm:block">
                THRESHOLDS: [3,7,10,14]
              </div>
            </div>

            <div className="bg-zinc-900 rounded border border-zinc-800 p-1.5 sm:p-4">
              <div className="flex flex-col items-center sm:flex-row sm:items-baseline sm:gap-2">
                <span className="text-[8px] sm:text-[10px] font-mono text-gray-500 leading-tight">FLIPS:</span>
                <span className="text-[13px] sm:text-xs font-mono font-bold text-purple-400">
                  {currentPipeline.comparison.kpis.favoriteFlips}
                </span>
              </div>
              <div className="text-[8px] sm:text-xs font-mono text-gray-600 mt-0.5 sm:mt-1 leading-tight hidden sm:block">
                INVERSIONS_DETECTED
              </div>
            </div>
          </div>
        )}

        {/* Filter Controls */}
        {currentPipeline?.comparison?.comparisons && (
          <div className="bg-zinc-900 rounded border border-zinc-800 p-2 sm:p-4 mb-2 sm:mb-4">
            {/* Search Bar */}
            <div className="mb-2 sm:mb-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="Search teams"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-xs sm:text-sm font-mono text-gray-300 placeholder-gray-600 focus:border-orange-700 focus:outline-none pr-20"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] sm:text-xs font-mono text-gray-500 hover:text-orange-600 transition-colors"
                  >
                    CLEAR
                  </button>
                )}
              </div>
            </div>

            {/* Mobile Filter Toggle */}
            <div className="sm:hidden flex items-center justify-between gap-2 mb-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex-1 flex items-center justify-between px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-[9px] font-mono text-gray-300 hover:bg-zinc-800 transition-colors"
              >
                <span>FILTERS {showFilters ? '▼' : '►'}</span>
                <span className="text-gray-500">
                  {showOnlyIssues || filters.league !== 'all' || filters.dateFilter !== 'all' ||
                   filters.eloFilter !== 'all' || filters.deltaMin || filters.deltaMax || searchTerm ? 'ACTIVE' : 'OFF'}
                </span>
              </button>
              <button
                onClick={() => setShowGuide(!showGuide)}
                className="px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-[9px] font-mono text-orange-600 hover:bg-zinc-800 transition-colors"
              >
                ℹ
              </button>
              <div className="text-[9px] font-mono text-gray-500 whitespace-nowrap">
                {getFilteredComparisons().length}/{enrichedComparisons.length}
              </div>
            </div>

            {/* Mobile Column Guide */}
            {showGuide && (
              <div className="sm:hidden mb-2 bg-zinc-950 border border-zinc-700 rounded p-3 z-50 shadow-lg">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-[10px] font-mono text-orange-600 font-bold">COLUMN_GUIDE</h3>
                  <button
                    onClick={() => setShowGuide(false)}
                    className="text-gray-400 hover:text-orange-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-1.5 text-[9px] font-mono">
                  <div><span className="text-orange-700">OPEN:</span> <span className="text-gray-400">Opening line spread</span></div>
                  <div><span className="text-orange-700">MKT:</span> <span className="text-gray-400">Current market spread</span></div>
                  <div><span className="text-orange-700">POOL:</span> <span className="text-gray-400">Office pool spread</span></div>
                  <div><span className="text-orange-700">MOD:</span> <span className="text-gray-400">Model predicted spread</span></div>
                  <div><span className="text-orange-700">Δp%:</span> <span className="text-gray-400">Market delta probability = |p_pool - p_market| + key_number_weights, calibrated</span></div>
                  <div className="pt-1 border-t border-zinc-700 mt-1">
                    <div className="text-orange-700 mb-1">COLOR CODING:</div>
                    <div><span className="text-gray-500">Gray Δp%:</span> <span className="text-gray-400">Minimal (&lt;1%)</span></div>
                    <div><span className="text-green-500">Green Δp%:</span> <span className="text-gray-400">Low (1-2%)</span></div>
                    <div><span className="text-orange-400">Orange Δp%:</span> <span className="text-gray-400">Moderate (2-4%)</span></div>
                    <div><span className="text-orange-700">Dark Orange Δp%:</span> <span className="text-gray-400">High (4-8%)</span></div>
                    <div><span className="text-red-600">Red Δp%:</span> <span className="text-gray-400">Very High (&gt;8%)</span></div>
                    <div><span className="bg-orange-900/50 px-1">Orange BG:</span> <span className="text-gray-400">Both agree</span></div>
                    <div><span className="bg-blue-900/50 px-1">Blue BG:</span> <span className="text-gray-400">Market value</span></div>
                    <div><span className="bg-green-900/50 px-1">Green BG:</span> <span className="text-gray-400">Model value</span></div>
                  </div>
                </div>
              </div>
            )}

            {/* Advanced Filters */}
            <div className={`${showFilters ? 'grid grid-cols-2 gap-3' : 'hidden'} sm:flex sm:flex-wrap sm:items-end sm:gap-2 mb-1 sm:mb-2`}>
              {/* Clear Filters Button */}
              <button
                onClick={() => {
                  setFilters({
                    league: 'all',
                    dateFilter: 'all',
                    eloFilter: 'all',
                    deltaMin: '',
                    deltaMax: ''
                  })
                  setShowOnlyIssues(false)
                  setSearchTerm('')
                }}
                className="col-span-2 sm:col-span-1 px-3 py-1 text-xs font-mono bg-zinc-950 text-orange-600 border border-zinc-700 rounded hover:bg-zinc-800 hover:text-orange-500 transition-colors"
              >
                CLEAR
              </button>

              {/* Divider */}
              <div className="hidden sm:block h-6 w-px bg-zinc-700"></div>

              {/* League Filter */}
              <div>
                <label className="block text-xs font-mono text-gray-500 mb-1">LEAGUE</label>
                <select
                  value={filters.league}
                  onChange={(e) => setFilters({...filters, league: e.target.value as 'all' | 'NFL' | 'NCAA'})}
                  className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                >
                  <option value="all">ALL</option>
                  <option value="NFL">NFL</option>
                  <option value="NCAA">NCAA</option>
                </select>
              </div>

              {/* Date Filter */}
              <div>
                <label className="block text-xs font-mono text-gray-500 mb-1">DATE</label>
                <select
                  value={filters.dateFilter}
                  onChange={(e) => setFilters({...filters, dateFilter: e.target.value as 'all' | 'today' | 'tomorrow' | 'week'})}
                  className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                >
                  <option value="all">ALL</option>
                  <option value="today">TODAY</option>
                  <option value="tomorrow">TOMORROW</option>
                  <option value="week">THIS WEEK</option>
                </select>
              </div>

              {/* Model Filter */}
              <div>
                <label className="block text-xs font-mono text-gray-500 mb-1">MODEL</label>
                <select
                  value={filters.eloFilter}
                  onChange={(e) => setFilters({...filters, eloFilter: e.target.value as 'all' | 'with' | 'without'})}
                  className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                >
                  <option value="all">ALL</option>
                  <option value="with">WITH MODEL</option>
                  <option value="without">NO MODEL</option>
                </select>
              </div>

              {/* Delta Range */}
              <div className="w-full sm:w-36 sm:ml-4">
                <label className="block text-xs font-mono text-gray-500 mb-1">DELTA_ABS</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    placeholder="min"
                    value={filters.deltaMin}
                    onChange={(e) => setFilters({...filters, deltaMin: e.target.value})}
                    className="w-1/2 px-1 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="max"
                    value={filters.deltaMax}
                    onChange={(e) => setFilters({...filters, deltaMax: e.target.value})}
                    className="w-1/2 px-1 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                  />
                </div>
              </div>

              {/* Spacer */}
              <div className="hidden sm:flex-grow"></div>

              {/* Flagged Checkbox */}
              <div className="flex items-center gap-2 sm:ml-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs font-mono text-gray-500">FLAGGED_GAMES</span>
                  <input
                    type="checkbox"
                    checked={showOnlyIssues}
                    onChange={(e) => setShowOnlyIssues(e.target.checked)}
                    className="w-4 h-4 bg-zinc-950 border border-gray-300 rounded focus:ring-orange-700 focus:ring-2 checked:accent-orange-700"
                  />
                </label>
              </div>
            </div>

            {/* Count Display */}
            {currentPipeline?.comparison?.comparisons && (
              <div className="ml-auto text-xs font-mono text-gray-500 hidden sm:block">
                SHOWING: {getFilteredComparisons().length} / {enrichedComparisons.length}
              </div>
            )}

          </div>
        )}

        {/* Week Display and Guide Button Row */}
        {currentPipeline?.comparison?.comparisons && (
          <div className="hidden sm:flex justify-between items-center mb-2 relative">
            <div className="text-xs font-mono text-gray-500">
              {currentWeek ? `WEEK ${currentWeek}` : 'LOADING...'}
            </div>

            <button
              onClick={() => setShowGuide(!showGuide)}
              className="px-2 py-1 text-xs font-mono text-orange-600 hover:text-orange-500 transition-colors"
            >
              {showGuide ? '✕ CLOSE' : 'ℹ GUIDE'}
            </button>

            {/* Column Guide */}
            {showGuide && (
              <div className="absolute top-full right-0 mt-2 bg-zinc-950 border border-zinc-700 rounded p-4 z-50 shadow-lg w-full max-w-md">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-mono text-orange-600 font-bold">COLUMN_GUIDE</h3>
                  <button
                    onClick={() => setShowGuide(false)}
                    className="text-gray-400 hover:text-orange-600 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-2 text-[10px] sm:text-xs font-mono">
                  <div><span className="text-orange-700">OPEN:</span> <span className="text-gray-400">Opening line spread (first spread recorded)</span></div>
                  <div><span className="text-orange-700">MKT:</span> <span className="text-gray-400">Current market spread</span></div>
                  <div><span className="text-orange-700">POOL:</span> <span className="text-gray-400">Spread from office pool picksheet</span></div>
                  <div><span className="text-orange-700">ELO:</span> <span className="text-gray-400">Predicted spread from ELO rating system</span></div>
                  <div><span className="text-orange-700">Δp%:</span> <span className="text-gray-400">Market delta probability - calibrated measure of spread importance (shown in home team row)</span></div>
                  <div className="pt-2 border-t border-zinc-700 mt-2">
                    <div className="text-orange-700 font-bold mb-2">COLOR CODING:</div>
                    <div><span className="text-gray-500 font-bold">Gray Δp%:</span> <span className="text-gray-400">Minimal importance (&lt;1%)</span></div>
                    <div><span className="text-green-500 font-bold">Green Δp%:</span> <span className="text-gray-400">Low importance (1-2%)</span></div>
                    <div><span className="text-orange-400 font-bold">Orange Δp%:</span> <span className="text-gray-400">Moderate importance (2-4%)</span></div>
                    <div><span className="text-orange-700 font-bold">Dark Orange Δp%:</span> <span className="text-gray-400">High importance (4-8%)</span></div>
                    <div><span className="text-red-600 font-bold">Red Δp%:</span> <span className="text-gray-400">Very high importance (&gt;8%)</span></div>
                    <div><span className="bg-orange-900/50 px-1.5 py-0.5 rounded">Orange background:</span> <span className="text-gray-400">Market & ELO both see value</span></div>
                    <div><span className="bg-blue-900/50 px-1.5 py-0.5 rounded">Blue background:</span> <span className="text-gray-400">Market sees value in this team</span></div>
                    <div><span className="bg-green-900/50 px-1.5 py-0.5 rounded">Green background:</span> <span className="text-gray-400">ELO sees value in this team</span></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Share URL Display */}
        {shareUrl && (
          <div className="hidden sm:flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-green-500">LINK_COPIED!</span>
            <button
              onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="px-3 py-1 text-xs font-mono bg-zinc-950 text-green-500 border border-green-600 rounded hover:bg-green-950 transition-colors"
            >
              COPY_AGAIN
            </button>
          </div>
        )}

        {/* Clean Table */}
        {currentPipeline?.comparison?.comparisons && (
          <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto max-h-[70vh] sm:max-h-[calc(100vh-280px)] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-10">
                  <tr>
                    <th
                      onClick={() => handleSort('date')}
                      className="px-1 sm:px-2 py-1.5 sm:py-2 text-left text-[10px] sm:text-xs font-mono text-gray-500 bg-zinc-950 cursor-pointer hover:text-orange-500 transition-colors"
                    >
                      MATCHUP {sortColumn === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-mono text-gray-500 bg-zinc-950">OPEN</th>
                    <th className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-mono text-gray-500 bg-zinc-950">MKT</th>
                    <th className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-mono text-gray-500 bg-zinc-950">POOL</th>
                    <th className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-mono text-gray-500 bg-zinc-950">MOD</th>
                    <th className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-mono text-gray-500 bg-zinc-950">Δp%</th>
                    <th className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-mono text-gray-500 bg-zinc-950 hidden sm:table-cell">🚩</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {Object.entries(getGroupedComparisons()).map(([groupKey, games]) => {
                    const [dateStr, hour, league] = groupKey.split('|')

                    return (
                      <React.Fragment key={groupKey}>
                        {/* Date, Time, and League Group Header */}
                        <tr className="bg-zinc-950 border-b-2 border-zinc-700">
                          <td colSpan={8} className="px-1 sm:px-2 py-1.5 sm:py-2">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <span className={`text-[8px] sm:text-[10px] font-mono px-1.5 py-0.5 sm:px-2 sm:py-1 rounded font-bold ${league === 'NFL' ? 'bg-blue-900/50 text-blue-300' : 'bg-green-900/50 text-green-300'}`}>
                                {league}
                              </span>
                              <span className="text-[9px] sm:text-xs font-mono text-gray-400 font-bold">
                                {dateStr}
                              </span>
                              <span className="text-[8px] sm:text-[10px] font-mono text-gray-500">
                                {hour !== 'N/A' ? `@ ${hour}` : ''}
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Games in this group */}
                        {games.map((comp, idx) => {
                          // Banded rows - alternating background colors for games
                          const isEvenGame = idx % 2 === 0
                          const gameBgClass = isEvenGame ? 'bg-zinc-900/10' : 'bg-zinc-800/40'
                          const gameBorderClass = idx === games.length - 1 ? 'border-b-4 border-zinc-500' : 'border-b-[3px] border-zinc-500'

                          const gameDate = comp.gameTime ? new Date(comp.gameTime) : null

                          const timeStr = gameDate ?
                            gameDate.toLocaleTimeString('en-US', {
                              timeZone: 'America/Los_Angeles',
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            }).toLowerCase() : ''

                          const eloPred = findEloPrediction(comp.homeTeam, comp.awayTeam)
                          const eloSpread = eloPred && eloPred.spread != null
                            ? (eloPred.predictedWinner === 'home' ? eloPred.spread : -eloPred.spread)
                            : null

                          // Calculate spreads from away team perspective
                          const awayPoolSpread = comp.picksheetSpread != null ? -comp.picksheetSpread : null
                          const awayMarketSpread = comp.marketSpread != null ? -comp.marketSpread : null

                          const homePoolSpread = comp.picksheetSpread
                          const homeMarketSpread = comp.marketSpread
                          const homeOpeningSpread = (comp.openingSpread !== undefined && comp.openingSpread !== null) ? -comp.openingSpread : undefined
                          const homeEloSpread = eloSpread !== null ? -eloSpread : null

                          // Get market delta probability and importance level
                          const marketDeltaProb = comp.marketDeltaProb ?? 0
                          const importanceLevel = comp.importanceLevel ?? 'minimal'

                          return (
                            <React.Fragment key={idx}>
                              {/* Away Team Row */}
                              <tr className={`${gameBgClass} hover:bg-zinc-700/50 transition-colors`}>
                                <td className="px-1 sm:px-2 py-2 sm:py-2.5">
                                  <div className="text-[10px] sm:text-xs font-mono text-gray-300">
                                    {comp.awayTeam}
                                  </div>
                                  <div className="text-[8px] font-mono text-gray-500 mt-0.5">
                                    {timeStr}
                                  </div>
                                </td>
                                <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 text-center">
                            <div className={`text-[11px] sm:text-sm font-mono font-bold ${(comp.openingSpread !== undefined && comp.openingSpread !== null) ? 'text-gray-500' : 'text-gray-600'}`}>
                              {(comp.openingSpread !== undefined && comp.openingSpread !== null)
                                ? `${comp.openingSpread > 0 ? '+' : ''}${comp.openingSpread.toFixed(1)}`
                                : '-'}
                            </div>
                          </td>
                          <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 text-center">
                            <div className="text-[11px] sm:text-sm font-mono font-bold text-gray-200">
                              {awayMarketSpread !== null ? `${awayMarketSpread > 0 ? '+' : ''}${awayMarketSpread.toFixed(1)}` : '-'}
                            </div>
                          </td>
                          <td className={`px-0.5 sm:px-1 py-2 sm:py-2.5 text-center ${getTeamSpreadStyle(false, comp.picksheetSpread, comp.marketSpread, comp.homeTeam, comp.awayTeam)}`}>
                            <div className="text-[11px] sm:text-sm font-mono font-bold text-gray-200">
                              {awayPoolSpread !== null ? `${awayPoolSpread > 0 ? '+' : ''}${awayPoolSpread.toFixed(1)}` : '-'}
                            </div>
                          </td>
                          <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 text-center">
                            <div className={`text-[11px] sm:text-sm font-mono font-bold ${eloSpread !== null ? 'text-purple-400' : 'text-gray-600'}`}>
                              {eloSpread !== null ? `${eloSpread > 0 ? '+' : ''}${eloSpread.toFixed(1)}` : '-'}
                            </div>
                          </td>
                          <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 text-center">
                            <div className={`text-[11px] sm:text-sm font-mono font-bold ${getRiskColor(comp.spreadDelta)}`}>
                              {comp.spreadDelta != null ? `${comp.spreadDelta > 0 ? '+' : ''}${comp.spreadDelta.toFixed(1)}` : '-'}
                            </div>
                          </td>
                          <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 text-center hidden sm:table-cell" rowSpan={2}>
                            <div className="flex flex-col gap-0.5 sm:gap-1 items-center">
                              {comp.crossesKeyNumber && comp.keyNumbersCrossed && comp.keyNumbersCrossed.length > 0 && comp.keyNumbersCrossed.some(n => n !== 0) && (
                                <span className="px-1 sm:px-1 py-1 text-[8px] sm:text-[9px] font-mono bg-orange-950 text-orange-700 rounded whitespace-nowrap">
                                  K{comp.keyNumbersCrossed.filter(n => n !== 0).join(',')}
                                </span>
                              )}
                              {comp.favoriteFlipped === true && (
                                <span className="px-1 sm:px-1 py-1 text-[8px] sm:text-[9px] font-mono bg-purple-950 text-purple-400 rounded">
                                  FLP
                                </span>
                              )}
                              {comp.outlierScore != null && comp.outlierScore > 2.0 && (
                                <span className="px-1 sm:px-1 py-1 text-[8px] sm:text-[9px] font-mono bg-red-950 text-red-400 rounded">
                                  OUT
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Home Team Row */}
                        <tr className={`${gameBgClass} hover:bg-zinc-700/50 transition-colors ${gameBorderClass}`}>
                          <td className="px-1 sm:px-2 py-2 sm:py-2.5">
                            <div className="flex items-center min-h-[2.25rem]">
                              <div className="text-[10px] sm:text-xs font-mono text-gray-300 uppercase">
                                {comp.homeTeam}
                              </div>
                            </div>
                          </td>
                          <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 text-center">
                            <div className={`text-[11px] sm:text-sm font-mono font-bold ${homeOpeningSpread !== undefined ? 'text-gray-500' : 'text-gray-600'}`}>
                              {homeOpeningSpread !== undefined
                                ? `${homeOpeningSpread > 0 ? '+' : ''}${homeOpeningSpread.toFixed(1)}`
                                : '-'}
                            </div>
                          </td>
                          <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 text-center">
                            <div className="text-[11px] sm:text-sm font-mono font-bold text-gray-200">
                              {homeMarketSpread !== null ? `${homeMarketSpread > 0 ? '+' : ''}${homeMarketSpread.toFixed(1)}` : '-'}
                            </div>
                          </td>
                          <td className={`px-0.5 sm:px-1 py-2 sm:py-2.5 text-center ${getTeamSpreadStyle(true, comp.picksheetSpread, comp.marketSpread, comp.homeTeam, comp.awayTeam)}`}>
                            <div className="text-[11px] sm:text-sm font-mono font-bold text-gray-200">
                              {homePoolSpread !== null ? `${homePoolSpread > 0 ? '+' : ''}${homePoolSpread.toFixed(1)}` : '-'}
                            </div>
                          </td>
                          <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 text-center">
                            <div className={`text-[11px] sm:text-sm font-mono font-bold ${homeEloSpread !== null ? 'text-purple-400' : 'text-gray-600'}`}>
                              {homeEloSpread !== null ? `${homeEloSpread > 0 ? '+' : ''}${homeEloSpread.toFixed(1)}` : '-'}
                              </div>
                            </td>
                          <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 text-center">
                            {marketDeltaProb !== null && marketDeltaProb > 0 ? (
                              <div className={`text-[11px] sm:text-sm font-mono font-bold ${getImportanceColor(importanceLevel)}`}>
                                {(marketDeltaProb * 100).toFixed(1)}%
                              </div>
                            ) : (
                              <div className="text-[11px] sm:text-sm font-mono font-bold text-gray-600">-</div>
                            )}
                          </td>
                          </tr>
                        </React.Fragment>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
              </table>
            </div>
          </div>
        )}

        {/* System Status */}
        <div className="mt-6 text-center">
          <p className="text-xs font-mono text-gray-600">
            LAST_UPDATE: {currentPipeline ? new Date(currentPipeline.timestamp).toISOString() : 'N/A'} |
            STATUS: {currentPipeline?.status?.toUpperCase() || 'N/A'}
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-zinc-900 border-t border-zinc-800 mt-8">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <p className="text-center text-xs font-mono text-gray-500">
            BEAVERBRAY | © 2025
          </p>
        </div>
      </footer>
    </div>
  )
}
