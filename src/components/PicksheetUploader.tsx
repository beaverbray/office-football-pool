'use client'

import { useState } from 'react'

interface ParsedRow {
  id: string
  league: string | null
  event_date_local: string | null
  event_time_local: string | null
  home_name_raw: string
  away_name_raw: string
  home_spread_raw: number | null
  away_spread_raw: number | null
  total_raw: number | null
}

export default function PicksheetUploader() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ParsedRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/parse-picksheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      })

      const data = await response.json()
      
      if (!response.ok) {
        const errorMessage = data.details || data.error || 'Failed to parse picksheet'
        throw new Error(errorMessage)
      }
      
      setResults(data.rows || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setText(event.target?.result as string)
      }
      reader.readAsText(file)
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
    <div className="max-w-6xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Picksheet Parser</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Paste Picksheet Text
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full h-64 p-3 border rounded-lg font-mono text-sm"
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

              <label className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 cursor-pointer">
                Upload File
                <input
                  type="file"
                  accept=".txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded-lg">
                {error}
              </div>
            )}
          </form>
        </div>

        {/* Results Section */}
        <div>
          <h3 className="text-lg font-medium mb-2">Parsed Results</h3>
          
          {results.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">League</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Away Team</th>
                      <th className="px-3 py-2 text-left">Home Team</th>
                      <th className="px-3 py-2 text-center">Spread</th>
                      <th className="px-3 py-2 text-center">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {results.map((row, idx) => (
                      <tr key={row.id || idx} className="hover:bg-gray-50">
                        <td className="px-3 py-2">{row.league || '-'}</td>
                        <td className="px-3 py-2">{row.event_date_local || '-'}</td>
                        <td className="px-3 py-2">{row.away_name_raw}</td>
                        <td className="px-3 py-2">{row.home_name_raw}</td>
                        <td className="px-3 py-2 text-center">
                          {row.home_spread_raw !== null ? (
                            row.home_spread_raw > 0 ? `+${row.home_spread_raw}` : row.home_spread_raw
                          ) : '-'}
                        </td>
                        <td className="px-3 py-2 text-center">{row.total_raw || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="border rounded-lg p-8 text-center text-gray-500">
              No parsed results yet. Paste some picksheet text and click "Parse Text".
            </div>
          )}
        </div>
      </div>
    </div>
  )
}