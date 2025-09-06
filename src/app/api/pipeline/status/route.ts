import { NextRequest, NextResponse } from 'next/server'
import { pipelineOrchestrator } from '@/services/pipeline-orchestrator'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const pipelineId = searchParams.get('id')

  if (pipelineId) {
    // Get specific pipeline result
    const result = pipelineOrchestrator.getPipelineResult(pipelineId)
    
    if (!result) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      pipeline: result
    })
  }

  // Get all pipeline results
  const results = pipelineOrchestrator.getAllResults()
  
  return NextResponse.json({
    success: true,
    pipelines: results,
    total: results.length,
    currentStage: pipelineOrchestrator.getCurrentStage()
  })
}

// Clear pipeline history
export async function DELETE(request: NextRequest) {
  pipelineOrchestrator.clearResults()
  
  return NextResponse.json({
    success: true,
    message: 'Pipeline history cleared'
  })
}