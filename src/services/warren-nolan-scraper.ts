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

          // Parse home team spread (negative means home is favored)
          const homeSpread = parseFloat(homeSpreadText.replace(/[^\d.-]/g, ''))
          if (isNaN(homeSpread)) return

          // Parse win probabilities
          const awayWinProb = parseFloat(awayProbText.replace('%', '').trim())
          const homeWinProb = parseFloat(homeProbText.replace('%', '').trim())

          // Determine predicted winner based on higher win probability
          const predictedWinner: 'home' | 'away' = homeWinProb > awayWinProb ? 'home' : 'away'
          const winProbability = Math.max(awayWinProb, homeWinProb)

          // Use the confidence from the team with higher win probability
          const confidenceText = homeWinProb > awayWinProb ? homeConfidence : awayConfidence
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
      // Build URL with week parameter
      // Warren Nolan uses type1 parameter to filter by week
      const url = `${this.BASE_URL.replace('/2025/', `/${season}/`)}?type1=This%20Week,%20Week%20${week}&type2=All%20FBS%20Games`

      console.log(`Fetching Warren Nolan predictions for Week ${week} from: ${url}`)

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

          // Parse home team spread (negative means home is favored)
          const homeSpread = parseFloat(homeSpreadText.replace(/[^\d.-]/g, ''))
          if (isNaN(homeSpread)) return

          // Parse win probabilities
          const awayWinProb = parseFloat(awayProbText.replace('%', '').trim())
          const homeWinProb = parseFloat(homeProbText.replace('%', '').trim())

          // Determine predicted winner based on higher win probability
          const predictedWinner: 'home' | 'away' = homeWinProb > awayWinProb ? 'home' : 'away'
          const winProbability = Math.max(awayWinProb, homeWinProb)

          // Use the confidence from the team with higher win probability
          const confidenceText = homeWinProb > awayWinProb ? homeConfidence : awayConfidence
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

      if (predictions.length === 0) {
        throw new Error(`No games found for Week ${week}. The week may not have data yet or the season has ended.`)
      }

      console.log(`Successfully scraped ${predictions.length} predictions for Week ${week}`)

      return {
        success: true,
        predictions,
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
   * Format date for URL (e.g., "October 4" from "2025-10-04")
   */
  private static formatDateForUrl(date: string): string {
    const d = new Date(date + 'T12:00:00Z') // Add time to avoid timezone issues
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]
    return `${months[d.getUTCMonth()]}%20${d.getUTCDate()}`
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
