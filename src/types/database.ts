export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      teams: {
        Row: {
          id: string
          league: 'NFL' | 'NCAAF'
          name_canonical: string
          aliases: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          league: 'NFL' | 'NCAAF'
          name_canonical: string
          aliases?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          league?: 'NFL' | 'NCAAF'
          name_canonical?: string
          aliases?: Json
          created_at?: string
          updated_at?: string
        }
      }
      events: {
        Row: {
          id: string
          provider_event_id: string | null
          league: 'NFL' | 'NCAAF'
          home_team: string | null
          away_team: string | null
          start_time_utc: string
          week_number: number | null
          season_year: number | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          provider_event_id?: string | null
          league: 'NFL' | 'NCAAF'
          home_team?: string | null
          away_team?: string | null
          start_time_utc: string
          week_number?: number | null
          season_year?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          provider_event_id?: string | null
          league?: 'NFL' | 'NCAAF'
          home_team?: string | null
          away_team?: string | null
          start_time_utc?: string
          week_number?: number | null
          season_year?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
      picks_rows: {
        Row: {
          id: string
          source_run_id: string | null
          league: 'NFL' | 'NCAAF' | null
          event_date_local: string | null
          event_time_local: string | null
          home_name_raw: string
          away_name_raw: string
          home_spread_raw: number | null
          away_spread_raw: number | null
          total_raw: number | null
          market: string
          raw_text: string | null
          parsed_at: string
          metadata: Json
        }
        Insert: {
          id?: string
          source_run_id?: string | null
          league?: 'NFL' | 'NCAAF' | null
          event_date_local?: string | null
          event_time_local?: string | null
          home_name_raw: string
          away_name_raw: string
          home_spread_raw?: number | null
          away_spread_raw?: number | null
          total_raw?: number | null
          market?: string
          raw_text?: string | null
          parsed_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          source_run_id?: string | null
          league?: 'NFL' | 'NCAAF' | null
          event_date_local?: string | null
          event_time_local?: string | null
          home_name_raw?: string
          away_name_raw?: string
          home_spread_raw?: number | null
          away_spread_raw?: number | null
          total_raw?: number | null
          market?: string
          raw_text?: string | null
          parsed_at?: string
          metadata?: Json
        }
      }
      odds_snapshots: {
        Row: {
          id: string
          event_id: string | null
          event_provider_key: string | null
          book: string
          market: string
          home_spread: number | null
          away_spread: number | null
          home_ml: number | null
          away_ml: number | null
          total: number | null
          over_price: number | null
          under_price: number | null
          prices: Json
          fetched_at: string
        }
        Insert: {
          id?: string
          event_id?: string | null
          event_provider_key?: string | null
          book: string
          market?: string
          home_spread?: number | null
          away_spread?: number | null
          home_ml?: number | null
          away_ml?: number | null
          total?: number | null
          over_price?: number | null
          under_price?: number | null
          prices?: Json
          fetched_at?: string
        }
        Update: {
          id?: string
          event_id?: string | null
          event_provider_key?: string | null
          book?: string
          market?: string
          home_spread?: number | null
          away_spread?: number | null
          home_ml?: number | null
          away_ml?: number | null
          total?: number | null
          over_price?: number | null
          under_price?: number | null
          prices?: Json
          fetched_at?: string
        }
      }
      matches: {
        Row: {
          id: string
          picks_row_id: string | null
          event_id: string | null
          confidence: number
          method: string | null
          matched_at: string
          notes: string | null
          is_manual_override: boolean
          override_by: string | null
        }
        Insert: {
          id?: string
          picks_row_id?: string | null
          event_id?: string | null
          confidence?: number
          method?: string | null
          matched_at?: string
          notes?: string | null
          is_manual_override?: boolean
          override_by?: string | null
        }
        Update: {
          id?: string
          picks_row_id?: string | null
          event_id?: string | null
          confidence?: number
          method?: string | null
          matched_at?: string
          notes?: string | null
          is_manual_override?: boolean
          override_by?: string | null
        }
      }
      comparisons: {
        Row: {
          id: string
          match_id: string | null
          odds_snapshot_id: string | null
          spread_delta_home: number | null
          spread_delta_away: number | null
          total_delta: number | null
          key_numbers_crossed: Json
          computed_at: string
        }
        Insert: {
          id?: string
          match_id?: string | null
          odds_snapshot_id?: string | null
          spread_delta_home?: number | null
          spread_delta_away?: number | null
          total_delta?: number | null
          key_numbers_crossed?: Json
          computed_at?: string
        }
        Update: {
          id?: string
          match_id?: string | null
          odds_snapshot_id?: string | null
          spread_delta_home?: number | null
          spread_delta_away?: number | null
          total_delta?: number | null
          key_numbers_crossed?: Json
          computed_at?: string
        }
      }
      kpi_daily: {
        Row: {
          id: string
          date: string
          league: 'NFL' | 'NCAAF' | 'ALL'
          book: string | null
          coverage_rate: number | null
          avg_abs_delta: number | null
          median_abs_delta: number | null
          p95_abs_delta: number | null
          unmatched_count: number | null
          total_picks_count: number | null
          key_crossings_count: number | null
          metadata: Json
          computed_at: string
        }
        Insert: {
          id?: string
          date: string
          league?: 'NFL' | 'NCAAF' | 'ALL'
          book?: string | null
          coverage_rate?: number | null
          avg_abs_delta?: number | null
          median_abs_delta?: number | null
          p95_abs_delta?: number | null
          unmatched_count?: number | null
          total_picks_count?: number | null
          key_crossings_count?: number | null
          metadata?: Json
          computed_at?: string
        }
        Update: {
          id?: string
          date?: string
          league?: 'NFL' | 'NCAAF' | 'ALL'
          book?: string | null
          coverage_rate?: number | null
          avg_abs_delta?: number | null
          median_abs_delta?: number | null
          p95_abs_delta?: number | null
          unmatched_count?: number | null
          total_picks_count?: number | null
          key_crossings_count?: number | null
          metadata?: Json
          computed_at?: string
        }
      }
      alias_overrides: {
        Row: {
          id: string
          league: 'NFL' | 'NCAAF'
          raw_name: string
          canonical_team_id: string | null
          created_by: string | null
          created_at: string
          is_active: boolean
        }
        Insert: {
          id?: string
          league: 'NFL' | 'NCAAF'
          raw_name: string
          canonical_team_id?: string | null
          created_by?: string | null
          created_at?: string
          is_active?: boolean
        }
        Update: {
          id?: string
          league?: 'NFL' | 'NCAAF'
          raw_name?: string
          canonical_team_id?: string | null
          created_by?: string | null
          created_at?: string
          is_active?: boolean
        }
      }
      job_runs: {
        Row: {
          id: string
          job_type: string
          source_file_name: string | null
          started_at: string
          ended_at: string | null
          status: 'running' | 'completed' | 'failed' | 'cancelled'
          counts: Json
          errors: Json
          metadata: Json
        }
        Insert: {
          id?: string
          job_type: string
          source_file_name?: string | null
          started_at?: string
          ended_at?: string | null
          status?: 'running' | 'completed' | 'failed' | 'cancelled'
          counts?: Json
          errors?: Json
          metadata?: Json
        }
        Update: {
          id?: string
          job_type?: string
          source_file_name?: string | null
          started_at?: string
          ended_at?: string | null
          status?: 'running' | 'completed' | 'failed' | 'cancelled'
          counts?: Json
          errors?: Json
          metadata?: Json
        }
      }
    }
  }
}