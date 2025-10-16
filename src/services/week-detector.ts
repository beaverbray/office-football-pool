/**
 * Week Detector - Detects current NFL/NCAA week
 */

export interface WeekInfo {
  week: number
  season: number
  startDate: Date
  endDate: Date
}

export class WeekDetector {
  /**
   * Get current NFL week
   */
  static getCurrentNFLWeek(): WeekInfo {
    const now = new Date()
    const season = now.getFullYear()

    // NFL season typically starts first week of September
    const seasonStart = new Date(season, 8, 1) // September 1

    // Calculate weeks since season start
    const weeksPassed = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const currentWeek = Math.max(1, Math.min(18, weeksPassed + 1))

    return {
      week: currentWeek,
      season,
      startDate: new Date(seasonStart.getTime() + (currentWeek - 1) * 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(seasonStart.getTime() + currentWeek * 7 * 24 * 60 * 60 * 1000)
    }
  }

  /**
   * Get current NCAA week
   */
  static getCurrentNCAAWeek(): WeekInfo {
    const now = new Date()
    const season = now.getFullYear()

    // NCAA season typically starts last week of August
    const seasonStart = new Date(season, 7, 24) // August 24

    // Calculate weeks since season start
    const weeksPassed = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const currentWeek = Math.max(0, Math.min(15, weeksPassed))

    return {
      week: currentWeek,
      season,
      startDate: new Date(seasonStart.getTime() + currentWeek * 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(seasonStart.getTime() + (currentWeek + 1) * 7 * 24 * 60 * 60 * 1000)
    }
  }

  /**
   * Detect week from a date
   */
  static getWeekFromDate(date: Date, league: 'NFL' | 'NCAA' = 'NFL'): WeekInfo {
    const season = date.getFullYear()
    const seasonStart = league === 'NFL'
      ? new Date(season, 8, 1)  // September 1
      : new Date(season, 7, 24) // August 24

    const weeksPassed = Math.floor((date.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const week = league === 'NFL'
      ? Math.max(1, Math.min(18, weeksPassed + 1))
      : Math.max(0, Math.min(15, weeksPassed))

    return {
      week,
      season,
      startDate: new Date(seasonStart.getTime() + (week - (league === 'NFL' ? 1 : 0)) * 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(seasonStart.getTime() + (week - (league === 'NFL' ? 0 : -1)) * 7 * 24 * 60 * 60 * 1000)
    }
  }
}
