'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

interface NavBarProps {
  onShare?: () => void
  sharing?: boolean
  showShareButton?: boolean
}

export default function NavBar({ onShare, sharing = false, showShareButton = false }: NavBarProps = {}) {
  const pathname = usePathname()
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  
  const isActive = (path: string) => pathname === path
  
  return (
    <div className="bg-zinc-900 border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <div>
              <h1 className="text-sm sm:text-xl font-mono font-bold text-orange-700">
                SPREAD_ANALYSIS_SYSTEM
              </h1>
              <p className="hidden sm:block text-xs font-mono text-gray-500">
                PICKSHEET_MARKET_COMPARISON_ENGINE | V1.0
              </p>
            </div>
            
            <nav className="hidden sm:flex items-center gap-1">
              <Link
                href="/"
                className={`px-4 py-2 text-sm font-mono rounded transition-colors ${
                  isActive('/') 
                    ? 'bg-orange-700 text-black font-bold' 
                    : 'text-gray-400 hover:text-gray-200 hover:bg-zinc-800'
                }`}
              >
                DASHBOARD
              </Link>
              <Link
                href="/control-panel"
                className={`px-4 py-2 text-sm font-mono rounded transition-colors ${
                  isActive('/control-panel') 
                    ? 'bg-orange-700 text-black font-bold' 
                    : 'text-gray-400 hover:text-gray-200 hover:bg-zinc-800'
                }`}
              >
                CONTROL_PANEL
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Share Button - Desktop */}
            {showShareButton && (
              <button
                onClick={onShare}
                disabled={sharing}
                className="hidden sm:block px-3 py-1 bg-orange-700 text-black font-mono text-xs font-bold rounded hover:bg-orange-600 disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors"
              >
                {sharing ? 'SHARING...' : 'SHARE'}
              </button>
            )}
            
            {/* Mobile Menu Button */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="sm:hidden p-2 text-gray-400 hover:text-orange-700 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showMobileMenu ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {showMobileMenu && (
          <div className="sm:hidden pb-4 border-t border-zinc-800 mt-2 pt-2">
            <Link
              href="/"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-4 py-2 text-sm font-mono rounded transition-colors mb-1 ${
                isActive('/') 
                  ? 'bg-orange-700 text-black font-bold' 
                  : 'text-gray-400 hover:text-gray-200 hover:bg-zinc-800'
              }`}
            >
              DASHBOARD
            </Link>
            <Link
              href="/control-panel"
              onClick={() => setShowMobileMenu(false)}
              className={`block px-4 py-2 text-sm font-mono rounded transition-colors ${
                isActive('/control-panel') 
                  ? 'bg-orange-700 text-black font-bold' 
                  : 'text-gray-400 hover:text-gray-200 hover:bg-zinc-800'
              }`}
            >
              CONTROL_PANEL
            </Link>
            {showShareButton && (
              <button
                onClick={onShare}
                disabled={sharing}
                className="block w-full text-left px-4 py-2 text-sm font-mono rounded transition-colors bg-orange-700 text-black font-bold"
              >
                {sharing ? 'SHARING...' : 'SHARE'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}