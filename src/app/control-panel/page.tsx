'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'

export default function ControlPanel() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [picksheetText, setPicksheetText] = useState('')
  const [dataLoaded, setDataLoaded] = useState(false)
  const [useWarrenNolan, setUseWarrenNolan] = useState(false)
  const [warrenNolanDate, setWarrenNolanDate] = useState(new Date().toISOString().split('T')[0])
  const [useNFELO, setUseNFELO] = useState(false)
  const [nfeloSeason, setNfeloSeason] = useState(new Date().getFullYear())
  const [nfeloWeek, setNfeloWeek] = useState(5)
  const [currentStep, setCurrentStep] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [scheduleInfo, setScheduleInfo] = useState<any>(null)

  // Scraping state
  const [scrapingNFELO, setScrapingNFELO] = useState(false)
  const [scrapingWarrenNolan, setScrapingWarrenNolan] = useState(false)
  const [nfeloStatus, setNfeloStatus] = useState<string>('')
  const [warrenNolanStatus, setWarrenNolanStatus] = useState<string>('')

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

  // Load schedule info on mount and when week changes
  useEffect(() => {
    fetch(`/api/schedule/check?week=${nfeloWeek}`)
      .then(res => res.json())
      .then(data => setScheduleInfo(data))
      .catch(err => console.error('Failed to load schedule info:', err))
  }, [nfeloWeek])

  // Run pipeline with prediction sources
  const runPipeline = async () => {
    if (!picksheetText.trim()) {
      alert('Please enter picksheet text')
      return
    }

    setLoading(true)
    setProgressPercent(0)

    try {
      // Calculate total steps (predictions + main pipeline)
      const predictionSteps = (useWarrenNolan ? 1 : 0) + (useNFELO ? 1 : 0)
      const pipelineSteps = 2 // main pipeline execution + completion
      const totalSteps = predictionSteps + pipelineSteps
      let currentStepNum = 0

      // Step 1: Fetch Warren Nolan predictions if enabled
      if (useWarrenNolan) {
        currentStepNum++
        setCurrentStep('Fetching Warren Nolan predictions...')
        setProgressPercent((currentStepNum / totalSteps) * 100)

        await fetch('/api/warren-nolan/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: warrenNolanDate,
            saveToDB: true
          })
        })
      }

      // Step 2: Fetch NFELO predictions if enabled
      if (useNFELO) {
        currentStepNum++
        setCurrentStep('Fetching NFELO predictions...')
        setProgressPercent((currentStepNum / totalSteps) * 100)

        await fetch('/api/nfelo/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            season: nfeloSeason,
            week: nfeloWeek,
            saveToDB: true
          })
        })
      }

      // Step 3: Start main pipeline (this includes parsing, odds, matching, comparison)
      currentStepNum++
      setCurrentStep('Parsing picksheet with AI...')
      setProgressPercent(Math.min((currentStepNum / totalSteps) * 70, 70)) // Cap at 70% to show it's in progress

      const response = await fetch('/api/pipeline/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          picksheetText,
          useOddsAPI: true,
          useLLM: true,
          includeLogs: false,
          week: nfeloWeek // Use the same week as NFELO for schedule context
        })
      })

      // After LLM parsing completes (inside the API)
      currentStepNum++
      setCurrentStep('Analyzing matches...')
      setProgressPercent(Math.min(((currentStepNum + 2) / totalSteps) * 100, 95)) // Show near completion

      const data = await response.json()
      if (data.pipeline) {
        setCurrentStep('Complete! Redirecting...')
        setProgressPercent(100)

        // Save to localStorage
        localStorage.setItem('pipelineData', JSON.stringify(data.pipeline))
        localStorage.setItem('picksheetText', picksheetText)

        // Small delay to show completion
        await new Promise(resolve => setTimeout(resolve, 500))

        // Navigate to dashboard
        router.push('/')
      }
    } catch (error) {
      console.error('Pipeline error:', error)
      alert('Error processing data. Please try again.')
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
  }

  // Scrape NFELO predictions
  const scrapeNFELO = async () => {
    setScrapingNFELO(true)
    setNfeloStatus('Scraping NFL predictions...')

    try {
      const response = await fetch('/api/nfelo/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season: nfeloSeason,
          week: nfeloWeek,
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

  // Scrape Warren Nolan predictions
  const scrapeWarrenNolan = async () => {
    setScrapingWarrenNolan(true)
    setWarrenNolanStatus('Scraping college football predictions...')

    try {
      const response = await fetch('/api/warren-nolan/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: warrenNolanDate,
          saveToDB: true // Warren Nolan API uses saveToDB not saveToDatabase
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
          
          {dataLoaded && (
            <div className="mb-4 p-3 bg-yellow-950 border border-yellow-700 rounded">
              <p className="text-xs font-mono text-yellow-400">
                ⚠️ DATA_EXISTS: Clear existing data to process new picksheet
              </p>
            </div>
          )}

          {/* Scrape Predictions Section */}
          <div className="mb-6 p-4 bg-zinc-950 border border-zinc-800 rounded">
            <h3 className="text-xs font-mono text-orange-700 mb-4">SCRAPE_PREDICTIONS_TO_DATABASE</h3>

            {/* NFELO Scraper */}
            <div className="mb-4 pb-4 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-mono text-gray-300">NFELO (NFL)</span>
                <div className="flex gap-4 items-center">
                  <div className="flex gap-2 items-center">
                    <label className="text-xs font-mono text-gray-500">Season:</label>
                    <input
                      type="number"
                      value={nfeloSeason}
                      onChange={(e) => setNfeloSeason(parseInt(e.target.value))}
                      className="w-20 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                      min="2020"
                      max="2030"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-xs font-mono text-gray-500">Week:</label>
                    <input
                      type="number"
                      value={nfeloWeek}
                      onChange={(e) => setNfeloWeek(parseInt(e.target.value))}
                      className="w-16 px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                      min="1"
                      max="18"
                    />
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

            {/* Warren Nolan Scraper */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-mono text-gray-300">Warren Nolan (NCAAF)</span>
                <div className="flex gap-4 items-center">
                  <div className="flex gap-2 items-center">
                    <label className="text-xs font-mono text-gray-500">Date:</label>
                    <input
                      type="date"
                      value={warrenNolanDate}
                      onChange={(e) => setWarrenNolanDate(e.target.value)}
                      className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                    />
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

          {/* Prediction Sources */}
          <div className="mb-6 p-4 bg-zinc-950 border border-zinc-800 rounded">
            <h3 className="text-xs font-mono text-orange-700 mb-4">PREDICTION_SOURCES (Optional)</h3>

            {/* Warren Nolan */}
            <div className="mb-4 pb-4 border-b border-zinc-800">
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useWarrenNolan}
                  onChange={(e) => setUseWarrenNolan(e.target.checked)}
                  disabled={dataLoaded}
                  className="w-4 h-4"
                />
                <span className="text-sm font-mono text-gray-300">Warren Nolan (College Football)</span>
              </label>
              {useWarrenNolan && (
                <div className="ml-6">
                  <label className="block text-xs font-mono text-gray-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={warrenNolanDate}
                    onChange={(e) => setWarrenNolanDate(e.target.value)}
                    disabled={dataLoaded}
                    className="px-3 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* NFELO */}
            <div>
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useNFELO}
                  onChange={(e) => setUseNFELO(e.target.checked)}
                  disabled={dataLoaded}
                  className="w-4 h-4"
                />
                <span className="text-sm font-mono text-gray-300">NFELO (NFL)</span>
              </label>
              {useNFELO && (
                <div className="ml-6 flex gap-4">
                  <div>
                    <label className="block text-xs font-mono text-gray-500 mb-1">Season</label>
                    <input
                      type="number"
                      value={nfeloSeason}
                      onChange={(e) => setNfeloSeason(parseInt(e.target.value))}
                      disabled={dataLoaded}
                      className="w-24 px-3 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                      min="2020"
                      max="2030"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-gray-500 mb-1">Week</label>
                    <input
                      type="number"
                      value={nfeloWeek}
                      onChange={(e) => setNfeloWeek(parseInt(e.target.value))}
                      disabled={dataLoaded}
                      className="w-20 px-3 py-1 bg-zinc-900 border border-zinc-700 rounded text-sm font-mono text-gray-300 focus:border-orange-700 focus:outline-none"
                      min="1"
                      max="18"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Schedule Info */}
          {scheduleInfo && (
            <div className="mb-6 p-4 bg-zinc-950 border border-zinc-800 rounded">
              <h3 className="text-xs font-mono text-orange-700 mb-3">SCHEDULE_STATUS</h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Games:</span>
                  <span className={scheduleInfo.totalGames > 0 ? 'text-green-500' : 'text-red-500'}>
                    {scheduleInfo.totalGames}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Available Weeks:</span>
                  <span className="text-gray-300">
                    {scheduleInfo.weeks?.length > 0 ? scheduleInfo.weeks.join(', ') : 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Leagues:</span>
                  <span className="text-gray-300">
                    {scheduleInfo.leagues?.join(', ') || 'None'}
                  </span>
                </div>
                {scheduleInfo.weekQuery && (
                  <div className="mt-3 pt-3 border-t border-zinc-800">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Week {scheduleInfo.weekQuery.week} Games:</span>
                      <span className={scheduleInfo.weekQuery.count > 0 ? 'text-green-500' : 'text-red-500'}>
                        {scheduleInfo.weekQuery.count}
                      </span>
                    </div>
                    {scheduleInfo.weekQuery.count === 0 && (
                      <p className="mt-2 text-xs text-yellow-500">
                        ⚠️ No schedule games found for week {scheduleInfo.weekQuery.week}.
                        LLM will parse without schedule context.
                      </p>
                    )}
                    {scheduleInfo.weekQuery.sampleGames?.length > 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        Sample: {scheduleInfo.weekQuery.sampleGames.slice(0, 2).map((g: any) =>
                          `${g.awayTeam} @ ${g.homeTeam}`
                        ).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

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
              placeholder="Dallas @ Philadelphia -3
Buffalo @ Miami +2.5
Green Bay @ Chicago -7
..."
              disabled={dataLoaded}
            />
            <div className="mt-2 text-xs font-mono text-gray-600">
              LINES_DETECTED: {picksheetText.split('\n').filter(line => line.trim()).length}
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-gray-500">
              STATUS: {dataLoaded ? 'DATA_LOCKED' : 'READY_FOR_INPUT'}
            </div>

            <button
              onClick={runPipeline}
              disabled={loading || dataLoaded || !picksheetText.trim()}
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
            <div className="mt-6 p-4 bg-zinc-950 border border-zinc-800 rounded">
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
          
          {!dataLoaded && (
            <div className="mt-6 p-4 bg-zinc-950 border border-zinc-800 rounded">
              <h3 className="text-xs font-mono text-orange-700 mb-2">PROCESSING_PIPELINE:</h3>
              <ol className="space-y-1 text-xs font-mono text-gray-500">
                {useWarrenNolan && <li className="text-orange-600">0a. FETCH_WARREN_NOLAN_PREDICTIONS</li>}
                {useNFELO && <li className="text-orange-600">0b. FETCH_NFELO_PREDICTIONS</li>}
                <li>1. PARSE_PICKSHEET_DATA</li>
                <li>2. FETCH_MARKET_ODDS_API</li>
                <li>3. ENTITY_RECOGNITION_LLM</li>
                <li>4. COMPARISON_ENGINE_ANALYSIS</li>
                <li>5. GENERATE_KPI_METRICS</li>
                <li>6. STORE_RESULTS_CACHE</li>
              </ol>
            </div>
          )}
        </div>
        
        <div className="mt-6 text-center">
          <p className="text-xs font-mono text-gray-600">
            SYSTEM_MODE: {dataLoaded ? 'VIEW_ONLY' : 'INPUT_READY'} | 
            CACHE: {dataLoaded ? 'ACTIVE' : 'EMPTY'} | 
            ENVIRONMENT: PRODUCTION
          </p>
        </div>
      </div>
    </div>
  )
}