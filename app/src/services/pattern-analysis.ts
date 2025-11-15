/**
 * Pattern Detection Analysis Service
 *
 * This service analyzes systematic patterns in pool vs market betting, including:
 * - Spread bias detection
 * - League-specific differences
 * - Key number behaviors
 * - Historical performance patterns
 */

import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE environment variables for pattern analysis')
}

const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'afbp' as any }
})

// Key numbers in football
const NFL_KEY_NUMBERS = [3, 7, 10, 14, 4, 6]
const NCAAF_KEY_NUMBERS = [3, 7, 14, 10, 4, 21]

export interface SpreadBiasPattern {
  bias_direction: 'pool_favors_home' | 'pool_favors_away' | 'neutral'
  avg_spread_difference: number
  sample_size: number
  pool_win_rate: number
  market_win_rate: number
  edge_rate: number
}

export interface LeaguePattern {
  league: string
  total_games: number
  avg_spread_diff: number
  pool_cover_rate: number
  market_cover_rate: number
  pool_edge_games: number
  key_number_crossings: number
}

export interface KeyNumberPattern {
  key_number: number
  occurrences: number
  pool_advantage_rate: number
  avg_edge_when_crossed: number
  push_rate_change: number
}

export interface HistoricalSpreadPattern {
  league: string
  spread_bucket: string
  n_games: number
  cover_rate: number
  mean_margin: number
  std_margin: number
  median_margin: number
}

export class PatternAnalysisService {
  /**
   * Analyze spread bias patterns
   * Detects if pool consistently offers better/worse spreads than market
   */
  async analyzeSpreadBias(): Promise<{
    overall: SpreadBiasPattern
    by_league: Record<string, SpreadBiasPattern>
  }> {
    const query = `
      WITH spread_analysis AS (
        SELECT
          league,
          spread_difference,
          pool_pick_covered,
          market_pick_covered,
          pool_had_edge,
          pool_edge_points,
          CASE
            WHEN spread_difference > 0.5 THEN 'pool_favors_home'
            WHEN spread_difference < -0.5 THEN 'pool_favors_away'
            ELSE 'neutral'
          END as bias_direction
        FROM pool_performance_analysis
        WHERE spread_difference IS NOT NULL
      )
      SELECT
        league,
        bias_direction,
        COUNT(*) as sample_size,
        AVG(spread_difference) as avg_spread_difference,
        AVG(CASE WHEN pool_pick_covered THEN 1.0 ELSE 0.0 END) as pool_win_rate,
        AVG(CASE WHEN market_pick_covered THEN 1.0 ELSE 0.0 END) as market_win_rate,
        AVG(CASE WHEN pool_had_edge THEN 1.0 ELSE 0.0 END) as edge_rate
      FROM spread_analysis
      GROUP BY league, bias_direction
      ORDER BY league, bias_direction
    `

    const { data, error } = await supabase.rpc('exec_sql' as any, { sql: query }) as any

    if (error) {
      console.error('Error analyzing spread bias:', error)
      return { overall: this.getEmptySpreadBias(), by_league: {} }
    }

    // Process results
    const by_league: Record<string, SpreadBiasPattern> = {}
    let totalGames = 0
    let totalDiff = 0
    let totalPoolWins = 0
    let totalMarketWins = 0
    let totalEdge = 0

    if (data && Array.isArray(data)) {
      for (const row of data) {
        const pattern: SpreadBiasPattern = {
          bias_direction: row.bias_direction,
          avg_spread_difference: parseFloat(row.avg_spread_difference || 0),
          sample_size: parseInt(row.sample_size || 0),
          pool_win_rate: parseFloat(row.pool_win_rate || 0),
          market_win_rate: parseFloat(row.market_win_rate || 0),
          edge_rate: parseFloat(row.edge_rate || 0)
        }

        by_league[row.league] = pattern

        totalGames += pattern.sample_size
        totalDiff += pattern.avg_spread_difference * pattern.sample_size
        totalPoolWins += pattern.pool_win_rate * pattern.sample_size
        totalMarketWins += pattern.market_win_rate * pattern.sample_size
        totalEdge += pattern.edge_rate * pattern.sample_size
      }
    }

    const overall: SpreadBiasPattern = totalGames > 0
      ? {
          bias_direction: totalDiff / totalGames > 0.5
            ? 'pool_favors_home'
            : totalDiff / totalGames < -0.5
            ? 'pool_favors_away'
            : 'neutral',
          avg_spread_difference: totalDiff / totalGames,
          sample_size: totalGames,
          pool_win_rate: totalPoolWins / totalGames,
          market_win_rate: totalMarketWins / totalGames,
          edge_rate: totalEdge / totalGames
        }
      : this.getEmptySpreadBias()

    return { overall, by_league }
  }

