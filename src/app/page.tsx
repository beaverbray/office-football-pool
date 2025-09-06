'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'

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
      gameTime?: string
    }>
  }
}

export default function Home() {
  const router = useRouter()
  const [currentPipeline, setCurrentPipeline] = useState<PipelineResult | null>(null)
  const [sortColumn, setSortColumn] = useState<'league' | 'date' | 'team' | 'poolSpread' | 'marketSpread' | 'delta' | 'relDelta' | 'flags'>('delta')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [showOnlyIssues, setShowOnlyIssues] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  
  // Filter states
  const [filters, setFilters] = useState({
    league: 'all' as 'all' | 'NFL' | 'NCAAF',
    dateFilter: 'all' as 'all' | 'today' | 'tomorrow' | 'week',
    poolSpreadMin: '',
    poolSpreadMax: '',
    marketSpreadMin: '',
    marketSpreadMax: '',
    deltaMin: '',
    deltaMax: ''
  })

  // Load data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('pipelineData')
    
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData)
        setCurrentPipeline(parsed)
        setDataLoaded(true)
      } catch (e) {
        console.error('Failed to load saved data:', e)
      }
    }
  }, [])

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
        
        // Copy to clipboard
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

  // Filter and sort comparisons
  const getFilteredComparisons = () => {
    if (!currentPipeline?.comparison?.comparisons) return []
    
    let filtered = [...currentPipeline.comparison.comparisons]
    
    // Apply filters
    filtered = filtered.filter(c => {
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
      
      // Pool spread range filter
      const poolSpread = -c.picksheetSpread
      if (filters.poolSpreadMin !== '' && poolSpread < parseFloat(filters.poolSpreadMin)) return false
      if (filters.poolSpreadMax !== '' && poolSpread > parseFloat(filters.poolSpreadMax)) return false
      
      // Market spread range filter
      const marketSpread = -c.marketSpread
      if (filters.marketSpreadMin !== '' && marketSpread < parseFloat(filters.marketSpreadMin)) return false
      if (filters.marketSpreadMax !== '' && marketSpread > parseFloat(filters.marketSpreadMax)) return false
      
      // Delta range filter
      const delta = Math.abs(c.spreadDelta)
      if (filters.deltaMin !== '' && delta < parseFloat(filters.deltaMin)) return false
      if (filters.deltaMax !== '' && delta > parseFloat(filters.deltaMax)) return false
      
      // Issues filter
      if (showOnlyIssues) {
        return Math.abs(c.spreadDelta) > 3 || c.crossesKeyNumber || c.favoriteFlipped
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

  // Helper function to determine if a game is in current week and future
  const isCurrentWeekFutureGame = (gameTime?: string) => {
    if (!gameTime) return false
    
    const now = new Date()
    const gameDate = new Date(gameTime)
    
    // Check if game is in the future
    if (gameDate <= now) return false
    
    // Determine current week boundaries
    // NFL week typically runs Tuesday to Monday
    // Find the most recent Tuesday
    const currentDay = now.getDay() // 0 = Sunday, 1 = Monday, etc.
    const daysSinceTuesday = (currentDay + 5) % 7 // Days since last Tuesday
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - daysSinceTuesday)
    weekStart.setHours(0, 0, 0, 0)
    
    // Week ends next Monday at 11:59 PM
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)
    
    // Check if game is within current week
    return gameDate >= weekStart && gameDate <= weekEnd
  }

  // Filter unmatched games to current week future games only
  const getFilteredUnmatchedGames = () => {
    if (!currentPipeline?.comparison?.unmatched) return []
    
    return currentPipeline.comparison.unmatched.filter(game => 
      isCurrentWeekFutureGame(game.gameTime)
    )
  }

  // If no data, redirect to control panel
  if (!dataLoaded && typeof window !== 'undefined') {
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
        onShare={handleShare}
        sharing={sharing}
        showShareButton={!!currentPipeline?.comparison?.comparisons}
      />
      <div className="max-w-7xl mx-auto px-4 py-2 sm:py-6">
        {/* KPI Metrics */}
        {currentPipeline?.comparison?.kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-2 sm:mb-6">
            <div className="bg-zinc-900 rounded border border-zinc-800 p-2 sm:p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-[9px] sm:text-[10px] font-mono text-gray-500">GAMES_REMAINING:</span>
                <span className="text-[11px] sm:text-xs font-mono font-bold text-orange-700">
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
              <div className="text-[10px] sm:text-xs font-mono text-gray-600 mt-1">
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

            <div className="bg-zinc-900 rounded border border-zinc-800 p-2 sm:p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-[9px] sm:text-[10px] font-mono text-gray-500">AVG_DELTA:</span>
                <span className={`text-[11px] sm:text-xs font-mono font-bold ${getRiskColor(currentPipeline.comparison.kpis.avgSpreadDelta)}`}>
                  {currentPipeline.comparison.kpis.avgSpreadDelta.toFixed(2)}
                </span>
              </div>
              <div className="text-[10px] sm:text-xs font-mono text-gray-600 mt-1">
                MEDIAN: {currentPipeline.comparison.kpis.medianSpreadDelta.toFixed(2)}
              </div>
            </div>

            <div className="bg-zinc-900 rounded border border-zinc-800 p-2 sm:p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-[9px] sm:text-[10px] font-mono text-gray-500">KEY_VIOLATIONS:</span>
                <span className="text-[11px] sm:text-xs font-mono font-bold text-orange-700">
                  {currentPipeline.comparison.kpis.keyNumberCrossings}
                </span>
              </div>
              <div className="text-[10px] sm:text-xs font-mono text-gray-600 mt-1">
                THRESHOLDS: [3,7,10,14]
              </div>
            </div>

            <div className="bg-zinc-900 rounded border border-zinc-800 p-2 sm:p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-[9px] sm:text-[10px] font-mono text-gray-500">FAV_FLIPS:</span>
                <span className="text-[11px] sm:text-xs font-mono font-bold text-purple-400">
                  {currentPipeline.comparison.kpis.favoriteFlips}
                </span>
              </div>
              <div className="text-[10px] sm:text-xs font-mono text-gray-600 mt-1">
                INVERSIONS_DETECTED
              </div>
            </div>
          </div>
        )}

        {/* Filter Controls */}
        {currentPipeline?.comparison?.comparisons && (
          <div className="bg-zinc-900 rounded border border-zinc-800 p-4 mb-4 relative">
            {/* Mobile Filter Toggle and Showing Count */}
            <div className="sm:hidden flex items-center justify-between gap-2 mb-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex-1 flex items-center justify-between px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-[10px] font-mono text-gray-300 hover:bg-zinc-800 transition-colors"
              >
                <span>FILTERS {showFilters ? '▼' : '►'}</span>
                <span className="text-gray-500">
                  {showOnlyIssues || filters.league !== 'all' || filters.dateFilter !== 'all' || 
                   filters.poolSpreadMin || filters.poolSpreadMax || filters.marketSpreadMin || 
                   filters.marketSpreadMax || filters.deltaMin || filters.deltaMax ? 
                   'ACTIVE' : 'OFF'}
                </span>
              </button>
              <div className="text-[10px] font-mono text-gray-500 whitespace-nowrap">
                {getFilteredComparisons().length}/{currentPipeline?.comparison?.comparisons?.length || 0}
              </div>
            </div>
            
            {/* Advanced Filters - Hidden on mobile when collapsed */}
            <div className={`${showFilters ? 'grid grid-cols-2 gap-3' : 'hidden'} sm:flex sm:flex-wrap sm:items-end sm:gap-2 mb-1 sm:mb-2`}>
              {/* Clear Filters Button - Far left */}
              <button
                onClick={() => {
                  setFilters({
                    league: 'all',
                    dateFilter: 'all',
                    poolSpreadMin: '',
                    poolSpreadMax: '',
                    marketSpreadMin: '',
                    marketSpreadMax: '',
                    deltaMin: '',
                    deltaMax: ''
                  })
                  setShowOnlyIssues(false)
                }}
                className="col-span-2 sm:col-span-1 px-3 py-1 text-xs font-mono bg-zinc-950 text-orange-600 border border-zinc-700 rounded hover:bg-zinc-800 hover:text-orange-500 transition-colors"
              >
                CLEAR
              </button>
              
              {/* Divider - Hidden on mobile */}
              <div className="hidden sm:block h-6 w-px bg-zinc-700"></div>
              
              {/* League Filter */}
              <div>
                <label className="block text-xs font-mono text-gray-500 mb-1">LEAGUE</label>
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
              
              {/* Date Filter - New */}
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
              
              {/* Pool Spread Range */}
              <div className="w-full sm:w-36 sm:ml-4">
                <label className="block text-xs font-mono text-gray-500 mb-1">POOL_SPREAD</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    placeholder="min"
                    value={filters.poolSpreadMin}
                    onChange={(e) => setFilters({...filters, poolSpreadMin: e.target.value})}
                    className="w-1/2 px-1 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="max"
                    value={filters.poolSpreadMax}
                    onChange={(e) => setFilters({...filters, poolSpreadMax: e.target.value})}
                    className="w-1/2 px-1 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                  />
                </div>
              </div>
              
              {/* Market Spread Range */}
              <div className="w-full sm:w-36 sm:ml-4">
                <label className="block text-xs font-mono text-gray-500 mb-1">MARKET_SPREAD</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    placeholder="min"
                    value={filters.marketSpreadMin}
                    onChange={(e) => setFilters({...filters, marketSpreadMin: e.target.value})}
                    className="w-1/2 px-1 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="max"
                    value={filters.marketSpreadMax}
                    onChange={(e) => setFilters({...filters, marketSpreadMax: e.target.value})}
                    className="w-1/2 px-1 py-1 bg-zinc-950 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                  />
                </div>
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
              
              {/* Spacer to push right-side items - Hidden on mobile */}
              <div className="hidden sm:flex-grow"></div>
              
              {/* Flagged Checkbox - moved to far right */}
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
                SHOWING: {getFilteredComparisons().length} / {currentPipeline?.comparison?.comparisons?.length || 0}
              </div>
            )}
            
            {/* Column Guide */}
            {showGuide && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-950 border border-zinc-700 rounded p-4 z-10 shadow-lg">
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
                  <div><span className="text-orange-700">LEAGUE:</span> <span className="text-gray-400">Competition type (NFL or NCAAF)</span></div>
                  <div><span className="text-orange-700">DATE:</span> <span className="text-gray-400">Game date and kickoff time (PST)</span></div>
                  <div><span className="text-orange-700">MATCH:</span> <span className="text-gray-400">Away team @ Home team</span></div>
                  <div><span className="text-orange-700">POOL:</span> <span className="text-gray-400">Away team spread from office pool</span></div>
                  <div><span className="text-orange-700">MARKET:</span> <span className="text-gray-400">Away team spread from betting market</span></div>
                  <div><span className="text-orange-700">DELTA:</span> <span className="text-gray-400">Difference between pool and market (absolute)</span></div>
                  <div><span className="text-orange-700">REL_%:</span> <span className="text-gray-400">Delta divided by pool spread</span></div>
                  <div><span className="text-orange-700">FLAG:</span> <span className="text-gray-400">K# = Key number crossed, FLP = Favorite flipped</span></div>
                  <div className="mt-3 pt-2 border-t border-zinc-800">
                    <div className="text-orange-600 mb-1">KEY_NUMBERS:</div>
                    <div className="text-gray-400">Important margins in football: 3, 7, 10, 14 points</div>
                  </div>
                  <div className="pt-2">
                    <div className="text-orange-600 mb-1">FLAGGED_FILTER:</div>
                    <div className="text-gray-400">Shows games with: Delta > 3, Key number crossed, or Favorite flipped</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Week Display and Guide Button Row */}
        {currentPipeline?.comparison?.comparisons && (
          <div className="flex justify-between items-center mb-2">
            {/* Game Week Display - Left */}
            <div className="text-xs font-mono text-gray-500">
              WEEK {(() => {
                // Calculate NFL week number
                const now = new Date()
                const seasonStart = new Date(now.getFullYear(), 8, 5) // September 5th as approximate season start
                if (now < seasonStart) {
                  // If before season start, use previous year
                  seasonStart.setFullYear(seasonStart.getFullYear() - 1)
                }
                const weeksSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
                return Math.min(Math.max(1, weeksSinceStart + 1), 18) // NFL regular season is 18 weeks
              })()}
            </div>
            
            {/* Info Guide Button - Right */}
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="px-2 py-1 text-xs font-mono text-orange-600 hover:text-orange-500 transition-colors"
            >
              {showGuide ? '✕ CLOSE' : 'ℹ GUIDE'}
            </button>
          </div>
        )}
        
        {/* Share URL Display */}
        {shareUrl && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-green-500">LINK_COPIED!</span>
            <button
              onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="px-3 py-1 text-xs font-mono bg-zinc-950 text-green-500 border border-green-600 rounded hover:bg-green-950 transition-colors"
            >
              COPY_AGAIN
            </button>
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
                      className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-sm font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
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
                      className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-sm font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
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
                      className="px-1 sm:px-2 py-1 sm:py-2 pr-1 text-left text-[10px] sm:text-sm font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span className="hidden sm:inline">MATCH</span>
                        <span className="sm:hidden">GAME</span>
                        {sortColumn === 'team' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('poolSpread')}
                      className="px-1 py-1 sm:py-2 text-center text-[10px] sm:text-sm font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
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
                      className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-sm font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
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
                      className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-sm font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
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
                      className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-sm font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
                    >
                      <div className="flex items-center justify-center gap-1">
                        REL_%
                        {sortColumn === 'relDelta' && (
                          <span className="text-orange-700">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                        )}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('flags')}
                      className="px-1 sm:px-2 py-1 sm:py-2 text-center text-[10px] sm:text-sm font-mono text-gray-500 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
                    >
                      <div className="flex items-center justify-center gap-1">
                        FLAG
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
                    
                    // Format date and time in PST
                    const dateStr = gameDate ? 
                      gameDate.toLocaleDateString('en-US', { 
                        timeZone: 'America/Los_Angeles',
                        month: '2-digit',
                        day: '2-digit'
                      }).replace(/\//g, '/') : 
                      'N/A'
                    
                    const timeStr = gameDate ? 
                      gameDate.toLocaleTimeString('en-US', { 
                        timeZone: 'America/Los_Angeles',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      }) : 
                      ''
                    
                    // Calculate relative delta (spread delta / pool spread)
                    const relDelta = comp.picksheetSpread !== 0 ? 
                      (comp.spreadDelta / Math.abs(comp.picksheetSpread)) * 100 : 0
                    
                    return (
                      <tr key={idx} className={`${idx % 2 === 0 ? 'bg-zinc-800/50' : 'bg-zinc-900/50'} hover:bg-zinc-700 transition-colors`}>
                        <td className="px-1 py-1 text-center">
                          <span className={`font-mono text-[8px] sm:text-xs ${comp.league === 'NFL' ? 'text-blue-400' : 'text-green-400'}`}>
                            {comp.league || 'N/A'}
                          </span>
                        </td>
                        <td className="px-1 py-1 text-center">
                          <div className="text-[8px] sm:text-xs font-mono text-gray-400">
                            <div>{dateStr}</div>
                            <div className="text-gray-600 text-[7px] sm:text-[10px]">{timeStr}</div>
                          </div>
                        </td>
                        <td className="px-1 sm:px-2 py-1 pr-1 min-w-[80px] sm:min-w-0">
                          <div className="text-[10px] sm:text-xs font-mono text-gray-300 truncate">{comp.awayTeam}</div>
                          <div className="text-[10px] sm:text-xs font-mono text-gray-500 truncate">@ {comp.homeTeam}</div>
                        </td>
                        <td className="px-1 py-1 text-center">
                          <span className="font-mono text-[10px] sm:text-sm text-gray-200">
                            {-comp.picksheetSpread > 0 ? '+' : ''}{-comp.picksheetSpread}
                          </span>
                        </td>
                        <td className="px-1 sm:px-2 py-1 sm:py-2 text-center">
                          <span className="font-mono text-[10px] sm:text-sm text-gray-200">
                            {-comp.marketSpread > 0 ? '+' : ''}{-comp.marketSpread}
                          </span>
                        </td>
                        <td className="px-1 sm:px-2 py-1 sm:py-2 text-center">
                          <span className={`font-mono text-[10px] sm:text-sm font-bold ${getRiskColor(comp.spreadDelta)}`}>
                            {comp.spreadDelta > 0 ? '+' : ''}{comp.spreadDelta.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-1 sm:px-2 py-1 sm:py-2 text-center">
                          <span className={`font-mono text-[10px] sm:text-sm ${Math.abs(relDelta) > 50 ? 'text-red-500 font-bold' : Math.abs(relDelta) > 25 ? 'text-orange-600' : 'text-gray-400'}`}>
                            {relDelta > 0 ? '+' : ''}{relDelta.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-1 sm:px-2 py-1 sm:py-2 text-center">
                          <div className="flex justify-center gap-0.5 sm:gap-1">
                            {comp.crossesKeyNumber && (
                              <span className="px-0.5 sm:px-1 py-0 sm:py-0.5 text-[8px] sm:text-xs font-mono bg-orange-950 text-orange-700 rounded">
                                K{comp.keyNumbersCrossed.join(',')}
                              </span>
                            )}
                            {comp.favoriteFlipped && (
                              <span className="px-0.5 sm:px-1 py-0 sm:py-0.5 text-[8px] sm:text-xs font-mono bg-purple-950 text-purple-400 rounded">
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
        {(() => {
          const filteredUnmatched = getFilteredUnmatchedGames()
          return filteredUnmatched.length > 0 && (
            <div className="mt-6 bg-zinc-900 rounded border border-zinc-800 p-4">
              <h3 className="text-sm font-mono text-orange-700 mb-3">UNMATCHED_ENTRIES (CURRENT_WEEK)</h3>
              <div className="space-y-2">
                {filteredUnmatched.map((game, idx) => (
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
          )
        })()}

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
        <div className="max-w-7xl mx-auto px-4 py-4">
          <p className="text-center text-xs font-mono text-gray-500">
            BEAVERBRAY | © 2025
          </p>
        </div>
      </footer>
    </div>
  )
}