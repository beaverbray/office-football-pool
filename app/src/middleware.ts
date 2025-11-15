import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// List of test pages that should only be accessible in development
const TEST_PAGES = [
  '/test',
  '/comparison-test',
  '/entity-test',
  '/integration-test',
  '/llm-test',
  '/odds-test',
  '/api/test-openai',
  '/api/test-parse'
]

export function middleware(request: NextRequest) {
  // Only block test pages in production
  if (process.env.NODE_ENV === 'production') {
    const pathname = request.nextUrl.pathname

    // Check if the current path is a test page
    if (TEST_PAGES.some(testPage => pathname.startsWith(testPage))) {
      // Return 404 in production for test pages
      return new NextResponse(null, { status: 404 })
    }
  }

  // Allow all other requests to proceed
  return NextResponse.next()
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}