'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { OpeningLineEnricher } from '@/utils/opening-line-enricher'

interface WeekInfo {
  week: number
  seasonYear: number
  formatted: string
}

interface AutoDetectedInfo {
  nfl: WeekInfo
  ncaaf: WeekInfo
  currentDate: string
}

export default function ControlPanel() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [picksheetText, setPicksheetText] = useState('')
  const [dataLoaded, setDataLoaded] = useState(false)
  const [currentStep, setCurrentStep] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)

  // Auto-detection state
  const [weekInfo, setWeekInfo] = useState<AutoDetectedInfo | null>(null)
  const [detectedLeagues, setDetectedLeagues] = useState<{ hasNFL: boolean; hasNCAAF: boolean } | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Advanced scraping state (for manual testing)
  const [scrapingNFELO, setScrapingNFELO] = useState(false)
  const [scrapingWarrenNolan, setScrapingWarrenNolan] = useState(false)
  const [nfeloStatus, setNfeloStatus] = useState<string>('')
  const [warrenNolanStatus, setWarrenNolanStatus] = useState<string>('')

  // Auto-detect current week on mount
  useEffect(() => {
    fetch('/api/week')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setWeekInfo({
            nfl: data.nfl,
            ncaaf: data.ncaaf,
            currentDate: data.currentDate
          })
        }
      })
      .catch(err => console.error('Failed to auto-detect week:', err))
  }, [])

  // Check if data already exists
  useEffect(() => {
    const savedData = localStorage.getItem('pipelineData')
    const savedPicksheet = localStorage.getItem('picksheetText')

    if (savedData) {
      setDataLoaded(true)
    }

    if (savedPicksheet) {
      setPicksheetText(savedPicksheet)
    }
  }, [])

  // Poll job status
  const pollJobStatus = async (jobId: string): Promise<any> => {
    const maxAttempts = 180 // 3 minutes max (180 * 1 second)
    let attempts = 0

    while (attempts < maxAttempts) {
      const statusResponse = await fetch(`/api/pipeline/status?jobId=${jobId}`)
      const statusData = await statusResponse.json()

      if (!statusResponse.ok) {
        throw new Error(statusData.error || 'Failed to check job status')
      }

      // Update progress based on job status
      setProgressPercent(statusData.progress)
      setCurrentStep(statusData.stage.replace(/_/g, ' '))

      if (statusData.status === 'completed') {
        return statusData.result
      }

      if (statusData.status === 'failed') {
        throw new Error(statusData.error || 'Pipeline execution failed')
      }

      // Wait 1 second before polling again
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }

    throw new Error('Pipeline execution timed out')
  }

  // Run pipeline with automatic prediction fetching
  const runPipeline = async () => {
    if (!picksheetText.trim()) {
      alert('Please enter picksheet text')
      return
    }

    if (!weekInfo) {
      alert('Week detection failed. Please try again.')
      return
    }

    setLoading(true)
    setProgressPercent(0)
    setDetectedLeagues(null)

    try {
      // Step 1: Start async pipeline
      setCurrentStep('Starting pipeline...')
      setProgressPercent(5)

      const parseResponse = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          picksheetText,
          useOddsAPI: true,
          useLLM: true,
          includeLogs: false,
          week: weekInfo.nfl.week, // Use auto-detected week for schedule context
          async: true // Enable async mode
        })
      })

      const jobData = await parseResponse.json()

      if (!parseResponse.ok || !jobData.jobId) {
        throw new Error(jobData.error || 'Failed to start pipeline')
      }

      // Poll for job completion
      setCurrentStep('Processing...')
      const parseData = { pipeline: await pollJobStatus(jobData.jobId) }

      if (!parseData.pipeline) {
        throw new Error('Failed to parse picksheet')
      }

      // Detect which leagues are present
      const nflGames = parseData.pipeline.parsing?.totalGames ?
        (parseData.pipeline.parsing.nflGames || 0) : 0
      const ncaafGames = parseData.pipeline.parsing?.totalGames ?
        (parseData.pipeline.parsing.ncaafGames || 0) : 0

      const hasNFL = nflGames > 0
      const hasNCAAF = ncaafGames > 0

      setDetectedLeagues({ hasNFL, hasNCAAF })

      setCurrentStep(`Detected ${nflGames} NFL games, ${ncaafGames} NCAAF games`)
      setProgressPercent(30)

      // Step 2: Auto-fetch predictions based on detected leagues
      const predictionPromises: Promise<any>[] = []

      if (hasNFL) {
        setCurrentStep(`Fetching NFELO predictions for Week ${weekInfo.nfl.week}...`)
        predictionPromises.push(
          fetch('/api/nfelo/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              season: weekInfo.nfl.seasonYear,
              week: weekInfo.nfl.week,
              saveToDB: true
            })
          })
        )
      }

      if (hasNCAAF) {
        setCurrentStep(`Fetching Warren Nolan predictions for Week ${weekInfo.ncaaf.week}...`)
        predictionPromises.push(
          fetch('/api/warren-nolan/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              week: weekInfo.ncaaf.week,
              season: weekInfo.ncaaf.seasonYear,
              saveToDB: true
            })
          })
        )
      }

      // Wait for all prediction fetches
      if (predictionPromises.length > 0) {
        await Promise.all(predictionPromises)
        setProgressPercent(60)
      }

      // Step 3: Complete pipeline processing
      setCurrentStep('Finalizing analysis...')
      setProgressPercent(90)

      // Save to localStorage (as fallback)
      localStorage.setItem('pipelineData', JSON.stringify(parseData.pipeline))
      localStorage.setItem('picksheetText', picksheetText)

      // Record opening lines from this fresh data
      if (parseData.pipeline.comparison?.comparisons) {
        const result = OpeningLineEnricher.recordOpeningLinesFromComparisons(parseData.pipeline.comparison.comparisons)
        console.log(`Opening lines: ${result.recorded} recorded, ${result.skipped} skipped`)
      }

      // Save to database for public access
      try {
        const saveResponse = await fetch('/api/pipeline/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline: parseData.pipeline,
            picksheetText: picksheetText
          })
        })

        const saveResult = await saveResponse.json()

        if (!saveResponse.ok) {
          console.error('Failed to save to database:', saveResult)
          throw new Error(saveResult.message || 'Database save failed')
        } else {
          console.log('Pipeline saved to database successfully:', saveResult)
        }
      } catch (dbError) {
        console.error('Database save error:', dbError)
        // Show error to user but don't block the workflow
        alert(`Warning: Failed to save to database. Share links may not work.\n\nError: ${dbError instanceof Error ? dbError.message : 'Unknown error'}\n\nData is saved locally and the dashboard will still work.`)
      }

      setCurrentStep('Complete! Redirecting...')
      setProgressPercent(100)

      // Small delay to show completion
      await new Promise(resolve => setTimeout(resolve, 500))

      // Navigate to dashboard
      router.push('/')
    } catch (error) {
      console.error('Pipeline error:', error)
      alert(`Error processing data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
      setCurrentStep('')
      setProgressPercent(0)
    }
  }

  // Clear saved data
  const clearData = () => {
    localStorage.removeItem('pipelineData')
    localStorage.removeItem('picksheetText')
    setPicksheetText('')
    setDataLoaded(false)
    setDetectedLeagues(null)
  }

  // Manual scrape functions (advanced options)
  const scrapeNFELO = async () => {
    if (!weekInfo) return

    setScrapingNFELO(true)
    setNfeloStatus('Scraping NFL predictions...')

    try {
      const response = await fetch('/api/nfelo/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season: weekInfo.nfl.seasonYear,
          week: weekInfo.nfl.week,
          saveToDatabase: true
        })
      })

      const data = await response.json()

      if (data.success) {
        setNfeloStatus(`✓ Scraped ${data.predictions.length} NFL predictions (Week ${data.week})`)
      } else {
        setNfeloStatus(`✗ Failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('NFELO scrape error:', error)
      setNfeloStatus(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setScrapingNFELO(false)
    }
  }

  const scrapeWarrenNolan = async () => {
    if (!weekInfo) return

    setScrapingWarrenNolan(true)
    setWarrenNolanStatus('Scraping college football predictions...')

    try {
      const response = await fetch('/api/warren-nolan/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          week: weekInfo.ncaaf.week,
          season: weekInfo.ncaaf.seasonYear,
          saveToDB: true
        })
      })

      const data = await response.json()

      if (data.success) {
        const savedInfo = data.savedToDb ? ` (${data.dbRecordsCount} saved to DB)` : ''
        setWarrenNolanStatus(`✓ Scraped ${data.predictions.length} NCAAF predictions${savedInfo}`)
      } else {
        setWarrenNolanStatus(`✗ Failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Warren Nolan scrape error:', error)
      setWarrenNolanStatus(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setScrapingWarrenNolan(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-gray-100">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-lg font-mono text-orange-700">PICKSHEET_INPUT_CONTROL</h2>
            {dataLoaded && (
              <div className="flex gap-2">
                <button
                  onClick={() => router.push('/')}
                  className="px-4 py-2 text-xs font-mono bg-zinc-950 text-green-500 border border-green-600 rounded hover:bg-green-950 transition-colors"
                >
                  VIEW_CURRENT_DATA
                </button>
                <button
                  onClick={clearData}
                  className="px-4 py-2 text-xs font-mono bg-zinc-950 text-orange-700 border border-orange-800 rounded hover:bg-orange-950 transition-colors"
                >
                  CLEAR_DATA
                </button>
              </div>
            )}
          </div>

          {/* Auto-detected week info */}
          {weekInfo && (
            <div className="mb-6 p-4 bg-zinc-950 border border-green-900 rounded">
              <h3 className="text-xs font-mono text-green-600 mb-3">📅 AUTO-DETECTED WEEK</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <span className="text-gray-500">NFL:</span>
                  <span className="ml-2 text-green-400">Week {weekInfo.nfl.week} ({weekInfo.nfl.seasonYear})</span>
                </div>
                <div>
                  <span className="text-gray-500">NCAAF:</span>
                  <span className="ml-2 text-green-400">Week {weekInfo.ncaaf.week} ({weekInfo.ncaaf.seasonYear})</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                ⚡ Predictions will be automatically fetched based on detected leagues
              </p>
            </div>
          )}

          {/* Data locked warning */}
          {dataLoaded && (
            <div className="mb-4 p-3 bg-yellow-950 border border-yellow-700 rounded">
              <p className="text-xs font-mono text-yellow-400">
                ⚠️ DATA_EXISTS: Clear existing data to process new picksheet
              </p>
            </div>
          )}

          {/* Detected leagues (after processing) */}
          {detectedLeagues && (
            <div className="mb-6 p-4 bg-blue-950 border border-blue-800 rounded">
              <h3 className="text-xs font-mono text-blue-400 mb-3">✓ DETECTED LEAGUES</h3>
              <div className="space-y-2 text-xs font-mono">
                {detectedLeagues.hasNFL && (
                  <div className="text-green-400">
                    ✓ NFL games detected → NFELO predictions fetched (Week {weekInfo?.nfl.week})
                  </div>
                )}
                {detectedLeagues.hasNCAAF && (
                  <div className="text-green-400">
                    ✓ NCAAF games detected → Warren Nolan predictions fetched
                  </div>
                )}
                {!detectedLeagues.hasNFL && !detectedLeagues.hasNCAAF && (
                  <div className="text-yellow-400">
                    ⚠️ No games detected - please check picksheet format
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Picksheet input */}
          <div className="mb-6">
            <label className="block text-xs font-mono text-gray-400 mb-2">
              INPUT: PICKSHEET_DATA
            </label>
            <div className="mb-2 text-xs font-mono text-gray-500">
              FORMAT: [AWAY_TEAM] @ [HOME_TEAM] [SPREAD]
            </div>
            <textarea
              value={picksheetText}
              onChange={(e) => setPicksheetText(e.target.value)}
              className="w-full h-64 p-4 bg-zinc-950 border border-zinc-700 rounded text-sm font-mono text-gray-300 focus:border-orange-700 focus:outline-none placeholder-zinc-600"
              placeholder="1 pt San Francisco (4-1) +5.5 Thu 5:15 PM LA RAMS (3-2) -5.5
1 pt Minnesota (2-2) -3.5 Sun 6:30 AM CLEVELAND (1-3) +3.5
..."
              disabled={dataLoaded}
            />
            <div className="mt-2 text-xs font-mono text-gray-600">
              LINES_DETECTED: {picksheetText.split('\n').filter(line => line.trim()).length}
            </div>
          </div>

          {/* Execute button */}
          <div className="flex items-center justify-between mb-6">
            <div className="text-xs font-mono text-gray-500">
              STATUS: {dataLoaded ? 'DATA_LOCKED' : 'READY_FOR_INPUT'}
            </div>

            <button
              onClick={runPipeline}
              disabled={loading || dataLoaded || !picksheetText.trim() || !weekInfo}
              className="px-6 py-3 bg-orange-700 text-black font-mono text-sm font-bold rounded hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center">
                  <span className="animate-pulse mr-2">●</span>
                  PROCESSING...
                </span>
              ) : dataLoaded ? 'DATA_LOCKED' : 'EXECUTE_ANALYSIS'}
            </button>
          </div>

          {/* Progress Bar */}
          {loading && (
            <div className="mb-6 p-4 bg-zinc-950 border border-zinc-800 rounded">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-mono text-orange-600">{currentStep}</span>
                <span className="text-xs font-mono text-gray-500">{Math.round(progressPercent)}%</span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-orange-700 h-2.5 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Processing pipeline info */}
          {!dataLoaded && (
            <div className="mb-6 p-4 bg-zinc-950 border border-zinc-800 rounded">
              <h3 className="text-xs font-mono text-orange-700 mb-2">AUTOMATIC_PROCESSING_PIPELINE:</h3>
              <ol className="space-y-1 text-xs font-mono text-gray-500">
                <li>1. PARSE_PICKSHEET_DATA → DETECT_LEAGUES</li>
                <li>2. AUTO_FETCH_PREDICTIONS (NFL: NFELO, NCAAF: Warren Nolan)</li>
                <li>3. FETCH_MARKET_ODDS_API</li>
                <li>4. ENTITY_RECOGNITION_LLM</li>
                <li>5. COMPARISON_ENGINE_ANALYSIS</li>
                <li>6. GENERATE_KPI_METRICS</li>
                <li>7. STORE_RESULTS_DATABASE</li>
              </ol>
            </div>
          )}

          {/* Advanced Options (collapsible) */}
          <div className="mt-6 border-t border-zinc-800 pt-6">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-between text-xs font-mono text-gray-500 hover:text-gray-300 transition-colors"
            >
              <span>⚙️ ADVANCED_OPTIONS (Manual Prediction Scraping)</span>
              <span>{showAdvanced ? '▼' : '▶'}</span>
            </button>

            {showAdvanced && weekInfo && (
              <div className="mt-4 p-4 bg-zinc-950 border border-zinc-800 rounded">
                {/* NFELO Manual Scraper */}
                <div className="mb-4 pb-4 border-b border-zinc-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono text-gray-300">NFELO (NFL)</span>
                    <div className="flex gap-4 items-center">
                      <div className="text-xs font-mono text-gray-500">
                        Week {weekInfo.nfl.week}, {weekInfo.nfl.seasonYear}
                      </div>
                      <button
                        onClick={scrapeNFELO}
                        disabled={scrapingNFELO}
                        className="px-4 py-2 text-xs font-mono bg-blue-900 text-blue-200 border border-blue-700 rounded hover:bg-blue-800 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
                      >
                        {scrapingNFELO ? 'SCRAPING...' : 'SCRAPE_NFL'}
                      </button>
                    </div>
                  </div>
                  {nfeloStatus && (
                    <div className={`text-xs font-mono mt-2 ${nfeloStatus.startsWith('✓') ? 'text-green-500' : nfeloStatus.startsWith('✗') ? 'text-red-500' : 'text-gray-400'}`}>
                      {nfeloStatus}
                    </div>
                  )}
                </div>

                {/* Warren Nolan Manual Scraper */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono text-gray-300">Warren Nolan (NCAAF)</span>
                    <div className="flex gap-4 items-center">
                      <div className="text-xs font-mono text-gray-500">
                        Week {weekInfo.ncaaf.week}, All week games
                      </div>
                      <button
                        onClick={scrapeWarrenNolan}
                        disabled={scrapingWarrenNolan}
                        className="px-4 py-2 text-xs font-mono bg-green-900 text-green-200 border border-green-700 rounded hover:bg-green-800 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
                      >
                        {scrapingWarrenNolan ? 'SCRAPING...' : 'SCRAPE_NCAAF'}
                      </button>
                    </div>
                  </div>
                  {warrenNolanStatus && (
                    <div className={`text-xs font-mono mt-2 ${warrenNolanStatus.startsWith('✓') ? 'text-green-500' : warrenNolanStatus.startsWith('✗') ? 'text-red-500' : 'text-gray-400'}`}>
                      {warrenNolanStatus}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs font-mono text-gray-600">
            SYSTEM_MODE: {dataLoaded ? 'VIEW_ONLY' : 'AUTO_DETECT'} |
            CACHE: {dataLoaded ? 'ACTIVE' : 'EMPTY'} |
            WEEK_DETECTION: AUTOMATIC
          </p>
        </div>
      </div>
    </div>
  )
}
