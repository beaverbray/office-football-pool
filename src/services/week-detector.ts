/**
 * Week Detector - Detects current NFL/NCAA week using multiple data sources
 *
 * Strategy:
 * 1. Primary: ESPN API (most accurate, real-time)
 * 2. Fallback: Calendar-based estimation
 */

export interface WeekInfo {
  week: number
  seasonYear: number
  startDate: Date
  endDate: Date
}

interface ESPNScoreboardResponse {
  season?: {
    type: number
    year: number
  }
  week?: {
    number: number
  }
}

export class WeekDetector {
  /**
   * Get current NFL week from ESPN API
   */
  private static async fetchNFLWeekFromESPN(): Promise<{ week: number; year: number } | null> {
    try {
      const response = await fetch('http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard', {
        next: { revalidate: 3600 } // Cache for 1 hour
      })

      if (!response.ok) {
        console.warn('ESPN NFL API returned non-OK status:', response.status)
        return null
      }

      const data: ESPNScoreboardResponse = await response.json()

      if (data.week?.number && data.season?.year) {
        return {
          week: data.week.number,
          year: data.season.year
        }
      }

      return null
    } catch (error) {
      console.warn('Failed to fetch NFL week from ESPN:', error)
      return null
    }
  }

  /**
   * Get current NCAA week from ESPN API
   */
  private static async fetchNCAAWeekFromESPN(): Promise<{ week: number; year: number } | null> {
    try {
      const response = await fetch('http://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard', {
        next: { revalidate: 3600 } // Cache for 1 hour
      })

      if (!response.ok) {
        console.warn('ESPN NCAAF API returned non-OK status:', response.status)
        return null
      }

      const data: ESPNScoreboardResponse = await response.json()

      if (data.week?.number !== undefined && data.season?.year) {
        return {
          week: data.week.number,
          year: data.season.year
        }
      }

      return null
    } catch (error) {
      console.warn('Failed to fetch NCAAF week from ESPN:', error)
      return null
    }
  }

  /**
   * Fallback: Calculate NFL week based on calendar
   */
  private static calculateNFLWeekFromCalendar(): { week: number; year: number } {
    const now = new Date()
    const seasonYear = now.getFullYear()

    // NFL season typically starts first week of September
    const seasonStart = new Date(seasonYear, 8, 1) // September 1

    // Calculate weeks since season start
    const weeksPassed = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const currentWeek = Math.max(1, Math.min(18, weeksPassed + 1))

    return { week: currentWeek, year: seasonYear }
  }

  /**
   * Fallback: Calculate NCAA week based on calendar
   */
  private static calculateNCAAWeekFromCalendar(): { week: number; year: number } {
    const now = new Date()
    const seasonYear = now.getFullYear()

    // NCAA season typically starts last week of August
    const seasonStart = new Date(seasonYear, 7, 24) // August 24

    // Calculate weeks since season start
    const weeksPassed = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const currentWeek = Math.max(0, Math.min(15, weeksPassed))

    return { week: currentWeek, year: seasonYear }
  }

  /**
   * Calculate week date boundaries (for display purposes)
   */
  private static calculateWeekBoundaries(week: number, year: number, league: 'NFL' | 'NCAA'): { startDate: Date; endDate: Date } {
    const seasonStart = league === 'NFL'
      ? new Date(year, 8, 1)  // September 1
      : new Date(year, 7, 24) // August 24

    const weekOffset = league === 'NFL' ? (week - 1) : week

    return {
      startDate: new Date(seasonStart.getTime() + weekOffset * 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(seasonStart.getTime() + (weekOffset + 1) * 7 * 24 * 60 * 60 * 1000)
    }
  }

  /**
   * Get current NFL week (async with ESPN API fallback to calendar)
   */
  static async getCurrentNFLWeek(): Promise<WeekInfo> {
    // Try ESPN API first
    const espnData = await this.fetchNFLWeekFromESPN()

    const weekData = espnData || this.calculateNFLWeekFromCalendar()
    const boundaries = this.calculateWeekBoundaries(weekData.week, weekData.year, 'NFL')

    return {
      week: weekData.week,
      seasonYear: weekData.year,
      ...boundaries
    }
  }

  /**
   * Get current NCAA week (async with ESPN API fallback to calendar)
   */
  static async getCurrentNCAAWeek(): Promise<WeekInfo> {
    // Try ESPN API first
    const espnData = await this.fetchNCAAWeekFromESPN()

    const weekData = espnData || this.calculateNCAAWeekFromCalendar()
    const boundaries = this.calculateWeekBoundaries(weekData.week, weekData.year, 'NCAA')

    return {
      week: weekData.week,
      seasonYear: weekData.year,
      ...boundaries
    }
  }

  /**
   * Detect week from a date
   */
  static getWeekFromDate(date: Date, league: 'NFL' | 'NCAA' = 'NFL'): WeekInfo {
    const seasonYear = date.getFullYear()
    const seasonStart = league === 'NFL'
      ? new Date(seasonYear, 8, 1)  // September 1
      : new Date(seasonYear, 7, 24) // August 24

    const weeksPassed = Math.floor((date.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const week = league === 'NFL'
      ? Math.max(1, Math.min(18, weeksPassed + 1))
      : Math.max(0, Math.min(15, weeksPassed))

    return {
      week,
      seasonYear,
      startDate: new Date(seasonStart.getTime() + (week - (league === 'NFL' ? 1 : 0)) * 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(seasonStart.getTime() + (week - (league === 'NFL' ? 0 : -1)) * 7 * 24 * 60 * 60 * 1000)
    }
  }
}