  /**
   * Analyze league-specific patterns
   */
  async analyzeLeaguePatterns(): Promise<LeaguePattern[]> {
    const query = `
      SELECT
        league,
        COUNT(*) as total_games,
        AVG(spread_difference) as avg_spread_diff,
        AVG(CASE WHEN pool_pick_covered THEN 1.0 ELSE 0.0 END) as pool_cover_rate,
        AVG(CASE WHEN market_pick_covered THEN 1.0 ELSE 0.0 END) as market_cover_rate,
        SUM(CASE WHEN pool_had_edge THEN 1 ELSE 0 END) as pool_edge_games,
        SUM(jsonb_array_length(key_numbers_crossed)) as key_number_crossings
      FROM pool_performance_analysis
      WHERE league IS NOT NULL
      GROUP BY league
      ORDER BY league
    `

    const { data, error } = await supabase.rpc('exec_sql' as any, { sql: query }) as any

    if (error || !data) {
      console.error('Error analyzing league patterns:', error)
      return []
    }

    return (data as any[]).map(row => ({
      league: row.league,
      total_games: parseInt(row.total_games || 0),
      avg_spread_diff: parseFloat(row.avg_spread_diff || 0),
      pool_cover_rate: parseFloat(row.pool_cover_rate || 0),
      market_cover_rate: parseFloat(row.market_cover_rate || 0),
      pool_edge_games: parseInt(row.pool_edge_games || 0),
      key_number_crossings: parseInt(row.key_number_crossings || 0)
    }))
  }

  /**
   * Analyze key number behaviors
   */
  async analyzeKeyNumbers(league: 'NFL' | 'NCAAF' = 'NFL'): Promise<KeyNumberPattern[]> {
    const keyNumbers = league === 'NFL' ? NFL_KEY_NUMBERS : NCAAF_KEY_NUMBERS

    const query = `
      WITH key_number_analysis AS (
        SELECT
          spread_difference,
          key_numbers_crossed,
          pool_had_edge,
          pool_edge_points,
          jsonb_array_length(key_numbers_crossed) > 0 as has_crossing
        FROM pool_performance_analysis
        WHERE league = $1
          AND key_numbers_crossed IS NOT NULL
      )
      SELECT
        jsonb_array_elements_text(key_numbers_crossed)::int as key_number,
        COUNT(*) as occurrences,
        AVG(CASE WHEN pool_had_edge THEN 1.0 ELSE 0.0 END) as pool_advantage_rate,
        AVG(pool_edge_points) as avg_edge_when_crossed
      FROM key_number_analysis
      WHERE has_crossing
      GROUP BY key_number
      ORDER BY occurrences DESC
    `

    // Replace parameterized query with direct substitution for now
    const finalQuery = query.replace('$1', `'${league}'`)
    const { data, error } = await supabase.rpc('exec_sql' as any, { sql: finalQuery }) as any

    if (error || !data) {
      console.error('Error analyzing key numbers:', error)
      // Return empty analysis for configured key numbers
      return keyNumbers.map(kn => ({
        key_number: kn,
        occurrences: 0,
        pool_advantage_rate: 0,
        avg_edge_when_crossed: 0,
        push_rate_change: 0
      }))
    }

    return (data as any[]).map(row => ({
      key_number: parseInt(row.key_number),
      occurrences: parseInt(row.occurrences || 0),
      pool_advantage_rate: parseFloat(row.pool_advantage_rate || 0),
      avg_edge_when_crossed: parseFloat(row.avg_edge_when_crossed || 0),
      push_rate_change: 0 // TODO: Calculate push probability change
    }))
  }

