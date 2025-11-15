import { Database } from '@/types/database'
import { EntityResolver } from './entity-resolution'

type ScheduleGame = Database['public']['Tables']['schedule']['Row']

export interface MatchResult {
  scheduleGame: ScheduleGame
  confidence: number
  method: 'exact' | 'fuzzy' | 'partial'
}

export interface SourceGame {
  homeTeam: string
  awayTeam: string
  spread?: number
  [key: string]: any
}

export class GameMatchingService {
  private static resolver = new EntityResolver()

  /**
   * Match a single source game to schedule games
   */
  static matchToSchedule(
    sourceGame: SourceGame,
    scheduleGames: ScheduleGame[],
    league?: 'NFL' | 'NCAAF'
  ): MatchResult | null {
    let bestMatch: MatchResult | null = null
    let highestConfidence = 0

    for (const scheduleGame of scheduleGames) {
      // Skip if league doesn't match
      if (league && scheduleGame.league !== league) {
        continue
      }

      const confidence = this.calculateMatchConfidence(
        sourceGame,
        scheduleGame,
        league
      )

      if (confidence > highestConfidence) {
        highestConfidence = confidence
        bestMatch = {
          scheduleGame,
          confidence,
          method: confidence === 1.0 ? 'exact' : confidence > 0.8 ? 'fuzzy' : 'partial'
        }
      }
    }

    // Reject matches below threshold
    if (bestMatch && bestMatch.confidence >= 0.75) {
      return bestMatch
    }

    return null
  }

  /**
   * Calculate confidence score for matching a source game to a schedule game
   */
  private static calculateMatchConfidence(
    sourceGame: SourceGame,
    scheduleGame: ScheduleGame,
    league?: 'NFL' | 'NCAAF'
  ): number {
    const normalizeTeam = (name: string) => name.toLowerCase().trim()

    const sourceHome = normalizeTeam(sourceGame.homeTeam)
    const sourceAway = normalizeTeam(sourceGame.awayTeam)
    const scheduleHome = normalizeTeam(scheduleGame.home_team)
    const scheduleAway = normalizeTeam(scheduleGame.away_team)

    // Try exact match first
    if (sourceHome === scheduleHome && sourceAway === scheduleAway) {
      return 1.0
    }

    // Try entity resolution
    try {
      const leagueType = league || (scheduleGame.league === 'NFL' ? 'NFL' : 'NCAAF')

      let homeMatch: any
      let awayMatch: any

      if (leagueType === 'NFL') {
        homeMatch = this.resolver.findNFLTeamExact(sourceGame.homeTeam) ||
                    this.resolver.findNFLTeamFuzzy(sourceGame.homeTeam)
        awayMatch = this.resolver.findNFLTeamExact(sourceGame.awayTeam) ||
                    this.resolver.findNFLTeamFuzzy(sourceGame.awayTeam)

        const scheduleHomeMatch = this.resolver.findNFLTeamExact(scheduleGame.home_team) ||
                                  this.resolver.findNFLTeamFuzzy(scheduleGame.home_team)
        const scheduleAwayMatch = this.resolver.findNFLTeamExact(scheduleGame.away_team) ||
                                  this.resolver.findNFLTeamFuzzy(scheduleGame.away_team)

        if (homeMatch && awayMatch && scheduleHomeMatch && scheduleAwayMatch) {
          const homeMatches = homeMatch.matchedName === scheduleHomeMatch.matchedName
          const awayMatches = awayMatch.matchedName === scheduleAwayMatch.matchedName

          if (homeMatches && awayMatches) {
            return 0.95 // High confidence fuzzy match
          }
        }
      } else {
        homeMatch = this.resolver.findNCAAFTeamExact(sourceGame.homeTeam) ||
                    this.resolver.findNCAAFTeamFuzzy(sourceGame.homeTeam)
        awayMatch = this.resolver.findNCAAFTeamExact(sourceGame.awayTeam) ||
                    this.resolver.findNCAAFTeamFuzzy(sourceGame.awayTeam)

        const scheduleHomeMatch = this.resolver.findNCAAFTeamExact(scheduleGame.home_team) ||
                                  this.resolver.findNCAAFTeamFuzzy(scheduleGame.home_team)
        const scheduleAwayMatch = this.resolver.findNCAAFTeamExact(scheduleGame.away_team) ||
                                  this.resolver.findNCAAFTeamFuzzy(scheduleGame.away_team)

        if (homeMatch && awayMatch && scheduleHomeMatch && scheduleAwayMatch) {
          const homeMatches = homeMatch.matchedName === scheduleHomeMatch.matchedName
          const awayMatches = awayMatch.matchedName === scheduleAwayMatch.matchedName

          if (homeMatches && awayMatches) {
            return 0.95 // High confidence fuzzy match
          }
        }
      }
    } catch (err) {
      console.debug('Entity resolution failed, falling back to string matching', err)
    }

    // Fallback: Check if team names contain each other
    const homeContains = scheduleHome.includes(sourceHome) || sourceHome.includes(scheduleHome)
    const awayContains = scheduleAway.includes(sourceAway) || sourceAway.includes(scheduleAway)

    if (homeContains && awayContains) {
      return 0.75 // Minimum threshold for partial match
    }

    return 0 // No match
  }

