import { NextRequest, NextResponse } from 'next/server'
import { jobQueue } from '@/services/job-queue'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json(
        { error: 'jobId parameter is required' },
        { status: 400 }
      )
    }

    const job = jobQueue.getJob(jobId)

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found', jobId },
        { status: 404 }
      )
    }

    // Return job status without sensitive input data
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      stage: job.stage,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      logs: job.logs
    })

  } catch (error) {
    console.error('Status check error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      { error: 'Failed to check job status', message: errorMessage },
      { status: 500 }
    )
  }
}