  /**
   * Analyze historical spread bucket patterns
   */
  async analyzeHistoricalSpreadBuckets(league?: 'NFL' | 'NCAAF'): Promise<HistoricalSpreadPattern[]> {
    const query = `
      SELECT
        league,
        CASE
          WHEN spread BETWEEN -3 AND 3 THEN 'Field Goal'
          WHEN spread BETWEEN -7 AND -3.5 THEN 'Small Favorite'
          WHEN spread BETWEEN -10 AND -7.5 THEN 'Touchdown Favorite'
          WHEN spread BETWEEN -14 AND -10.5 THEN 'Medium Favorite'
          WHEN spread < -14 THEN 'Heavy Favorite'
          WHEN spread BETWEEN 3.5 AND 7 THEN 'Small Underdog'
          WHEN spread BETWEEN 7.5 AND 10 THEN 'Touchdown Underdog'
          WHEN spread BETWEEN 10.5 AND 14 THEN 'Medium Underdog'
          WHEN spread > 14 THEN 'Heavy Underdog'
          ELSE 'Unknown'
        END as spread_bucket,
        COUNT(*) as n_games,
        AVG(CASE WHEN favorite_covered THEN 1.0 ELSE 0.0 END) as cover_rate,
        AVG(actual_margin) as mean_margin,
        STDDEV(actual_margin) as std_margin,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY actual_margin) as median_margin
      FROM afbp.historical_games
      WHERE spread IS NOT NULL
        AND actual_margin IS NOT NULL
        ${league ? `AND league = '${league}'` : ''}
      GROUP BY league, spread_bucket
      ORDER BY league, n_games DESC
    `

    const { data, error } = await supabase.rpc('exec_sql' as any, { sql: query }) as any

    if (error || !data) {
      console.error('Error analyzing historical spread buckets:', error)
      return []
    }

    return (data as any[]).map(row => ({
      league: row.league,
      spread_bucket: row.spread_bucket,
      n_games: parseInt(row.n_games || 0),
      cover_rate: parseFloat(row.cover_rate || 0),
      mean_margin: parseFloat(row.mean_margin || 0),
      std_margin: parseFloat(row.std_margin || 0),
      median_margin: parseFloat(row.median_margin || 0)
    }))
  }

  /**
   * Get comprehensive pattern analysis
   */
  async getComprehensiveAnalysis(league?: 'NFL' | 'NCAAF') {
    const [spreadBias, leaguePatterns, historicalBuckets] = await Promise.all([
      this.analyzeSpreadBias(),
      this.analyzeLeaguePatterns(),
      this.analyzeHistoricalSpreadBuckets(league)
    ])

    const keyNumberPatterns = league
      ? await this.analyzeKeyNumbers(league)
      : {
          NFL: await this.analyzeKeyNumbers('NFL'),
          NCAAF: await this.analyzeKeyNumbers('NCAAF')
        }

    return {
      spread_bias: spreadBias,
      league_patterns: leaguePatterns,
      key_numbers: keyNumberPatterns,
      historical_spread_buckets: historicalBuckets,
      generated_at: new Date().toISOString()
    }
  }

  private getEmptySpreadBias(): SpreadBiasPattern {
    return {
      bias_direction: 'neutral',
      avg_spread_difference: 0,
      sample_size: 0,
      pool_win_rate: 0,
      market_win_rate: 0,
      edge_rate: 0
    }
  }
}

// Export singleton instance
export const patternAnalysis = new PatternAnalysisService()
