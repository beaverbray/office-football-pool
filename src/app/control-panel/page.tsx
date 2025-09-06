'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'

export default function ControlPanel() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [picksheetText, setPicksheetText] = useState('')
  const [dataLoaded, setDataLoaded] = useState(false)

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
        // Save to localStorage
        localStorage.setItem('pipelineData', JSON.stringify(data.pipeline))
        localStorage.setItem('picksheetText', picksheetText)
        
        // Navigate to dashboard
        router.push('/')
      }
    } catch (error) {
      console.error('Pipeline error:', error)
      alert('Error processing data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Clear saved data
  const clearData = () => {
    localStorage.removeItem('pipelineData')
    localStorage.removeItem('picksheetText')
    setPicksheetText('')
    setDataLoaded(false)
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
          
          {!dataLoaded && (
            <div className="mt-6 p-4 bg-zinc-950 border border-zinc-800 rounded">
              <h3 className="text-xs font-mono text-orange-700 mb-2">PROCESSING_PIPELINE:</h3>
              <ol className="space-y-1 text-xs font-mono text-gray-500">
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