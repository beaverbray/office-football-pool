import * as cheerio from 'cheerio'
import { WeekDetector } from './week-detector'

export interface WarrenNolanPrediction {
  gameTime: string
  awayTeam: string
  homeTeam: string
  predictedWinner: 'home' | 'away'
  winProbability: number
  confidence: 'H' | 'M' | 'L'
  spread: number
  overUnder?: number
}

export interface WarrenNolanScraperResult {
  success: boolean
  predictions: WarrenNolanPrediction[]
  scrapedAt: string
  gameDate?: string
  week?: number
  season?: number
  error?: string
}

export class WarrenNolanScraper {
  private static readonly BASE_URL = 'https://www.warrennolan.com/fbs/2025/predict-winners'

  /**
   * Scrape predictions for a specific date
   * @param date - Date in YYYY-MM-DD format (e.g., '2025-10-04')
   * @returns Scraper result with predictions
   */
  static async scrapePredictions(date: string): Promise<WarrenNolanScraperResult> {
    const scrapedAt = new Date().toISOString()

    try {
      // Build URL with date parameter
      const url = `${this.BASE_URL}?type1=Today,%20${this.formatDateForUrl(date)}&type2=All%20Games&date=${date}`

      console.log(`Fetching Warren Nolan predictions from: ${url}`)

      // Fetch the page
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OfficeFootballPool/1.0)',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const html = await response.text()
      const $ = cheerio.load(html)

      const predictions: WarrenNolanPrediction[] = []

      // Warren Nolan uses div.pbox structure for each game
      $('div.pbox').each((index, pboxElement) => {
        try {
          const $pbox = $(pboxElement)

          // Get game time from the header row
          const gameTime = $pbox.find('.pbox__info-top-row .time-clock').text().trim()
          if (!gameTime) return

          // Get away team (team1) data
          const $awayRow = $pbox.find('.pbox__info-team1-row')
          const awayTeam = this.cleanTeamName($awayRow.find('.team-info .blue-black').first().text().trim())
          const awayValues = $awayRow.find('td.value')
          const awayTotal = $(awayValues[0]).text().trim() // O/U total
          const awayProbText = $(awayValues[1]).text().trim() // Win probability
          const awayConfidence = $(awayValues[2]).text().trim()

          // Get home team (team2) data
          const $homeRow = $pbox.find('.pbox__info-team2-row')
          const homeTeam = this.cleanTeamName($homeRow.find('.team-info .blue-black').first().text().trim())
          const homeValues = $homeRow.find('td.value')
          const homeSpreadText = $(homeValues[0]).text().trim() // Spread
          const homeProbText = $(homeValues[1]).text().trim() // Win probability
          const homeConfidence = $(homeValues[2]).text().trim()

          // Skip if essential data is missing
          if (!awayTeam || !homeTeam) return

          // Parse home team spread
          // Warren Nolan shows: negative = home is underdog (away favored), positive = home is favorite
          const homeSpread = parseFloat(homeSpreadText.replace(/[^\d.-]/g, ''))
          if (isNaN(homeSpread)) return

          // Parse win probabilities
          const awayWinProb = parseFloat(awayProbText.replace('%', '').trim())
          const homeWinProb = parseFloat(homeProbText.replace('%', '').trim())

          // Determine predicted winner based on spread
          // Negative spread = home is underdog (away team favored)
          // Positive spread = home is favorite
          const predictedWinner: 'home' | 'away' = homeSpread < 0 ? 'away' : 'home'
          const winProbability = homeSpread < 0 ? awayWinProb : homeWinProb

          // Use the confidence from the predicted winner (based on spread)
          const confidenceText = predictedWinner === 'home' ? homeConfidence : awayConfidence
          const confidence = this.parseConfidence(confidenceText)

          // Parse over/under total
          const overUnder = parseFloat(awayTotal)

          predictions.push({
            gameTime,
            awayTeam,
            homeTeam,
            predictedWinner,
            winProbability,
            confidence,
            spread: Math.abs(homeSpread),
            overUnder: !isNaN(overUnder) ? overUnder : undefined,
          })
        } catch (err) {
          console.warn('Error parsing game box:', err)
          // Continue processing other games
        }
      })

      console.log(`Successfully scraped ${predictions.length} predictions`)

      return {
        success: true,
        predictions,
        scrapedAt,
        gameDate: date,
      }
    } catch (error) {
      console.error('Warren Nolan scraper error:', error)
      return {
        success: false,
        predictions: [],
        scrapedAt,
        gameDate: date,
        error: error instanceof Error ? error.message : 'Unknown scraping error',
      }
    }
  }

  /**
   * Scrape predictions for a specific week
   * @param season - Season year (e.g., 2025)
   * @param week - Week number (0-14 for NCAAF)
   * @returns Scraper result with predictions for the entire week
   */
  static async scrapePredictionsByWeek(season: number, week: number): Promise<WarrenNolanScraperResult> {
    const scrapedAt = new Date().toISOString()

    try {
      // Get week boundaries from WeekDetector
      // For NCAA: Week 0 starts Aug 24, Week 1 starts Aug 31, etc.
      const seasonStart = new Date(season, 7, 24) // August 24 (month is 0-indexed)
      const weekStartDate = new Date(seasonStart)
      weekStartDate.setDate(seasonStart.getDate() + (week * 7))

      // Calculate end date (7 days later)
      const weekEndDate = new Date(weekStartDate)
      weekEndDate.setDate(weekStartDate.getDate() + 6)

      // Collect predictions for all 7 days of the week
      const allPredictions: WarrenNolanPrediction[] = []
      const errors: string[] = []

      console.log(`Fetching Warren Nolan predictions for Week ${week} (${season})`)
      console.log(`  Week range: ${weekStartDate.toISOString().split('T')[0]} to ${weekEndDate.toISOString().split('T')[0]}`)

      // Iterate through each day of the week (7 days)
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const currentDate = new Date(weekStartDate)
        currentDate.setDate(weekStartDate.getDate() + dayOffset)
        const dateString = currentDate.toISOString().split('T')[0]

        try {
          console.log(`  Fetching games for ${dateString}...`)
          const dayResult = await this.scrapePredictions(dateString)

          if (dayResult.success && dayResult.predictions.length > 0) {
            allPredictions.push(...dayResult.predictions)
            console.log(`    Found ${dayResult.predictions.length} games`)
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error'
          console.warn(`  Error fetching ${dateString}: ${errorMsg}`)
          errors.push(`${dateString}: ${errorMsg}`)
          // Continue to next day
        }

        // Add a small delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      if (allPredictions.length === 0) {
        throw new Error(`No games found for Week ${week}. ${errors.length > 0 ? 'Errors: ' + errors.join('; ') : 'The week may not have data yet or the season has ended.'}`)
      }

      console.log(`Successfully scraped ${allPredictions.length} total predictions for Week ${week}`)

      return {
        success: true,
        predictions: allPredictions,
        scrapedAt,
        week,
        season,
      }
    } catch (error) {
      console.error('Warren Nolan scraper error:', error)
      return {
        success: false,
        predictions: [],
        scrapedAt,
        week,
        season,
        error: error instanceof Error ? error.message : 'Unknown scraping error',
      }
    }
  }

  /**
   * Scrape predictions for today (single day)
   */
  static async scrapeTodaysPredictions(): Promise<WarrenNolanScraperResult> {
    const today = new Date().toISOString().split('T')[0]
    return this.scrapePredictions(today)
  }

  /**
   * Scrape predictions for current NCAAF week
   */
  static async scrapeCurrentWeek(): Promise<WarrenNolanScraperResult> {
    // Use WeekDetector for consistent week calculation
    const weekInfo = await WeekDetector.getCurrentNCAAWeek()

    return this.scrapePredictionsByWeek(weekInfo.seasonYear, weekInfo.week)
  }

  /**
   * Clean team name by removing rankings and extra whitespace
   */
  private static cleanTeamName(name: string): string {
    return name
      .replace(/#\d+/g, '') // Remove rankings like #20
      .replace(/\s+\(\d+-\d+.*?\)/g, '') // Remove records like (3-1, Home 2-0)
      .trim()
  }

  /**
   * Parse confidence level from text
   */
  private static parseConfidence(text: string): 'H' | 'M' | 'L' {
    const upper = text.toUpperCase()
    if (upper.includes('H') || upper.includes('HIGH')) return 'H'
    if (upper.includes('L') || upper.includes('LOW')) return 'L'
    return 'M'
  }

  /**
   * Format date for URL (e.g., "Friday, November 7" from "2025-11-07")
   */
  private static formatDateForUrl(date: string): string {
    const d = new Date(date + 'T12:00:00Z') // Add time to avoid timezone issues
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]
    const dayName = days[d.getUTCDay()]
    const monthName = months[d.getUTCMonth()]
    const dayNum = d.getUTCDate()
    return `${dayName},%20${monthName}%20${dayNum}`
  }

  /**
   * Convert predictions to pipeline format
   */
  static convertToPipelineFormat(predictions: WarrenNolanPrediction[]): Array<{
    homeTeam: string
    awayTeam: string
    spread: number
    gameDate?: string
    metadata?: any
  }> {
    return predictions.map(pred => ({
      homeTeam: pred.homeTeam,
      awayTeam: pred.awayTeam,
      spread: pred.predictedWinner === 'home' ? -pred.spread : pred.spread,
      metadata: {
        source: 'warren-nolan',
        winProbability: pred.winProbability,
        confidence: pred.confidence,
        gameTime: pred.gameTime,
      }
    }))
  }
}
