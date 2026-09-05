/**
 * Week Detector - Detects current NFL/NCAA week using multiple data sources
 *
 * Strategy:
 * 1. Primary: ESPN API (most accurate, real-time)
 * 2. Fallback: Calendar-based estimation
 */

/**
 * ESPN season phase. ESPN encodes this as `season.type`:
 *   1 = preseason, 2 = regular season, 3 = postseason, 4 = offseason
 * This distinction is load-bearing: during preseason ESPN reports its own
 * week counter (preseason weeks 1-4), which must NOT be mistaken for a
 * regular-season week. Ignoring it means e.g. "preseason week 3" is treated
 * as "regular season week 3", and the week number then jumps *backwards* to 1
 * when the real season opens.
 */
export type SeasonType = 'preseason' | 'regular' | 'postseason' | 'offseason'

export interface WeekInfo {
  /**
   * Regular-season week number. During preseason this is 1 (the upcoming
   * regular-season week), NOT ESPN's preseason week counter — check
   * `isRegularSeason` before treating it as live.
   */
  week: number
  seasonYear: number
  startDate: Date
  endDate: Date
  seasonType: SeasonType
  /** True only during the regular season. Gate scheduled work on this. */
  isRegularSeason: boolean
  /** ESPN's raw, un-normalized week counter, for logging/diagnostics. */
  rawWeek: number
}

interface ESPNScoreboardResponse {
  season?: {
    year: number
    type?: number
  }
  week?: {
    number: number
  }
}

type ESPNWeek = { week: number; year: number; seasonType: SeasonType }

export class WeekDetector {
  /** Map ESPN's numeric season.type to a named phase. */
  private static mapSeasonType(type: number | undefined): SeasonType {
    switch (type) {
      case 1: return 'preseason'
      case 2: return 'regular'
      case 3: return 'postseason'
      case 4: return 'offseason'
      default:
        // Older/unexpected payload shape. Assume regular season to preserve
        // behaviour, but make the ambiguity visible rather than silent.
        console.warn(`ESPN returned unrecognised season.type=${type}; assuming regular season`)
        return 'regular'
    }
  }

  /** Shared ESPN scoreboard fetch. HTTPS: this crosses the public internet. */
  private static async fetchWeekFromESPN(
    sport: 'nfl' | 'college-football',
    label: string
  ): Promise<ESPNWeek | null> {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/${sport}/scoreboard`,
        { next: { revalidate: 3600 } } // Cache for 1 hour (ignored outside Next.js)
      )

      if (!response.ok) {
        console.warn(`ESPN ${label} API returned non-OK status:`, response.status)
        return null
      }

      const data: ESPNScoreboardResponse = await response.json()

      if (data.week?.number !== undefined && data.season?.year) {
        return {
          week: data.week.number,
          year: data.season.year,
          seasonType: this.mapSeasonType(data.season.type)
        }
      }

      return null
    } catch (error) {
      console.warn(`Failed to fetch ${label} week from ESPN:`, error)
      return null
    }
  }

  /**
   * Fallback: estimate NFL week and phase from the calendar.
   * Only used when ESPN is unreachable, so it must still be honest about phase:
   * before September the regular season has not started.
   */
  private static calculateNFLWeekFromCalendar(): ESPNWeek {
    const now = new Date()
    const seasonYear = now.getFullYear()
    const month = now.getMonth() // 0-indexed

    // NFL regular season runs Sept -> early Jan; playoffs Jan -> mid Feb.
    let seasonType: SeasonType
    if (month === 7) seasonType = 'preseason'          // August
    else if (month >= 8 || month === 0) seasonType = 'regular'  // Sept-Dec, Jan
    else if (month === 1) seasonType = 'postseason'    // February
    else seasonType = 'offseason'                      // Mar-Jul

    const seasonStart = new Date(seasonYear, 8, 1) // September 1
    const weeksPassed = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const currentWeek = Math.max(1, Math.min(18, weeksPassed + 1))

    return { week: currentWeek, year: seasonYear, seasonType }
  }

  /**
   * Fallback: estimate NCAA week and phase from the calendar.
   */
  private static calculateNCAAWeekFromCalendar(): ESPNWeek {
    const now = new Date()
    const seasonYear = now.getFullYear()
    const month = now.getMonth()

    // NCAA regular season runs late Aug -> early Dec; bowls Dec -> mid Jan.
    let seasonType: SeasonType
    if (month >= 7 && month <= 10) seasonType = 'regular'      // Aug-Nov
    else if (month === 11 || month === 0) seasonType = 'postseason' // Dec-Jan bowls
    else seasonType = 'offseason'

    const seasonStart = new Date(seasonYear, 7, 24) // August 24
    const weeksPassed = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
    const currentWeek = Math.max(0, Math.min(15, weeksPassed))

    return { week: currentWeek, year: seasonYear, seasonType }
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
   * Get current NFL week (ESPN, falling back to calendar estimation).
   *
   * During preseason the returned `week` is normalized to 1 (the upcoming
   * regular-season week) rather than ESPN's preseason counter. Callers doing
   * real work (fetching picksheets, odds) MUST check `isRegularSeason`.
   */
  static async getCurrentNFLWeek(): Promise<WeekInfo> {
    const weekData =
      (await this.fetchWeekFromESPN('nfl', 'NFL')) ?? this.calculateNFLWeekFromCalendar()

    const week = weekData.seasonType === 'preseason' ? 1 : weekData.week
    const boundaries = this.calculateWeekBoundaries(week, weekData.year, 'NFL')

    return {
      week,
      rawWeek: weekData.week,
      seasonYear: weekData.year,
      seasonType: weekData.seasonType,
      isRegularSeason: weekData.seasonType === 'regular',
      ...boundaries
    }
  }

  /**
   * Get current NCAA week (ESPN, falling back to calendar estimation).
   * Same preseason normalization contract as `getCurrentNFLWeek`.
   */
  static async getCurrentNCAAWeek(): Promise<WeekInfo> {
    const weekData =
      (await this.fetchWeekFromESPN('college-football', 'NCAAF')) ??
      this.calculateNCAAWeekFromCalendar()

    const week = weekData.seasonType === 'preseason' ? 1 : weekData.week
    const boundaries = this.calculateWeekBoundaries(week, weekData.year, 'NCAA')

    return {
      week,
      rawWeek: weekData.week,
      seasonYear: weekData.year,
      seasonType: weekData.seasonType,
      isRegularSeason: weekData.seasonType === 'regular',
      ...boundaries
    }
  }

  /**
   * Detect week from an explicit date.
   *
   * This is a pure calendar derivation with no ESPN lookup, so it cannot know
   * the real season phase; it reports 'regular' for in-season dates and
   * 'offseason' otherwise. Do not use it to gate scheduled work — use
   * `getCurrentNFLWeek`/`getCurrentNCAAWeek`, which consult ESPN.
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

    const inSeasonWindow = weeksPassed >= 0 && weeksPassed <= (league === 'NFL' ? 18 : 15)
    const seasonType: SeasonType = inSeasonWindow ? 'regular' : 'offseason'

    return {
      week,
      rawWeek: week,
      seasonYear,
      seasonType,
      isRegularSeason: seasonType === 'regular',
      startDate: new Date(seasonStart.getTime() + (week - (league === 'NFL' ? 1 : 0)) * 7 * 24 * 60 * 60 * 1000),
      endDate: new Date(seasonStart.getTime() + (week - (league === 'NFL' ? 0 : -1)) * 7 * 24 * 60 * 60 * 1000)
    }
  }
}
