/**
 * Simple in-memory job queue for async pipeline execution
 * For production, replace with Redis/Bull or a proper queue service
 */

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export interface Job<TInput = any, TResult = any> {
  id: string
  status: JobStatus
  progress: number // 0-100
  stage: string
  input: TInput
  result?: TResult
  error?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  logs: string[]
}

class JobQueue {
  private jobs: Map<string, Job> = new Map()
  private maxJobs = 100 // Keep last 100 jobs in memory
  private readonly JOB_TTL = 3600000 // 1 hour

  /**
   * Create a new job
   */
  createJob<TInput>(input: TInput): string {
    const jobId = this.generateJobId()

    const job: Job<TInput> = {
      id: jobId,
      status: 'queued',
      progress: 0,
      stage: 'queued',
      input,
      createdAt: new Date().toISOString(),
      logs: []
    }

    this.jobs.set(jobId, job)
    this.cleanupOldJobs()

    console.log(`📋 [JOB-QUEUE] Created job ${jobId}`)

    return jobId
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId)
  }

  /**
   * Update job status
   */
  updateJob(
    jobId: string,
    updates: Partial<Pick<Job, 'status' | 'progress' | 'stage' | 'result' | 'error' | 'startedAt' | 'completedAt'>>
  ): void {
    const job = this.jobs.get(jobId)
    if (!job) {
      console.warn(`Job ${jobId} not found for update`)
      return
    }

    Object.assign(job, updates)
    this.jobs.set(jobId, job)
  }

  /**
   * Add log entry to job
   */
  addLog(jobId: string, message: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return

    const timestamp = new Date().toISOString()
    job.logs.push(`[${timestamp}] ${message}`)
    this.jobs.set(jobId, job)
  }

  /**
   * Mark job as started
   */
  startJob(jobId: string): void {
    console.log(`▶️  [JOB-QUEUE] Starting job ${jobId}`)
    this.updateJob(jobId, {
      status: 'processing',
      startedAt: new Date().toISOString(),
      progress: 0,
      stage: 'initializing'
    })
  }

  /**
   * Mark job as completed
   */
  completeJob<TResult>(jobId: string, result: TResult): void {
    const job = this.jobs.get(jobId)
    if (job && job.startedAt) {
      const duration = Date.now() - new Date(job.startedAt).getTime()
      console.log(`✅ [JOB-QUEUE] Job ${jobId} completed in ${duration}ms`)
    }

    this.updateJob(jobId, {
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
  failJob(jobId: string, error: string): void {
    const job = this.jobs.get(jobId)
    if (job && job.startedAt) {
      const duration = Date.now() - new Date(job.startedAt).getTime()
      console.error(`❌ [JOB-QUEUE] Job ${jobId} failed after ${duration}ms: ${error}`)
    }

    this.updateJob(jobId, {
      status: 'failed',
      error,
      completedAt: new Date().toISOString(),
      stage: 'failed'
    })
  }

  /**
   * Get all jobs (for debugging)
   */
  getAllJobs(): Job[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  /**
   * Clear all jobs (for testing)
   */
  clearAll(): void {
    this.jobs.clear()
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  /**
   * Clean up old jobs to prevent memory leaks
   */
  private cleanupOldJobs(): void {
    if (this.jobs.size <= this.maxJobs) return

    const jobs = Array.from(this.jobs.entries())
      .sort(([, a], [, b]) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )

    // Keep only the most recent maxJobs
    const toDelete = jobs.slice(this.maxJobs)
    toDelete.forEach(([id]) => this.jobs.delete(id))

    if (toDelete.length > 0) {
      console.log(`Cleaned up ${toDelete.length} old jobs`)
    }
  }

  /**
   * Clean up jobs older than TTL
   */
  cleanupExpiredJobs(): void {
    const now = Date.now()
    const expired: string[] = []

    this.jobs.forEach((job, id) => {
      const createdAt = new Date(job.createdAt).getTime()
      if (now - createdAt > this.JOB_TTL) {
        expired.push(id)
      }
    })

    expired.forEach(id => this.jobs.delete(id))

    if (expired.length > 0) {
      console.log(`Cleaned up ${expired.length} expired jobs`)
    }
  }
}

// Use global variable to ensure singleton persists across hot reloads in development
// This prevents different API routes from getting different instances
const globalForJobQueue = globalThis as unknown as {
  jobQueue: JobQueue | undefined
}

// Export singleton instance
export const jobQueue = globalForJobQueue.jobQueue ?? new JobQueue()

// Store in global to persist across hot reloads
if (!globalForJobQueue.jobQueue) {
  globalForJobQueue.jobQueue = jobQueue

  // Clean up expired jobs every 5 minutes (only initialize once)
  if (typeof setInterval !== 'undefined') {
    setInterval(() => {
      jobQueue.cleanupExpiredJobs()
    }, 300000) // 5 minutes
  }
}
