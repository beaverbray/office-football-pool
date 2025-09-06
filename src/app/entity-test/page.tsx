'use client'

import { useState } from 'react'
import { EntityResolver } from '@/services/entity-resolution'

interface TeamMatch {
  originalName: string
  matchedName: string
  confidence: number
  league: 'NFL' | 'NCAAF'
  method: 'exact' | 'alias' | 'fuzzy' | 'llm'
  candidates?: Array<{ name: string; score: number }>
}

interface GameMatch {
  homeTeam: TeamMatch
  awayTeam: TeamMatch
  overallConfidence: number
  needsVerification: boolean
}

export default function EntityTestPage() {
  const [inputText, setInputText] = useState('')
  const [teamMatches, setTeamMatches] = useState<TeamMatch[]>([])
  const [gameMatches, setGameMatches] = useState<GameMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'teams' | 'games'>('teams')

  const sampleTeams = `Dallas
KC Chiefs
Philly
New England
Tampa
LA Chargers
#11 Alabama
Michigan State
Texas Tech
Penn St.`

  const sampleGames = `Dallas @ Philadelphia
Kansas City vs LA Chargers
Tampa Bay @ Atlanta
#11 Alabama vs Michigan State
Ohio St. @ Tennessee
Patriots vs Bills`

  const testMatching = async () => {
    setLoading(true)
    
    try {
      const lines = inputText.trim().split('\n').filter(line => line.trim())
      
      if (mode === 'teams') {
        // Parse teams
        const teams = lines.map(line => ({
          name: line.trim(),
          league: line.includes('#') || line.includes('State') || line.includes('University') ? 'NCAAF' as const : undefined
        }))
        
        const response = await fetch('/api/match-teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teams })
        })
        
        const data = await response.json()
        if (data.success) {
          setTeamMatches(data.matches)
          setGameMatches([])
        }
      } else {
        // Parse games
        const games = lines.map(line => {
          const parts = line.split(/[@vs]/i).map(s => s.trim())
          if (parts.length >= 2) {
            const isAtSymbol = line.includes('@')
            return {
              awayTeam: isAtSymbol ? parts[0] : parts[1],
              homeTeam: isAtSymbol ? parts[1] : parts[0],
              league: undefined
            }
          }
          return null
        }).filter(Boolean)
        
        const response = await fetch('/api/match-teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ games })
        })
        
        const data = await response.json()
        if (data.success) {
          setGameMatches(data.matches)
          setTeamMatches([])
        }
      }
    } catch (error) {
      console.error('Error testing matches:', error)
    } finally {
      setLoading(false)
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600'
    if (confidence >= 0.6) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getMethodBadge = (method: string) => {
    const colors = {
      exact: 'bg-green-100 text-green-800',
      alias: 'bg-blue-100 text-blue-800',
      fuzzy: 'bg-yellow-100 text-yellow-800',
      llm: 'bg-purple-100 text-purple-800'
    }
    return colors[method as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🎯 Entity Resolution Test
          </h1>
          <p className="text-gray-600">
            Test team name matching and resolution for picksheets
          </p>
        </div>

        {/* Input Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="mb-4">
            <div className="flex gap-4 mb-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="teams"
                  checked={mode === 'teams'}
                  onChange={(e) => setMode(e.target.value as 'teams')}
                  className="mr-2"
                />
                <span>Match Teams</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="games"
                  checked={mode === 'games'}
                  onChange={(e) => setMode(e.target.value as 'games')}
                  className="mr-2"
                />
                <span>Match Games</span>
              </label>
            </div>
            
            <label className="block text-sm font-medium mb-2">
              Enter {mode === 'teams' ? 'team names (one per line)' : 'games (format: Away @ Home or Home vs Away)'}
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full h-48 p-3 border rounded-lg font-mono text-sm"
              placeholder={mode === 'teams' ? 'Enter team names...' : 'Enter games...'}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={testMatching}
              disabled={loading || !inputText}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Matching...' : 'Test Matching'}
            </button>
            <button
              onClick={() => setInputText(mode === 'teams' ? sampleTeams : sampleGames)}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Load Sample
            </button>
            <button
              onClick={() => {
                setInputText('')
                setTeamMatches([])
                setGameMatches([])
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Results for Teams */}
        {teamMatches.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Team Matches</h2>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Original</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Matched</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">League</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Candidates</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {teamMatches.map((match, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm">{match.originalName}</td>
                        <td className="px-4 py-2 text-sm font-medium">{match.matchedName}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 text-xs rounded ${
                            match.league === 'NFL' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {match.league}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 text-xs rounded ${getMethodBadge(match.method)}`}>
                            {match.method}
                          </span>
                        </td>
                        <td className={`px-4 py-2 text-sm font-mono ${getConfidenceColor(match.confidence)}`}>
                          {(match.confidence * 100).toFixed(0)}%
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-600">
                          {match.candidates?.map(c => `${c.name} (${(c.score * 100).toFixed(0)}%)`).join(', ') || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Results for Games */}
        {gameMatches.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold">Game Matches</h2>
            </div>
            <div className="p-6 space-y-4">
              {gameMatches.map((match, idx) => (
                <div key={idx} className={`border rounded-lg p-4 ${
                  match.needsVerification ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'
                }`}>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-semibold text-lg">Game {idx + 1}</h3>
                    <div className="flex gap-2">
                      <span className={`px-2 py-1 text-sm font-medium rounded ${
                        match.overallConfidence >= 0.8 ? 'bg-green-100 text-green-800' :
                        match.overallConfidence >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {(match.overallConfidence * 100).toFixed(0)}% Overall
                      </span>
                      {match.needsVerification && (
                        <span className="px-2 py-1 text-sm bg-yellow-100 text-yellow-800 rounded">
                          ⚠️ Needs Verification
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-600 mb-1">Away Team</h4>
                      <div className="space-y-1">
                        <p className="text-sm">
                          <span className="text-gray-500">{match.awayTeam.originalName}</span>
                          {' → '}
                          <span className="font-medium">{match.awayTeam.matchedName}</span>
                        </p>
                        <div className="flex gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded ${getMethodBadge(match.awayTeam.method)}`}>
                            {match.awayTeam.method}
                          </span>
                          <span className={`text-xs font-mono ${getConfidenceColor(match.awayTeam.confidence)}`}>
                            {(match.awayTeam.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-gray-600 mb-1">Home Team</h4>
                      <div className="space-y-1">
                        <p className="text-sm">
                          <span className="text-gray-500">{match.homeTeam.originalName}</span>
                          {' → '}
                          <span className="font-medium">{match.homeTeam.matchedName}</span>
                        </p>
                        <div className="flex gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded ${getMethodBadge(match.homeTeam.method)}`}>
                            {match.homeTeam.method}
                          </span>
                          <span className={`text-xs font-mono ${getConfidenceColor(match.homeTeam.confidence)}`}>
                            {(match.homeTeam.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Box */}
        {!loading && teamMatches.length === 0 && gameMatches.length === 0 && (
          <div className="bg-blue-50 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-2">🎯 How Entity Resolution Works</h3>
            <ul className="text-sm text-blue-800 space-y-2">
              <li><strong>Exact Match:</strong> Direct match with official team name (100% confidence)</li>
              <li><strong>Alias Match:</strong> Match with known nickname or abbreviation (95% confidence)</li>
              <li><strong>Fuzzy Match:</strong> Approximate string matching using Fuse.js (60-90% confidence)</li>
              <li><strong>LLM Verification:</strong> OpenAI for ambiguous matches (85% confidence)</li>
              <li><strong>NCAA Detection:</strong> Identifies college teams by patterns (State, University, rankings)</li>
            </ul>
            
            <div className="mt-4 p-3 bg-white rounded">
              <h4 className="font-medium mb-1">Confidence Levels:</h4>
              <div className="flex gap-4 text-xs">
                <span className="text-green-600">● High (≥80%)</span>
                <span className="text-yellow-600">● Medium (60-79%)</span>
                <span className="text-red-600">● Low (&lt;60%)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}