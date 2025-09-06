'use client'

import { useState } from 'react'

interface DisplayRow {
  league: string
  awayTeam: string
  awaySpread: number
  homeTeam: string
  homeSpread: number
  overUnder?: number | null
  gameTime: string | null
}

export default function LLMParserTest() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<DisplayRow[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSummary(null)
    
    try {
      const response = await fetch('/api/parse-llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse picksheet')
      }
      
      setResults(data.displayRows || [])
      setSummary(data.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const sampleText = `BOBBYSALEM COLLEGE/NFL PICK'EM (#185721)
NFL Week 1 | College 2 Picksheet
Make 20 picks from the following picksheet.

 1 pt     Dallas (7-10) +7.5    Thu 5:20 PM    PHILADELPHIA (18-3) -7.5
 1 pt     James Madison (1-0) +14.5    Fri 4:00 PM    LOUISVILLE (1-0) -14.5
 1 pt     Northern Ill (1-0) +17.5    Fri 4:30 PM    MARYLAND (1-0) -17.5
 1 pt     Kansas City (17-3) -3.5    Fri 5:00 PM    LA CHARGERS (11-7) +3.5
 1 pt     Kent State (1-0) +48.5    Sat 9:00 AM    #24 TEXAS TECH (1-0) -48.5
 1 pt     FIU (1-0) +41.5    Sat 9:00 AM    #2 PENN ST. (1-0) -41.5
 1 pt     Baylor (0-1) +2.5    Sat 9:00 AM    #17 SMU (1-0) -2.5
 1 pt     #11 Illinois (1-0) -2.5    Sat 9:00 AM    DUKE (1-0) +2.5
 1 pt     Iowa (1-0) +3.5    Sat 9:00 AM    #16 IOWA ST. (2-0) -3.5
 1 pt     Tampa Bay (10-8) -2.5    Sun 10:00 AM    ATLANTA (8-9) +2.5
 1 pt     Pittsburgh (10-8) -2.5    Sun 10:00 AM    NY JETS (5-12) +2.5
 1 pt     Miami (8-9) +0.5    Sun 10:00 AM    INDIANAPOLIS (8-9) -0.5
 1 pt     Detroit (15-3) +2.5    Sun 1:25 PM    GREEN BAY (11-7) -2.5
 1 pt     Baltimore (13-6) +0.5    Sun 5:20 PM    BUFFALO (15-5) -0.5
 1 pt     Minnesota (14-4) -1.5    Mon 5:15 PM    CHICAGO (5-12) +1.5`

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">
            🤖 AI-Powered Picksheet Parser
          </h1>
          <p className="text-gray-600">
            Using OpenAI GPT-4 for intelligent parsing with structured output
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Section */}
          <div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Paste Your Picksheet Text
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="w-full h-96 p-3 border rounded-lg font-mono text-xs"
                  placeholder="Paste your picksheet text here..."
                />
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading || !text}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300"
                >
                  {loading ? '🔄 Parsing with AI...' : '🚀 Parse with AI'}
                </button>

                <button
                  type="button"
                  onClick={() => setText(sampleText)}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  Load Sample
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setText('')
                    setResults([])
                    setError(null)
                    setSummary(null)
                  }}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  Clear
                </button>
              </div>

              {error && (
                <div className="p-3 bg-red-100 text-red-700 rounded-lg">
                  ❌ {error}
                </div>
              )}
            </form>

            {/* Summary Section */}
            {summary && (
              <div className="mt-6 p-4 bg-green-100 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-2">✅ Parse Summary</h3>
                <div className="text-sm text-green-700 space-y-1">
                  {summary.title && <p>Title: {summary.title}</p>}
                  {summary.week && <p>Week: {summary.week}</p>}
                  <p>Total Games: {summary.total}</p>
                  <p>NFL Games: {summary.nfl}</p>
                  <p>NCAAF Games: {summary.ncaaf}</p>
                </div>
              </div>
            )}
          </div>

          {/* Results Section */}
          <div>
            <h3 className="text-lg font-medium mb-2">
              Parsed Results {results.length > 0 && `(${results.length} games)`}
            </h3>
            
            {loading ? (
              <div className="border rounded-lg p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">AI is analyzing your picksheet...</p>
              </div>
            ) : results.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">#</th>
                        <th className="px-2 py-1 text-left">League</th>
                        <th className="px-2 py-1 text-left">Away Team</th>
                        <th className="px-2 py-1 text-center">Spread</th>
                        <th className="px-2 py-1 text-left">Home Team</th>
                        <th className="px-2 py-1 text-center">Spread</th>
                        <th className="px-2 py-1 text-center">O/U</th>
                        <th className="px-2 py-1 text-left">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {results.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-2 py-1">{idx + 1}</td>
                          <td className="px-2 py-1">
                            <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                              row.league === 'NFL' 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {row.league}
                            </span>
                          </td>
                          <td className="px-2 py-1">{row.awayTeam}</td>
                          <td className="px-2 py-1 text-center font-mono">
                            {row.awaySpread > 0 ? `+${row.awaySpread}` : row.awaySpread}
                          </td>
                          <td className="px-2 py-1 font-semibold">{row.homeTeam}</td>
                          <td className="px-2 py-1 text-center font-mono">
                            {row.homeSpread > 0 ? `+${row.homeSpread}` : row.homeSpread}
                          </td>
                          <td className="px-2 py-1 text-center font-mono text-gray-600">
                            {row.overUnder || '-'}
                          </td>
                          <td className="px-2 py-1 text-xs text-gray-600">
                            {row.gameTime || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center text-gray-500">
                <p className="mb-2">No parsed results yet.</p>
                <p className="text-sm">Paste picksheet text and click "Parse with AI"</p>
              </div>
            )}

            {/* Features List */}
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">🎯 AI Parser Features</h4>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>✅ Accurate home/away detection (@, vs, CAPS)</li>
                <li>✅ Proper spread assignment to teams</li>
                <li>✅ Over/Under total extraction (O/U)</li>
                <li>✅ League detection (NFL vs NCAAF)</li>
                <li>✅ Handles rankings (#11) and records (7-10)</li>
                <li>✅ Date and time extraction</li>
                <li>✅ PK/PICK spread handling</li>
                <li>✅ GPT-4o-mini with zero temperature</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}