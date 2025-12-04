/**
 * Supabase-backed job queue for async pipeline execution
 * Works in serverless environments where in-memory state isn't shared
 */

import { createClient } from '@supabase/supabase-js'

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export interface Job<TInput = any, TResult = any> {
  id: string
  status: JobStatus
  progress: number
  stage: string
  input: TInput
  result?: TResult
  error?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  logs: string[]
}

// Create a client specifically for the public schema (pipeline_jobs table)
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase credentials not configured')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: 'public' }
  })
}

class SupabaseJobQueue {
  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  /**
   * Create a new job
   */
  async createJob<TInput>(input: TInput): Promise<string> {
    const jobId = this.generateJobId()
    const supabase = getSupabaseClient()

    const { error } = await supabase
      .from('pipeline_jobs')
      .insert({
        id: jobId,
        status: 'queued',
        progress: 0,
        stage: 'queued',
        input: input as any,
        logs: [],
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour
      })

    if (error) {
      console.error('Failed to create job:', error)
      throw new Error(`Failed to create job: ${error.message}`)
    }

    console.log(`[JOB-QUEUE] Created job ${jobId}`)
    return jobId
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<Job | null> {
    const supabase = getSupabaseClient()

    const { data, error } = await supabase
      .from('pipeline_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null
      }
      console.error('Failed to get job:', error)
      throw new Error(`Failed to get job: ${error.message}`)
    }

    return {
      id: data.id,
      status: data.status as JobStatus,
      progress: data.progress,
      stage: data.stage,
      input: data.input,
      result: data.result,
      error: data.error ?? undefined,
      createdAt: data.created_at,
      startedAt: data.started_at ?? undefined,
      completedAt: data.completed_at ?? undefined,
      logs: data.logs ?? []
    }
  }

  /**
   * Update job
   */
  async updateJob(
    jobId: string,
    updates: Partial<Pick<Job, 'status' | 'progress' | 'stage' | 'result' | 'error' | 'startedAt' | 'completedAt'>>
  ): Promise<void> {
    const supabase = getSupabaseClient()

    const dbUpdates: Record<string, any> = {}
    if (updates.status !== undefined) dbUpdates.status = updates.status
    if (updates.progress !== undefined) dbUpdates.progress = updates.progress
    if (updates.stage !== undefined) dbUpdates.stage = updates.stage
    if (updates.result !== undefined) dbUpdates.result = updates.result
    if (updates.error !== undefined) dbUpdates.error = updates.error
    if (updates.startedAt !== undefined) dbUpdates.started_at = updates.startedAt
    if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt

    const { error } = await supabase
      .from('pipeline_jobs')
      .update(dbUpdates)
      .eq('id', jobId)

    if (error) {
      console.error('Failed to update job:', error)
    }
  }

  /**
   * Add log entry to job
   */
  async addLog(jobId: string, message: string): Promise<void> {
    const supabase = getSupabaseClient()
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ${message}`

    // Fetch current logs, append, and update
    const { data } = await supabase
      .from('pipeline_jobs')
      .select('logs')
      .eq('id', jobId)
      .single()

    const logs = [...(data?.logs ?? []), logEntry]

    const { error } = await supabase
      .from('pipeline_jobs')
      .update({ logs })
      .eq('id', jobId)

    if (error) {
      console.warn('Failed to add log:', error)
    }
  }

  /**
   * Mark job as started
   */
  async startJob(jobId: string): Promise<void> {
    console.log(`[JOB-QUEUE] Starting job ${jobId}`)
    await this.updateJob(jobId, {
      status: 'processing',
      startedAt: new Date().toISOString(),
      progress: 0,
      stage: 'initializing'
    })
  }

  /**
   * Mark job as completed
   */
  async completeJob<TResult>(jobId: string, result: TResult): Promise<void> {
    console.log(`[JOB-QUEUE] Job ${jobId} completed`)
    await this.updateJob(jobId, {
      status: 'completed',
      result,
      completedAt: new Date().toISOString(),
      progress: 100,
      stage: 'completed'
    })
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId: string, error: string): Promise<void> {
    console.error(`[JOB-QUEUE] Job ${jobId} failed: ${error}`)
    await this.updateJob(jobId, {
      status: 'failed',
      error,
      completedAt: new Date().toISOString(),
      stage: 'failed'
    })
  }
}

// Export singleton instance
export const supabaseJobQueue = new SupabaseJobQueue()