  /**
   * Match multiple source games to schedule games
   */
  static matchGamesToSchedule(
    sourceGames: SourceGame[],
    scheduleGames: ScheduleGame[],
    league?: 'NFL' | 'NCAAF'
  ): Map<string, MatchResult> {
    const matches = new Map<string, MatchResult>()

    sourceGames.forEach((sourceGame, index) => {
      const match = this.matchToSchedule(sourceGame, scheduleGames, league)

      if (match) {
        // Use a composite key: home_team|away_team
        const key = `${sourceGame.homeTeam}|${sourceGame.awayTeam}`
        matches.set(key, match)
      } else {
        console.warn(`No match found for game: ${sourceGame.awayTeam} @ ${sourceGame.homeTeam}`)
      }
    })

    return matches
  }

  /**
   * Match picksheet games to schedule
   * Returns a map of schedule game match_number to matched source game with confidence
   */
  static matchPicksheetToSchedule(
    picksheetGames: SourceGame[],
    scheduleGames: ScheduleGame[]
  ): Map<number, { game: SourceGame; confidence: number }> {
    const matchedGames = new Map<number, { game: SourceGame; confidence: number }>()

    for (const picksheetGame of picksheetGames) {
      const match = this.matchToSchedule(picksheetGame, scheduleGames)

      if (match) {
        matchedGames.set(match.scheduleGame.match_number, {
          game: picksheetGame,
          confidence: match.confidence
        })
      }
    }

    return matchedGames
  }

  /**
   * Match market odds to schedule
   */
  static matchMarketToSchedule(
    marketGames: SourceGame[],
    scheduleGames: ScheduleGame[],
    league?: 'NFL' | 'NCAAF'
  ): Map<number, { game: SourceGame; confidence: number }> {
    const matchedGames = new Map<number, { game: SourceGame; confidence: number }>()

    for (const marketGame of marketGames) {
      const match = this.matchToSchedule(marketGame, scheduleGames, league)

      if (match) {
        matchedGames.set(match.scheduleGame.match_number, {
          game: marketGame,
          confidence: match.confidence
        })
      }
    }

    return matchedGames
  }

  /**
   * Match predictions to schedule
   */
  static matchPredictionsToSchedule(
    predictions: Array<{ homeTeam: string; awayTeam: string; [key: string]: any }>,
    scheduleGames: ScheduleGame[],
    league?: 'NFL' | 'NCAAF'
  ): Map<number, { prediction: any; confidence: number }> {
    const matchedPredictions = new Map<number, { prediction: any; confidence: number }>()

    for (const prediction of predictions) {
      const match = this.matchToSchedule(
        { homeTeam: prediction.homeTeam, awayTeam: prediction.awayTeam },
        scheduleGames,
        league
      )

      if (match) {
        matchedPredictions.set(match.scheduleGame.match_number, {
          prediction,
          confidence: match.confidence
        })
      }
    }

    return matchedPredictions
  }
}
