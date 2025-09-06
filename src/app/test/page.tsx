'use client'

import { useState } from 'react'

interface ParsedRow {
  id?: string
  league?: string | null
  eventDate?: Date | null
  eventTime?: string | null
  homeTeamRaw: string
  awayTeamRaw: string
  homeSpread?: number | null
  awaySpread?: number | null
  total?: number | null
  rawText: string
}

export default function TestParser() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ParsedRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)
    
    try {
      const response = await fetch('/api/test-parse', {
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
      
      setResults(data.rows || [])
      setMessage(data.message || `Successfully parsed ${data.parsedCount} games`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const sampleText = `BOBBYSALEM COLLEGE/NFL PICK'EM (#185721)
NFL Week 1 | College 2 Picksheet

 1 pt     Dallas (7-10) +7.5    Thu 5:20 PM    PHILADELPHIA (18-3) -7.5
 1 pt     Kansas City (17-3) -3.5    Fri 5:00 PM    LA CHARGERS (11-7) +3.5
 1 pt     Tampa Bay (10-8) -2.5    Sun 10:00 AM    ATLANTA (8-9) +2.5
 1 pt     Pittsburgh (10-8) -2.5    Sun 10:00 AM    NY JETS (5-12) +2.5
 1 pt     Miami (8-9) +0.5    Sun 10:00 AM    INDIANAPOLIS (8-9) -0.5
 1 pt     Detroit (15-3) +2.5    Sun 1:25 PM    GREEN BAY (11-7) -2.5
 1 pt     Baltimore (13-6) +0.5    Sun 5:20 PM    BUFFALO (15-5) -0.5

NCAAF Games:
 1 pt     #11 Illinois (1-0) -2.5    Sat 9:00 AM    DUKE (1-0) +2.5
 1 pt     #20 Mississippi (1-0) -9.5    Sat 12:30 PM    KENTUCKY (1-0) +9.5
 1 pt     #15 Michigan (1-0) +5.5    Sat 4:30 PM    #18 OKLAHOMA (1-0) -5.5`

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-2">
          Picksheet Parser Test (No Database)
        </h1>
        <p className="text-center text-gray-600 mb-8">
          This test version parses picksheets without saving to database
        </p>
        
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
                  {loading ? 'Parsing...' : 'Parse Text'}
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
                    setMessage(null)
                  }}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  Clear
                </button>
              </div>

              {message && (
                <div className="p-3 bg-green-100 text-green-700 rounded-lg">
                  {message}
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-100 text-red-700 rounded-lg">
                  {error}
                </div>
              )}
            </form>
          </div>

          {/* Results Section */}
          <div>
            <h3 className="text-lg font-medium mb-2">
              Parsed Results ({results.length} games)
            </h3>
            
            {results.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">#</th>
                        <th className="px-2 py-1 text-left">League</th>
                        <th className="px-2 py-1 text-left">Away Team</th>
                        <th className="px-2 py-1 text-center">Away Spread</th>
                        <th className="px-2 py-1 text-left">Home Team</th>
                        <th className="px-2 py-1 text-center">Home Spread</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {results.map((row, idx) => (
                        <tr key={row.id || idx} className="hover:bg-gray-50">
                          <td className="px-2 py-1">{idx + 1}</td>
                          <td className="px-2 py-1">{row.league || 'N/A'}</td>
                          <td className="px-2 py-1">{row.awayTeamRaw}</td>
                          <td className="px-2 py-1 text-center font-mono">
                            {row.awaySpread !== null && row.awaySpread !== undefined ? (
                              row.awaySpread > 0 ? `+${row.awaySpread}` : row.awaySpread
                            ) : '-'}
                          </td>
                          <td className="px-2 py-1 font-semibold">{row.homeTeamRaw}</td>
                          <td className="px-2 py-1 text-center font-mono">
                            {row.homeSpread !== null && row.homeSpread !== undefined ? (
                              row.homeSpread > 0 ? `+${row.homeSpread}` : row.homeSpread
                            ) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center text-gray-500">
                No parsed results yet. Paste picksheet text and click "Parse Text".
              </div>
            )}

            {results.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <h4 className="font-semibold text-sm mb-2">Summary:</h4>
                <div className="text-xs space-y-1">
                  <p>NFL Games: {results.filter(r => r.league === 'NFL').length}</p>
                  <p>NCAAF Games: {results.filter(r => r.league === 'NCAAF').length}</p>
                  <p>Unknown League: {results.filter(r => !r.league).length}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}