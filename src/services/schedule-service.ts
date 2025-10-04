import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database'

type ScheduleGame = Database['public']['Tables']['schedule']['Row']

export class ScheduleService {
  /**
   * Get all games for a specific week
   */
  static async getGamesByWeek(
    week: number,
    league?: 'NFL' | 'NCAA'
  ): Promise<ScheduleGame[]> {
    let query = supabase
      .from('schedule')
      .select('*')
      .eq('week', week)

    if (league) {
      query = query.eq('league', league)
    }

    const { data, error } = await query.order('match_number')

    if (error) {
      console.error('Error fetching schedule games:', error)
      throw new Error(`Failed to fetch schedule: ${error.message}`)
    }

    return data || []
  }

  /**
   * Get current week games based on today's date
   * NFL: Week 1 starts first week of September
   * NCAA: Week 0 starts last week of August
   */
  static async getCurrentWeekGames(league?: 'NFL' | 'NCAA'): Promise<ScheduleGame[]> {
    const now = new Date()
    const currentYear = now.getFullYear()

    // Calculate current week (rough estimate)
    const seasonStart = new Date(currentYear, 8, 1) // September 1
    const weeksPassed = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const currentWeek = Math.max(1, Math.min(18, weeksPassed + 1))

    return this.getGamesByWeek(currentWeek, league)
  }

  /**
   * Find a game by team names (exact or fuzzy match)
   */
  static async findGameByTeams(
    homeTeam: string,
    awayTeam: string,
    week?: number,
    league?: 'NFL' | 'NCAA'
  ): Promise<ScheduleGame | null> {
    let query = supabase
      .from('schedule')
      .select('*')

    if (week) {
      query = query.eq('week', week)
    }

    if (league) {
      query = query.eq('league', league)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error finding game:', error)
      return null
    }

    if (!data || data.length === 0) {
      return null
    }

    // Normalize team names for comparison
    const normalizeTeam = (name: string) => name.toLowerCase().trim()
    const normalizedHome = normalizeTeam(homeTeam)
    const normalizedAway = normalizeTeam(awayTeam)

    // Try exact match first
    const exactMatch = data.find(
      game =>
        normalizeTeam(game.home_team) === normalizedHome &&
        normalizeTeam(game.away_team) === normalizedAway
    )

    if (exactMatch) {
      return exactMatch
    }

    // Try partial match (contains)
    const partialMatch = data.find(
      game =>
        normalizeTeam(game.home_team).includes(normalizedHome) &&
        normalizeTeam(game.away_team).includes(normalizedAway)
    )

    return partialMatch || null
  }

  /**
   * Get games for a specific date range
   */
  static async getGamesByDateRange(
    startDate: string,
    endDate: string,
    league?: 'NFL' | 'NCAA'
  ): Promise<ScheduleGame[]> {
    let query = supabase
      .from('schedule')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)

    if (league) {
      query = query.eq('league', league)
    }

    const { data, error } = await query.order('date').order('match_number')

    if (error) {
      console.error('Error fetching games by date range:', error)
      throw new Error(`Failed to fetch schedule: ${error.message}`)
    }

    return data || []
  }

  /**
   * Get all unique weeks for a league
   */
  static async getAvailableWeeks(league?: 'NFL' | 'NCAA'): Promise<number[]> {
    let query = supabase
      .from('schedule')
      .select('week')

    if (league) {
      query = query.eq('league', league)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching available weeks:', error)
      return []
    }

    const weeks = [...new Set(data?.map(d => d.week) || [])].sort((a, b) => a - b)
    return weeks
  }
}
