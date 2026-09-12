'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { type ELOPrediction, predictionLeague } from '@/lib/predictions'
import NavBar from '@/components/NavBar'
import { EntityResolver } from '@/services/entity-resolution'
import type { GameComparison } from '@/services/comparison-engine'

// NOTE: this is a local, narrower copy of the orchestrator's PipelineResult
// (src/services/pipeline-orchestrator.ts). The two have drifted — this one was
// missing `config` entirely. Declaring only the fields this component reads.
interface PipelineResult {
  id: string
  timestamp: string
  status: 'success' | 'partial' | 'failed'
  stage: string
  config?: {
    week?: number
  }
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
      gameTime?: string
    }>
  }
}


export default function CompactDashboard() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [currentPipeline, setCurrentPipeline] = useState<PipelineResult | null>(null)
  const [sortColumn, setSortColumn] = useState<'league' | 'date' | 'team' | 'delta' | 'opening'>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [showOnlyIssues, setShowOnlyIssues] = useState(false)
  // null = the initial fetch has not settled yet. Distinguishing that from
  // "settled with no data" matters: with a plain boolean starting false, the
  // empty state rendered on every page load for the duration of the fetch.
  const [dataLoaded, setDataLoaded] = useState<boolean | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [eloPredictions, setEloPredictions] = useState<ELOPrediction[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentWeek, setCurrentWeek] = useState<number | null>(null)
  // Set when a refresh succeeded but could not be written back to the DB.
  const [persistWarning, setPersistWarning] = useState<string | null>(null)

  // Filter states
  const [filters, setFilters] = useState({
    league: 'all' as 'all' | 'NFL' | 'NCAAF',
    dateFilter: 'all' as 'all' | 'today' | 'tomorrow' | 'week',
    eloFilter: 'all' as 'all' | 'with' | 'without',
    deltaMin: '',
    deltaMax: ''
  })

  // Memoize EntityResolver instance
  const entityResolver = useMemo(() => new EntityResolver(), [])

  // Pre-normalize all team names, within the league the name belongs to.
  //
  // Searching NFL first and falling through to college let pro teams capture
  // college names by fuzzy similarity: "Washington State Cougars" resolved to
  // Washington Commanders, "Pittsburgh Panthers" to the Steelers, "Arizona
  // Wildcats" to the Cardinals. Those games then joined nothing and rendered a
  // blank MOD. Measured against the live board, league-blind matching joined
  // 15 of 47 college games; keying the search to the league joins 47 of 47.
  const normalizedTeamCache = useMemo(() => {
    const cache = new Map<string, string | null>()

    const normalizeTeam = (teamName: string, league?: 'NFL' | 'NCAAF' | 'any'): string | null => {
      const cacheKey = `${league ?? 'any'}|${teamName}`
      if (cache.has(cacheKey)) return cache.get(cacheKey)!

      let normalized: string | null = null
      try {
        const match =
          league === 'NCAAF'
            ? entityResolver.findNCAAFTeamExact(teamName) ||
              entityResolver.findNCAAFTeamFuzzy(teamName)
            : league === 'NFL'
            ? entityResolver.findNFLTeamExact(teamName) ||
              entityResolver.findNFLTeamFuzzy(teamName)
            : // League unknown: exhaust exact matches in both tables before
              // letting either league's fuzzy matcher guess.
              entityResolver.findNFLTeamExact(teamName) ||
              entityResolver.findNCAAFTeamExact(teamName) ||
              entityResolver.findNFLTeamFuzzy(teamName) ||
              entityResolver.findNCAAFTeamFuzzy(teamName)

        normalized = match?.matchedName ?? null
      } catch {
        normalized = null
      }

      cache.set(cacheKey, normalized)
      return normalized
    }

    currentPipeline?.comparison?.comparisons?.forEach(comp => {
      normalizeTeam(comp.homeTeam, comp.league)
      normalizeTeam(comp.awayTeam, comp.league)
    })

    eloPredictions.forEach(pred => {
      const league = predictionLeague(pred)
      normalizeTeam(pred.homeTeam, league)
      normalizeTeam(pred.awayTeam, league)
    })

    return cache
  }, [eloPredictions, currentPipeline?.comparison?.comparisons, entityResolver])

  // Memoize ELO prediction lookups
  const eloPredictionMap = useMemo(() => {
    const map = new Map<string, ELOPrediction>()
    if (!currentPipeline?.comparison?.comparisons) return map

    const predictionIndex = new Map<string, ELOPrediction>()
    for (const pred of eloPredictions) {
      // Must mirror the sentinel normalizeTeam writes for an unknown league,
      // or an unrecognised source silently looks up "undefined|Team".
      const league = predictionLeague(pred) ?? 'any'
      const normalizedHome = normalizedTeamCache.get(`${league}|${pred.homeTeam}`)
      const normalizedAway = normalizedTeamCache.get(`${league}|${pred.awayTeam}`)
      if (normalizedHome && normalizedAway) {
        predictionIndex.set(`${normalizedHome}|${normalizedAway}`, pred)
      }
    }

    for (const comp of currentPipeline.comparison.comparisons) {
      const league = comp.league ?? 'any'
      const normalizedHome = normalizedTeamCache.get(`${league}|${comp.homeTeam}`)
      const normalizedAway = normalizedTeamCache.get(`${league}|${comp.awayTeam}`)

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
    return currentPipeline.comparison.comparisons as GameComparison[]
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
          return
        } catch (e) {
          console.error('Failed to load saved data:', e)
        }
      }

      // Settled with nothing. Distinct from "still fetching" — see the
      // tri-state on dataLoaded.
      setDataLoaded(false)
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

  // Refresh all data (odds + predictions)
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/refresh-all', {
        method: 'POST'
      })

      const data = await response.json()

      if (!response.ok) {
        // Show specific error message if available
        if (data.message) {
          alert(`Refresh failed: ${data.message}`)
        } else if (data.error === 'No picksheet data found') {
          alert('No picksheet found.\n\nPlease upload a picksheet in the Control Panel first.')
          router.push('/control-panel')
          return
        } else if (data.error === 'No picksheet games found') {
          alert('The current pipeline has no games.\n\nPlease upload a new picksheet in the Control Panel.')
          router.push('/control-panel')
          return
        } else {
          alert('Failed to refresh data. Please try again or upload a new picksheet.')
        }
        return
      }

      if (data.pipeline) {
        // Merge the timestamp from the API response into the pipeline object
        const pipelineWithTimestamp = {
          ...data.pipeline,
          timestamp: new Date().toISOString()
        }
        setCurrentPipeline(pipelineWithTimestamp)

        // Re-fetch predictions to get the newly scraped data
        try {
          const predictionsResponse = await fetch('/api/predictions/latest')
          if (predictionsResponse.ok) {
            const predictionsData = await predictionsResponse.json()
            setEloPredictions(predictionsData.predictions || [])
          }
        } catch (predError) {
          console.warn('Failed to refresh predictions:', predError)
        }

        // Show success message with timing info.
        // `persisted: false` means the refresh computed fine but could NOT be
        // written back to the DB (e.g. missing service-role key) — the numbers
        // on screen are real but will vanish on reload, so say so explicitly
        // rather than showing a bare success.
        const timingInfo = data.timing?.total
          ? `Refreshed in ${(data.timing.total / 1000).toFixed(1)}s`
          : 'Refreshed successfully'
        const gamesInfo = data.meta?.gamesMatched
          ? ` • ${data.meta.gamesMatched} games matched`
          : ''

        if (data.persisted === false) {
          setPersistWarning(data.message || 'Results were not saved to the database.')
          alert(
            `${timingInfo}${gamesInfo}\n\n` +
            `WARNING: these results were NOT saved.\n` +
            `${data.message || ''}\n\n` +
            `What you see is current, but it will be lost on reload.`
          )
        } else {
          setPersistWarning(null)
          alert(`${timingInfo}${gamesInfo}`)
        }
      }
    } catch (error) {
      console.error('Error refreshing:', error)
      alert('Failed to refresh data. Make sure a picksheet has been uploaded first.')
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
        case 'opening': {
          // Movement is derived here rather than read from `lineMovement`,
          // which the enricher never populated — so this sort silently did
          // nothing. `openingSpread` now arrives from the server, so the
          // distance the line has travelled since first observation is real.
          const movement = (g: typeof a) =>
            g.openingSpread == null || g.marketSpread == null
              ? -1 // games with no observation yet sort below any real movement
              : Math.abs(g.marketSpread - g.openingSpread)
          compareValue = movement(a) - movement(b)
          break
        }
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
      // No hardcoded zone. This read 'America/Los_Angeles', so a viewer outside
      // Pacific saw every kickoff shifted — a 6:00 PM ET game displayed as
      // 3:00 pm to someone in Central, two hours before it actually starts.
      // Picks lock at kickoff, so the wrong time is worse than no time.
      const dateStr = gameDate ?
        gameDate.toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit',
          year: 'numeric'
        }) : 'N/A'

      // Get hour for grouping (e.g., "9AM", "12PM")
      let hour = 'N/A'
      if (gameDate) {
        const timeString = gameDate.toLocaleTimeString('en-US', {
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
    // gray-400 (not gray-500) for the neutral tier: gray-500 is 4.34:1 on black,
    // which fails WCAG AA for this small mono text. gray-400 is 8.27:1.
    if (delta === null) return 'text-gray-400'
    const absDelta = Math.abs(delta)
    if (absDelta <= 1) return 'text-green-500'
    if (absDelta <= 3) return 'text-orange-700'
    if (absDelta <= 5) return 'text-orange-800'
    return 'text-red-600'
  }

  const getImportanceColor = (importance: string | undefined) => {
    switch (importance) {
      case 'minimal': return 'text-gray-400'        // <1%
      case 'low': return 'text-green-500'           // 1-2%
      case 'moderate': return 'text-orange-400'     // 2-4%
      case 'high': return 'text-orange-700'         // 4-8%
      case 'very-high': return 'text-red-600'       // >8%
      default: return 'text-gray-400'
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
        const homeEloSpread = eloPred.predictedWinner === 'home' ? -eloPred.spread : eloPred.spread
        eloGivesValue = homeEloSpread < poolSpread
      }
    } else {
      // Away team has value if market favors away MORE than pool does
      // Market spread > pool spread (more positive or less negative = away more favored)
      marketGivesValue = marketSpread > poolSpread

      const eloPred = findEloPrediction(homeTeam, awayTeam)
      if (eloPred && eloPred.spread != null) {
        const homeEloSpread = eloPred.predictedWinner === 'home' ? -eloPred.spread : eloPred.spread
        eloGivesValue = homeEloSpread > poolSpread
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

  // Detect stale data. The WEEK label in the header is fetched live, but the table
  // below renders whatever is stored in the DB — without this check, months-old data
  // renders under the current week's heading and looks current.
  const dataStaleness = (() => {
    const ts = currentPipeline?.timestamp
    if (!ts) return null
    const ageMs = Date.now() - new Date(ts).getTime()
    if (Number.isNaN(ageMs)) return null
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000))
    const dataWeek: number | undefined = currentPipeline?.config?.week
    const weekMismatch =
      typeof dataWeek === 'number' && currentWeek !== null && dataWeek !== currentWeek

    // A pool picksheet is refreshed weekly, so anything past a week is stale.
    if (ageDays < 7 && !weekMismatch) return null

    const age =
      ageDays >= 60 ? `${Math.floor(ageDays / 30)} months old`
      : ageDays >= 14 ? `${Math.floor(ageDays / 7)} weeks old`
      : `${ageDays} days old`

    return {
      ageDays,
      text: weekMismatch
        ? `Showing Week ${dataWeek} data (${age}) while the current detected week is ${currentWeek}.`
        : `Showing data that is ${age}.`
    }
  })()

  // Show loading during hydration, and while the initial fetch is in flight.
  // dataLoaded === null means "not settled"; treating that as "no data" is
  // what made the empty state flash on every page load.
  if (!mounted || dataLoaded === null) {
    return (
      <div className="min-h-screen bg-black text-gray-100">
        <NavBar showRefreshButton={false} showShareButton={false} />
        <main className="max-w-6xl mx-auto px-2 sm:px-4 py-6">
          <div className="text-sm font-mono text-gray-400" role="status" aria-live="polite">
            Loading...
          </div>
        </main>
      </div>
    )
  }

  // No comparison data yet. Render the normal shell rather than a full-screen
  // dead end: the nav stays reachable, and the copy no longer says "upload
  // picksheet data", which stopped being true once the picksheet started
  // arriving automatically from the scheduled fetch.
  if (dataLoaded === false) {
    return (
      <div className="min-h-screen bg-black text-gray-100">
        <NavBar showRefreshButton={false} showShareButton={false} />
        <main className="max-w-6xl mx-auto px-2 sm:px-4 py-1 sm:py-6">
          <div
            role="status"
            className="mb-2 sm:mb-4 rounded border border-orange-800 bg-orange-950/40 px-3 py-2"
          >
            <div className="text-[10px] sm:text-xs font-mono text-orange-400 font-bold">
              NO_COMPARISON_DATA
            </div>
            <div className="text-[10px] sm:text-xs font-mono text-orange-200/80 mt-0.5">
              Nothing has been analysed yet. The picksheet is fetched automatically each
              week; if this persists, run a refresh from the{' '}
              <button
                onClick={() => router.push('/control-panel')}
                className="underline hover:text-orange-100"
              >
                Control Panel
              </button>
              .
            </div>
          </div>
        </main>
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
      <main className="max-w-6xl mx-auto px-2 sm:px-4 py-1 sm:py-6">
        {/* Refresh succeeded but the result was not written back to the DB */}
        {persistWarning && (
          <div
            role="alert"
            className="mb-2 sm:mb-4 rounded border border-red-700 bg-red-950/60 px-3 py-2"
          >
            <div className="text-[10px] sm:text-xs font-mono text-red-300 font-bold">
              NOT_SAVED
            </div>
            <div className="text-[10px] sm:text-xs font-mono text-red-200 mt-0.5">
              {persistWarning} These numbers are current but will be lost on reload.
            </div>
          </div>
        )}

        {/* Stored data is older than a week, or is for a different week than detected */}
        {!persistWarning && dataStaleness && (
          <div
            role="status"
            className="mb-2 sm:mb-4 rounded border border-orange-700 bg-orange-950/50 px-3 py-2"
          >
            <div className="text-[10px] sm:text-xs font-mono text-orange-300 font-bold">
              STALE_DATA
            </div>
            <div className="text-[10px] sm:text-xs font-mono text-orange-200 mt-0.5">
              {dataStaleness.text} Use REFRESH ALL, or upload a new picksheet in the Control Panel.
            </div>
          </div>
        )}

        {/* KPI Metrics */}
        {currentPipeline?.comparison?.kpis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-4 mb-2 sm:mb-6">
            <div className="bg-zinc-900 rounded border border-zinc-800 p-1.5 sm:p-4">
              <div className="flex flex-col items-center sm:flex-row sm:items-baseline sm:gap-2">
                <span className="text-[10px] font-mono text-gray-400 leading-tight">REM:</span>
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
              <div className="text-[8px] sm:text-xs font-mono text-gray-400 mt-0.5 sm:mt-1 leading-tight hidden sm:block">
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
                <span className="text-[10px] font-mono text-gray-400 leading-tight">AVG Δ:</span>
                <span className={`text-[13px] sm:text-xs font-mono font-bold ${getRiskColor(currentPipeline.comparison.kpis.avgSpreadDelta)}`}>
                  {currentPipeline.comparison.kpis.avgSpreadDelta != null ? currentPipeline.comparison.kpis.avgSpreadDelta.toFixed(2) : '-'}
                </span>
              </div>
              <div className="text-[8px] sm:text-xs font-mono text-gray-400 mt-0.5 sm:mt-1 leading-tight hidden sm:block">
                MEDIAN: {currentPipeline.comparison.kpis.medianSpreadDelta != null ? currentPipeline.comparison.kpis.medianSpreadDelta.toFixed(2) : '-'}
              </div>
            </div>

            <div className="bg-zinc-900 rounded border border-zinc-800 p-1.5 sm:p-4">
              <div className="flex flex-col items-center sm:flex-row sm:items-baseline sm:gap-2">
                <span className="text-[10px] font-mono text-gray-400 leading-tight">KEY #:</span>
                <span className="text-[13px] sm:text-xs font-mono font-bold text-orange-700">
                  {currentPipeline.comparison.kpis.keyNumberCrossings}
                </span>
              </div>
              <div className="text-[8px] sm:text-xs font-mono text-gray-400 mt-0.5 sm:mt-1 leading-tight hidden sm:block">
                THRESHOLDS: [3,7,10,14]
              </div>
            </div>

            <div className="bg-zinc-900 rounded border border-zinc-800 p-1.5 sm:p-4">
              <div className="flex flex-col items-center sm:flex-row sm:items-baseline sm:gap-2">
                <span className="text-[10px] font-mono text-gray-400 leading-tight">FLIPS:</span>
                <span className="text-[13px] sm:text-xs font-mono font-bold text-purple-400">
                  {currentPipeline.comparison.kpis.favoriteFlips}
                </span>
              </div>
              <div className="text-[8px] sm:text-xs font-mono text-gray-400 mt-0.5 sm:mt-1 leading-tight hidden sm:block">
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] sm:text-xs font-mono text-gray-400 hover:text-orange-600 transition-colors"
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
                className="flex-1 flex items-center justify-between px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-[10px] font-mono text-gray-300 hover:bg-zinc-800 transition-colors"
              >
                <span>FILTERS {showFilters ? '▼' : '►'}</span>
                <span className="text-gray-400">
                  {showOnlyIssues || filters.league !== 'all' || filters.dateFilter !== 'all' ||
                   filters.eloFilter !== 'all' || filters.deltaMin || filters.deltaMax || searchTerm ? 'ACTIVE' : 'OFF'}
                </span>
              </button>
              <button
                onClick={() => setShowGuide(!showGuide)}
                className="px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-[10px] font-mono text-orange-600 hover:bg-zinc-800 transition-colors"
              >
                ℹ
              </button>
              <div className="text-[10px] font-mono text-gray-400 whitespace-nowrap">
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
                <div className="space-y-1.5 text-[10px] font-mono">
                  <div><span className="text-orange-700">OPEN:</span> <span className="text-gray-400">Opening line spread</span></div>
                  <div><span className="text-orange-700">MKT:</span> <span className="text-gray-400">Current market spread</span></div>
                  <div><span className="text-orange-700">POOL:</span> <span className="text-gray-400">Office pool spread</span></div>
                  <div><span className="text-orange-700">MOD:</span> <span className="text-gray-400">Model predicted spread</span></div>
                  <div><span className="text-orange-700">Δp%:</span> <span className="text-gray-400">Market delta probability = |p_pool - p_market| + key_number_weights, calibrated</span></div>
                  <div className="pt-1 border-t border-zinc-700 mt-1">
                    <div className="text-orange-700 mb-1">COLOR CODING:</div>
                    <div><span className="text-gray-400">Gray Δp%:</span> <span className="text-gray-400">Minimal (&lt;1%)</span></div>
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
                <label className="block text-xs font-mono text-gray-400 mb-1">LEAGUE</label>
                <select
                  value={filters.league}
                  onChange={(e) => setFilters({...filters, league: e.target.value as 'all' | 'NFL' | 'NCAAF'})}
                  className="w-full px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                >
                  <option value="all">ALL</option>
                  <option value="NFL">NFL</option>
                  <option value="NCAAF">NCAAF</option>
                </select>
              </div>

              {/* Date Filter */}
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1">DATE</label>
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
                <label className="block text-xs font-mono text-gray-400 mb-1">MODEL</label>
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
                <label className="block text-xs font-mono text-gray-400 mb-1">DELTA_ABS</label>
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
                  <span className="text-xs font-mono text-gray-400">FLAGGED_GAMES</span>
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
              <div className="ml-auto text-xs font-mono text-gray-400 hidden sm:block">
                SHOWING: {getFilteredComparisons().length} / {enrichedComparisons.length}
              </div>
            )}

          </div>
        )}

        {/* Week Display and Guide Button Row */}
        {currentPipeline?.comparison?.comparisons && (
          <div className="hidden sm:flex justify-between items-center mb-2 relative">
            <div className="text-xs font-mono text-gray-400">
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
                    <div><span className="text-gray-400 font-bold">Gray Δp%:</span> <span className="text-gray-400">Minimal importance (&lt;1%)</span></div>
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
                <caption className="sr-only">Comparison of pool, market, and model spreads by game</caption>
                <thead className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-10">
                  <tr>
                    <th
                      scope="col"
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSort('date')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleSort('date')
                        }
                      }}
                      className="px-1 sm:px-2 py-1.5 sm:py-2 text-left text-[10px] sm:text-xs font-mono text-gray-400 bg-zinc-950 cursor-pointer hover:text-orange-500 transition-colors"
                    >
                      MATCHUP {sortColumn === 'date' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    {/* The Tuesday-morning line, captured by the snapshot-odds agent.
                        Not the book's literal first post (The Odds API's historical
                        endpoint is a paid tier) — but by Tuesday the prior week's
                        results and the injury picture are in and books have repriced,
                        so this is the number the pool is actually playing against. */}
                    <th scope="col" className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-mono text-gray-400 bg-zinc-950" title="Line as of Tuesday morning, after the previous week's results and injury news.">OPEN</th>
                    <th scope="col" className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-mono text-gray-400 bg-zinc-950">MKT</th>
                    <th scope="col" className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-mono text-gray-400 bg-zinc-950">POOL</th>
                    <th scope="col" className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-mono text-gray-400 bg-zinc-950" title="Independent model line: nfelo's pre-market Elo rating for the NFL, Warren Nolan's projection for college. Deliberately not the market's number — that is the MKT column.">MOD</th>
                    {/* Two units share this column by design: the away row carries the
                        spread delta in points, the home row the calibrated probability
                        delta. Labelling it "Δp%" alone made the away row's -0.5 read as
                        a percentage. */}
                    <th scope="col" className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-mono text-gray-400 bg-zinc-950" title="Away row: spread delta in points. Home row: calibrated market delta probability.">Δpts<span className="text-gray-600">/</span>Δp%</th>
                    <th scope="col" className="px-0.5 sm:px-1 py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-mono text-gray-400 bg-zinc-950 hidden sm:table-cell">🚩</th>
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
                              <span className={`text-[10px] font-mono px-1.5 py-0.5 sm:px-2 sm:py-1 rounded font-bold ${league === 'NFL' ? 'bg-blue-900/50 text-blue-300' : 'bg-green-900/50 text-green-300'}`}>
                                {league}
                              </span>
                              <span className="text-[10px] sm:text-xs font-mono text-gray-400 font-bold">
                                {dateStr}
                              </span>
                              <span className="text-[10px] font-mono text-gray-400">
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

                          // Viewer's own zone, with the abbreviation shown: a
                          // bare "3:00 pm" is unfalsifiable, and this column is
                          // the deadline to get a pick in.
                          const timeStr = gameDate ?
                            gameDate.toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                              timeZoneName: 'short'
                            }).toLowerCase() : ''

                          const eloPred = findEloPrediction(comp.homeTeam, comp.awayTeam)
                          // AWAY-perspective. `analysis_predictions.spread` is a magnitude
                          // (nfelo-scraper stores Math.abs), with predictedWinner naming the
                          // favourite — so home-favoured means the away side is +spread.
                          // Note getTeamSpreadStyle derives the HOME-perspective value with
                          // the opposite formula; both are correct, hence the explicit names.
                          const awayEloSpread = eloPred && eloPred.spread != null
                            ? (eloPred.predictedWinner === 'home' ? eloPred.spread : -eloPred.spread)
                            : null

                          // Calculate spreads from away team perspective
                          const awayPoolSpread = comp.picksheetSpread != null ? -comp.picksheetSpread : null
                          const awayMarketSpread = comp.marketSpread != null ? -comp.marketSpread : null

                          const homePoolSpread = comp.picksheetSpread
                          const homeMarketSpread = comp.marketSpread
                          // openingSpread is home-perspective, like marketSpread and
                          // picksheetSpread — the away row negates it, the home row does not.
                          const awayOpeningSpread = (comp.openingSpread !== undefined && comp.openingSpread !== null) ? -comp.openingSpread : undefined
                          const homeEloSpread = awayEloSpread !== null ? -awayEloSpread : null

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
                                  <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                                    {timeStr}
                                  </div>
                                </td>
                                <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 text-center">
                            <div className="text-[11px] sm:text-sm font-mono font-bold text-gray-400">
                              {awayOpeningSpread !== undefined
                                ? `${awayOpeningSpread > 0 ? '+' : ''}${awayOpeningSpread.toFixed(1)}`
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
                            <div className={`text-[11px] sm:text-sm font-mono font-bold ${awayEloSpread !== null ? 'text-purple-400' : 'text-gray-400'}`}>
                              {awayEloSpread !== null ? `${awayEloSpread > 0 ? '+' : ''}${awayEloSpread.toFixed(1)}` : '-'}
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
                                <span className="px-1 sm:px-1 py-1 text-[10px] font-mono bg-orange-950 text-orange-700 rounded whitespace-nowrap">
                                  K{comp.keyNumbersCrossed.filter(n => n !== 0).join(',')}
                                </span>
                              )}
                              {comp.favoriteFlipped === true && (
                                <span className="px-1 sm:px-1 py-1 text-[10px] font-mono bg-purple-950 text-purple-400 rounded">
                                  FLP
                                </span>
                              )}
                              {comp.outlierScore != null && comp.outlierScore > 2.0 && (
                                <span className="px-1 sm:px-1 py-1 text-[10px] font-mono bg-red-950 text-red-400 rounded">
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
                            <div className="text-[11px] sm:text-sm font-mono font-bold text-gray-400">
                              {(comp.openingSpread !== undefined && comp.openingSpread !== null)
                                ? `${comp.openingSpread > 0 ? '+' : ''}${comp.openingSpread.toFixed(1)}`
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
                            <div className={`text-[11px] sm:text-sm font-mono font-bold ${homeEloSpread !== null ? 'text-purple-400' : 'text-gray-400'}`}>
                              {homeEloSpread !== null ? `${homeEloSpread > 0 ? '+' : ''}${homeEloSpread.toFixed(1)}` : '-'}
                              </div>
                            </td>
                          <td className="px-0.5 sm:px-1 py-2 sm:py-2.5 text-center">
                            {marketDeltaProb !== null && marketDeltaProb > 0 ? (
                              <div className={`text-[11px] sm:text-sm font-mono font-bold ${getImportanceColor(importanceLevel)}`}>
                                {(marketDeltaProb * 100).toFixed(1)}%
                              </div>
                            ) : (
                              <div className="text-[11px] sm:text-sm font-mono font-bold text-gray-400">-</div>
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
          <p className="text-xs font-mono text-gray-400">
            LAST_UPDATE: {currentPipeline ? new Date(currentPipeline.timestamp).toISOString() : 'N/A'} |
            STATUS: {currentPipeline?.status?.toUpperCase() || 'N/A'}
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-zinc-900 border-t border-zinc-800 mt-8">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <p className="text-center text-xs font-mono text-gray-400">
            BEAVERBRAY | © 2025
          </p>
        </div>
      </footer>
    </div>
  )
}
