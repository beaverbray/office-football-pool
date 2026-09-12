'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { EntityResolver } from '@/services/entity-resolution'
import type { GameComparison } from '@/services/comparison-engine'
import type { EntryState } from '@/services/splash-api'

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
      marketDeltaProb?: number
      importanceLevel?: 'minimal' | 'low' | 'moderate' | 'high' | 'very-high'
      outlierScore?: number
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

export default function ModelPicksPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [currentPipeline, setCurrentPipeline] = useState<PipelineResult | null>(null)
  // null = the initial fetch has not settled. With a plain boolean starting
  // false, the empty state rendered on every page load for the fetch's duration.
  const [dataLoaded, setDataLoaded] = useState<boolean | null>(null)
  const [eloPredictions, setEloPredictions] = useState<ELOPrediction[]>([])

  // Our picks for this slate, recorded by the picksheet fetch. The dashboard
  // cannot ask Splash for it directly: their API rejects datacenter IPs.
  const entry = (currentPipeline as unknown as { entry?: EntryState | null })?.entry ?? null

  // Memoize EntityResolver instance
  const entityResolver = useMemo(() => new EntityResolver(), [])

  // Pre-normalize all team names WITH league context
  const normalizedTeamCache = useMemo(() => {
    const cache = new Map<string, string>()

    const normalizeTeam = (teamName: string, league?: 'NFL' | 'NCAAF'): string | null => {
      const cacheKey = league ? `${league}:${teamName}` : teamName
      if (cache.has(cacheKey)) return cache.get(cacheKey)!

      try {
        let match

        // If league is specified, check only that league
        if (league === 'NFL') {
          match = entityResolver.findNFLTeamExact(teamName) ||
                  entityResolver.findNFLTeamFuzzy(teamName)
        } else if (league === 'NCAAF') {
          // 'NCAAF', not 'NCAA' — comparisons carry the former, so this branch
          // never fired and college names fell through to the both-leagues
          // path below, which tries NFL first and can fuzzy-hit a pro team.
          match = entityResolver.findNCAAFTeamExact(teamName) ||
                  entityResolver.findNCAAFTeamFuzzy(teamName)
        } else {
          // No league specified, try NFL first (for ELO predictions which are NFL-only), then NCAAF
          match = entityResolver.findNFLTeamExact(teamName) ||
                  entityResolver.findNFLTeamFuzzy(teamName) ||
                  entityResolver.findNCAAFTeamExact(teamName) ||
                  entityResolver.findNCAAFTeamFuzzy(teamName)
        }

        const normalized = match?.matchedName || null
        cache.set(cacheKey, normalized!)
        return normalized
      } catch {
        cache.set(cacheKey, null!)
        return null
      }
    }

    currentPipeline?.comparison?.comparisons?.forEach(comp => {
      normalizeTeam(comp.homeTeam, comp.league)
      normalizeTeam(comp.awayTeam, comp.league)
    })

    // ELO predictions are NFL-only
    eloPredictions.forEach(pred => {
      normalizeTeam(pred.homeTeam, 'NFL')
      normalizeTeam(pred.awayTeam, 'NFL')
    })

    return cache
  }, [eloPredictions, currentPipeline?.comparison?.comparisons, entityResolver])

  // Memoize ELO prediction lookups WITH league context
  const eloPredictionMap = useMemo(() => {
    const map = new Map<string, ELOPrediction>()
    if (!currentPipeline?.comparison?.comparisons) return map

    // Build prediction index with NFL league context (ELO is NFL-only)
    const predictionIndex = new Map<string, ELOPrediction>()
    for (const pred of eloPredictions) {
      const normalizedHome = normalizedTeamCache.get(`NFL:${pred.homeTeam}`)
      const normalizedAway = normalizedTeamCache.get(`NFL:${pred.awayTeam}`)

      if (normalizedHome && normalizedAway) {
        predictionIndex.set(`${normalizedHome}|${normalizedAway}`, pred)
      }
    }

    // Match predictions to comparisons using league-aware normalization
    for (const comp of currentPipeline.comparison.comparisons) {
      const cacheKeyHome = comp.league ? `${comp.league}:${comp.homeTeam}` : comp.homeTeam
      const cacheKeyAway = comp.league ? `${comp.league}:${comp.awayTeam}` : comp.awayTeam

      const normalizedHome = normalizedTeamCache.get(cacheKeyHome)
      const normalizedAway = normalizedTeamCache.get(cacheKeyAway)

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

  // Load data from API on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/api/pipeline/current')
        if (response.ok) {
          const data = await response.json()
          if (data.pipeline) {
            setCurrentPipeline(data.pipeline)
            setDataLoaded(true)
            return
          }
        }
      } catch (error) {
        console.warn('Failed to load from API:', error)
      }

      // Fallback to localStorage
      const savedData = localStorage.getItem('pipelineData')
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData)
          setCurrentPipeline(parsed)
          setDataLoaded(true)
          return
        } catch (e) {
          console.error('Failed to load saved data:', e)
        }
      }

      // Settled with nothing — distinct from still fetching.
      setDataLoaded(false)
    }

    loadData()
  }, [])

  // Fetch ELO predictions
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

  // Helper to find matching ELO prediction for a game
  const findEloPrediction = (homeTeam: string, awayTeam: string) => {
    return eloPredictionMap.get(`${homeTeam}|${awayTeam}`)
  }

  // Calculate model picks - score and rank games by value
  const getModelPicks = () => {
    const now = new Date()

    // Only include future games
    const futureGames = enrichedComparisons.filter(comp => {
      const gameDate = comp.gameTime ? new Date(comp.gameTime) : null
      return gameDate && gameDate > now
    })

    // Pick the best side (home or away) for each game
    const scoredPicks = futureGames.map(comp => {
      const eloPred = findEloPrediction(comp.homeTeam, comp.awayTeam)
      const eloSpread = eloPred && eloPred.spread != null
        ? (eloPred.predictedWinner === 'home' ? eloPred.spread : -eloPred.spread)
        : null

      const awayPoolSpread = comp.picksheetSpread != null ? -comp.picksheetSpread : null
      const awayMarketSpread = comp.marketSpread != null ? -comp.marketSpread : null
      const homePoolSpread = comp.picksheetSpread
      const homeMarketSpread = comp.marketSpread
      const homeEloSpread = eloSpread !== null ? -eloSpread : null

      const marketDeltaProb = comp.marketDeltaProb ?? 0

      // Evaluate away team pick
      let awayScore = -Infinity
      let awayPick = null
      if (awayPoolSpread !== null && awayMarketSpread !== null) {
        const delta = awayMarketSpread - awayPoolSpread
        const absDelta = Math.abs(delta)
        const relPercent = awayPoolSpread !== 0 ? (delta / Math.abs(awayPoolSpread)) * 100 : 0
        const marketValue = delta > 0
        const eloValue = eloSpread !== null ? eloSpread > awayPoolSpread : false

        if (marketValue) {
          awayScore = marketDeltaProb * 100 // Base score from probability (0-100)
          awayScore += absDelta * 5 // Edge size bonus (points of value * 5)
          if (eloValue) awayScore += 10 // ELO confirmation bonus
          if (marketDeltaProb > 0.05) awayScore += 15 // High probability bonus (>5%)
          if (marketDeltaProb > 0.10) awayScore += 25 // Very high probability bonus (>10%)

          awayPick = {
            ...comp,
            team: comp.awayTeam,
            opponent: comp.homeTeam,
            isHome: false,
            poolSpread: awayPoolSpread,
            marketSpread: awayMarketSpread,
            eloSpread: eloSpread,
            delta,
            absDelta,
            relPercent,
            marketValue,
            eloValue,
            score: awayScore,
            marketDeltaProb,
            importanceLevel: comp.importanceLevel
          }
        }
      }

      // Evaluate home team pick
      let homeScore = -Infinity
      let homePick = null
      if (homePoolSpread !== null && homeMarketSpread !== null) {
        const delta = homeMarketSpread - homePoolSpread
        const absDelta = Math.abs(delta)
        const relPercent = homePoolSpread !== 0 ? (delta / Math.abs(homePoolSpread)) * 100 : 0
        const marketValue = delta < 0
        const eloValue = homeEloSpread !== null ? homeEloSpread < homePoolSpread : false

        if (marketValue) {
          homeScore = marketDeltaProb * 100 // Base score from probability (0-100)
          homeScore += absDelta * 5 // Edge size bonus (points of value * 5)
          if (eloValue) homeScore += 10 // ELO confirmation bonus
          if (marketDeltaProb > 0.05) homeScore += 15 // High probability bonus (>5%)
          if (marketDeltaProb > 0.10) homeScore += 25 // Very high probability bonus (>10%)

          homePick = {
            ...comp,
            team: comp.homeTeam,
            opponent: comp.awayTeam,
            isHome: true,
            poolSpread: homePoolSpread,
            marketSpread: homeMarketSpread,
            eloSpread: homeEloSpread,
            delta,
            absDelta,
            relPercent,
            marketValue,
            eloValue,
            score: homeScore,
            marketDeltaProb,
            importanceLevel: comp.importanceLevel
          }
        }
      }

      // Return the better pick (or null if neither has value)
      if (awayScore > homeScore && awayPick) return awayPick
      if (homePick) return homePick
      return null
    }).filter(pick => pick !== null) as any[]

    // Sort by score (highest first)
    scoredPicks.sort((a, b) => b.score - a.score)

    // How many slots the pool still lets us decide, per league. The entry state
    // comes from the picksheet fetch: Splash publishes the requirement as
    // `leagueMinimums` rather than it being a constant worth guessing, and a
    // pick whose game has started is locked, so it consumes a slot for good.
    const quotaFor = (league: 'NFL' | 'NCAAF') => {
      const q = entry?.quota?.[league] ?? 10
      const locked = entry?.locked?.[league] ?? 0
      return Math.max(0, q - locked)
    }

    // Games whose pick has locked are not decisions any more; recommending
    // them is noise. Keyed by gameId, which the picksheet and comparisons share.
    const lockedGameIds = new Set((entry?.picks ?? []).filter(p => p.locked).map(p => p.gameId))
    const decidable = scoredPicks.filter(p => !lockedGameIds.has(p.gameId))

    // 'NCAAF', not 'NCAA'. Comparisons have always carried 'NCAAF', so this
    // filter matched nothing and the college half of this page was empty —
    // which is the whole reason the screen looked broken.
    const nflPicks = decidable.filter(p => p.league === 'NFL').slice(0, quotaFor('NFL'))
    const ncaaPicks = decidable.filter(p => p.league === 'NCAAF').slice(0, quotaFor('NCAAF'))

    return { nflPicks, ncaaPicks }
  }

  // Loading covers hydration AND the in-flight initial fetch: dataLoaded ===
  // null means not settled, and treating that as "no data" made the empty
  // state flash on every page load.
  if (!mounted || dataLoaded === null) {
    return (
      <div className="min-h-screen bg-black text-gray-100">
        <NavBar />
        <div className="max-w-6xl mx-auto px-2 sm:px-4 py-6">
          <div className="text-sm font-mono text-gray-500" role="status" aria-live="polite">
            Loading...
          </div>
        </div>
      </div>
    )
  }

  // No comparison data yet. Render the normal shell rather than a full-screen
  // dead end, so the nav stays reachable. The old copy ("upload picksheet
  // data") also stopped being true once the picksheet started arriving
  // automatically from the scheduled fetch.
  if (dataLoaded === false) {
    return (
      <div className="min-h-screen bg-black text-gray-100">
        <NavBar />
        <div className="max-w-6xl mx-auto px-2 sm:px-4 py-1 sm:py-6">
          <div
            role="status"
            className="rounded border border-orange-800 bg-orange-950/40 px-3 py-2"
          >
            <div className="text-[10px] sm:text-xs font-mono text-orange-400 font-bold">
              NO_COMPARISON_DATA
            </div>
            <div className="text-[10px] sm:text-xs font-mono text-orange-200/80 mt-0.5">
              No picks to rank yet. The picksheet is fetched automatically each week;
              if this persists, run a refresh from the{' '}
              <button
                onClick={() => router.push('/control-panel')}
                className="underline hover:text-orange-100"
              >
                Control Panel
              </button>
              .
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Says what is actually on offer rather than a hardcoded "TOP 10": the pool
  // requires `quota` per league and locked picks have already consumed some.
  const slotLabel = (league: 'NFL' | 'NCAAF') => {
    const quota = entry?.quota?.[league]
    const locked = entry?.locked?.[league] ?? 0
    if (!quota) return 'TOP PICKS'
    const remaining = Math.max(0, quota - locked)
    return locked > 0
      ? `BEST ${remaining} OF ${quota} \u00b7 ${locked} LOCKED`
      : `BEST ${remaining} OF ${quota}`
  }

  const { nflPicks, ncaaPicks } = getModelPicks()

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <NavBar />
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-1 sm:py-6">
        <div className="space-y-4">
          {/* Info Banner */}
          <div className="bg-zinc-900 rounded border border-zinc-800 p-3 sm:p-4">
            <h2 className="text-sm sm:text-base font-mono font-bold text-orange-600 mb-2">MODEL PICKS EXPLANATION</h2>
            <div className="text-[10px] sm:text-xs font-mono text-gray-400">
              <p className="mb-2">Shows <span className="text-orange-500 font-bold">best betting side per game</span> ranked by probability-based value. Each game appears once with the side offering the best market value.</p>
              <p className="text-[9px] sm:text-[10px] text-gray-500">
                <strong className="text-gray-400">Scoring:</strong> Market Δ Prob (0-100 base) + Edge Size (points × 5) + ELO bonus (10) + High probability bonuses (15-25)
              </p>
              <p className="mt-1 text-[9px] sm:text-[10px] text-gray-500">
                <strong className="text-gray-400">Δ%</strong> = Calibrated probability that the disagreement is significant (considers key numbers & probability shifts)
              </p>
            </div>
          </div>

          {/* Already committed: picks whose game has started and can no longer
              be changed. They consume a slot, so the recommendations below are
              sized to what is actually still decidable. */}
          {entry && entry.picks.some(p => p.locked) && (
            <div className="bg-zinc-900 rounded border border-zinc-800 p-3 sm:p-4">
              <h2 className="text-sm sm:text-base font-mono font-bold text-gray-300 mb-2">
                LOCKED THIS WEEK
                <span className="text-gray-500 text-xs font-normal ml-2">
                  already started &mdash; cannot be changed
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                {entry.picks.filter(p => p.locked).map(p => (
                  <span
                    key={p.gameId}
                    className={`px-2 py-1 rounded text-[10px] sm:text-xs font-mono border ${
                      p.grade === 'won'
                        ? 'border-green-700 bg-green-950/40 text-green-300'
                        : p.grade === 'lost'
                        ? 'border-red-800 bg-red-950/40 text-red-300'
                        : 'border-zinc-700 bg-zinc-800/60 text-gray-300'
                    }`}
                  >
                    {p.league} {p.team} {p.spread != null ? (p.spread > 0 ? `+${p.spread}` : p.spread) : ''} vs {p.opponent}
                    {p.grade ? ` \u00b7 ${p.grade}` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* NFL Picks Table */}
            <div>
              <h2 className="text-sm sm:text-base font-mono font-bold text-blue-300 mb-2 flex items-center gap-2">
                <span className="bg-blue-900/50 px-2 py-1 rounded text-xs">NFL</span>
                <span className="text-gray-500 text-xs">{slotLabel('NFL')}</span>
              </h2>
              {nflPicks.length > 0 ? (
                <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-zinc-950 border-b border-zinc-800">
                        <tr>
                          <th className="px-1 sm:px-2 py-1.5 text-left text-[9px] sm:text-[10px] font-mono text-gray-500">#</th>
                          <th className="px-1 sm:px-2 py-1.5 text-left text-[9px] sm:text-[10px] font-mono text-gray-500">TEAM</th>
                          <th className="px-1 sm:px-2 py-1.5 text-center text-[9px] sm:text-[10px] font-mono text-gray-500">POOL</th>
                          <th className="px-1 sm:px-2 py-1.5 text-center text-[9px] sm:text-[10px] font-mono text-gray-500">MKT</th>
                          <th className="px-1 sm:px-2 py-1.5 text-center text-[9px] sm:text-[10px] font-mono text-gray-500">Δ</th>
                          <th className="px-1 sm:px-2 py-1.5 text-center text-[9px] sm:text-[10px] font-mono text-gray-500">Δ%</th>
                          <th className="px-1 sm:px-2 py-1.5 text-center text-[9px] sm:text-[10px] font-mono text-gray-500">REL%</th>
                          <th className="px-1 sm:px-2 py-1.5 text-center text-[9px] sm:text-[10px] font-mono text-gray-500">MOD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {nflPicks.map((pick, idx) => (
                          <tr key={`${pick.gameId}-${pick.team}`} className="hover:bg-zinc-800/50 transition-colors">
                            <td className="px-1 sm:px-2 py-2 text-[10px] sm:text-xs font-mono font-bold text-orange-700">
                              {idx + 1}
                            </td>
                            <td className="px-1 sm:px-2 py-2 text-[9px] sm:text-[10px] font-mono text-gray-300">
                              {pick.oddsSharkUrl ? (
                                <a
                                  href={pick.oddsSharkUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-dotted hover:text-orange-400 transition-colors"
                                  title="Open this matchup on OddsShark"
                                >
                                  {pick.team}
                                </a>
                              ) : (
                                pick.team
                              )}
                            </td>
                            <td className="px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-mono font-bold bg-orange-900/30 text-orange-400">
                              {pick.poolSpread > 0 ? '+' : ''}{pick.poolSpread.toFixed(1)}
                            </td>
                            <td className="px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-mono font-bold text-gray-200">
                              {pick.marketSpread > 0 ? '+' : ''}{pick.marketSpread.toFixed(1)}
                            </td>
                            <td className={`px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-mono font-bold ${pick.absDelta > 3 ? 'text-red-500' : pick.absDelta > 1 ? 'text-orange-700' : 'text-green-500'}`}>
                              {pick.delta > 0 ? '+' : ''}{pick.delta.toFixed(1)}
                            </td>
                            <td className={`px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-mono font-bold ${
                              pick.importanceLevel === 'very-high' ? 'text-red-500' :
                              pick.importanceLevel === 'high' ? 'text-orange-500' :
                              pick.importanceLevel === 'moderate' ? 'text-yellow-500' :
                              pick.importanceLevel === 'low' ? 'text-green-500' :
                              'text-gray-600'
                            }`}>
                              {(pick.marketDeltaProb ?? 0) > 0 ? `${(pick.marketDeltaProb * 100).toFixed(1)}%` : '-'}
                            </td>
                            <td className={`px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-mono font-bold ${Math.abs(pick.relPercent) > 15 ? 'text-red-400' : Math.abs(pick.relPercent) > 10 ? 'text-orange-400' : 'text-gray-400'}`}>
                              {pick.relPercent > 0 ? '+' : ''}{pick.relPercent.toFixed(1)}%
                            </td>
                            <td className="px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-mono font-bold text-purple-400">
                              {pick.eloSpread !== null ? `${pick.eloSpread > 0 ? '+' : ''}${pick.eloSpread.toFixed(1)}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-900 rounded border border-zinc-800 p-4 text-center">
                  <p className="text-xs font-mono text-gray-500">No NFL games available</p>
                </div>
              )}
            </div>

            {/* NCAA Picks Table */}
            <div>
              <h2 className="text-sm sm:text-base font-mono font-bold text-green-300 mb-2 flex items-center gap-2">
                <span className="bg-green-900/50 px-2 py-1 rounded text-xs">NCAAF</span>
                <span className="text-gray-500 text-xs">{slotLabel('NCAAF')}</span>
              </h2>
              {ncaaPicks.length > 0 ? (
                <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-zinc-950 border-b border-zinc-800">
                        <tr>
                          <th className="px-1 sm:px-2 py-1.5 text-left text-[9px] sm:text-[10px] font-mono text-gray-500">#</th>
                          <th className="px-1 sm:px-2 py-1.5 text-left text-[9px] sm:text-[10px] font-mono text-gray-500">TEAM</th>
                          <th className="px-1 sm:px-2 py-1.5 text-center text-[9px] sm:text-[10px] font-mono text-gray-500">POOL</th>
                          <th className="px-1 sm:px-2 py-1.5 text-center text-[9px] sm:text-[10px] font-mono text-gray-500">MKT</th>
                          <th className="px-1 sm:px-2 py-1.5 text-center text-[9px] sm:text-[10px] font-mono text-gray-500">Δ</th>
                          <th className="px-1 sm:px-2 py-1.5 text-center text-[9px] sm:text-[10px] font-mono text-gray-500">Δ%</th>
                          <th className="px-1 sm:px-2 py-1.5 text-center text-[9px] sm:text-[10px] font-mono text-gray-500">REL%</th>
                          <th className="px-1 sm:px-2 py-1.5 text-center text-[9px] sm:text-[10px] font-mono text-gray-500">MOD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {ncaaPicks.map((pick, idx) => (
                          <tr key={`${pick.gameId}-${pick.team}`} className="hover:bg-zinc-800/50 transition-colors">
                            <td className="px-1 sm:px-2 py-2 text-[10px] sm:text-xs font-mono font-bold text-orange-700">
                              {idx + 1}
                            </td>
                            <td className="px-1 sm:px-2 py-2 text-[9px] sm:text-[10px] font-mono text-gray-300">
                              {pick.oddsSharkUrl ? (
                                <a
                                  href={pick.oddsSharkUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline decoration-dotted hover:text-orange-400 transition-colors"
                                  title="Open this matchup on OddsShark"
                                >
                                  {pick.team}
                                </a>
                              ) : (
                                pick.team
                              )}
                            </td>
                            <td className="px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-mono font-bold bg-orange-900/30 text-orange-400">
                              {pick.poolSpread > 0 ? '+' : ''}{pick.poolSpread.toFixed(1)}
                            </td>
                            <td className="px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-mono font-bold text-gray-200">
                              {pick.marketSpread > 0 ? '+' : ''}{pick.marketSpread.toFixed(1)}
                            </td>
                            <td className={`px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-mono font-bold ${pick.absDelta > 3 ? 'text-red-500' : pick.absDelta > 1 ? 'text-orange-700' : 'text-green-500'}`}>
                              {pick.delta > 0 ? '+' : ''}{pick.delta.toFixed(1)}
                            </td>
                            <td className={`px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-mono font-bold ${
                              pick.importanceLevel === 'very-high' ? 'text-red-500' :
                              pick.importanceLevel === 'high' ? 'text-orange-500' :
                              pick.importanceLevel === 'moderate' ? 'text-yellow-500' :
                              pick.importanceLevel === 'low' ? 'text-green-500' :
                              'text-gray-600'
                            }`}>
                              {(pick.marketDeltaProb ?? 0) > 0 ? `${(pick.marketDeltaProb * 100).toFixed(1)}%` : '-'}
                            </td>
                            <td className={`px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-mono font-bold ${Math.abs(pick.relPercent) > 15 ? 'text-red-400' : Math.abs(pick.relPercent) > 10 ? 'text-orange-400' : 'text-gray-400'}`}>
                              {pick.relPercent > 0 ? '+' : ''}{pick.relPercent.toFixed(1)}%
                            </td>
                            <td className="px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-mono font-bold text-purple-400">
                              {pick.eloSpread !== null ? `${pick.eloSpread > 0 ? '+' : ''}${pick.eloSpread.toFixed(1)}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-900 rounded border border-zinc-800 p-4 text-center">
                  <p className="text-xs font-mono text-gray-500">No NCAA games available</p>
                </div>
              )}
            </div>
          </div>
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
