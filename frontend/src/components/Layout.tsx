import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import Sidebar from './Sidebar'
import Header from './Header'
import { PageTitleProvider } from '../store/pageTitleContext'

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const loc = useLocation()
  // Legacy Data is a wide embedded dashboard — let it use the full content area
  // (no max-width cap, no padding) instead of the standard constrained page layout.
  const fullBleed = loc.pathname.startsWith('/legacy-data')

  // SHE Report is wide and docks its own filter rail — auto-collapse the nav sidebar
  // on entry (remembering the prior state) and restore it on leave. Fires only on the
  // enter/leave transition, so a manual expand while on the report isn't overridden.
  const isReport = loc.pathname.startsWith('/report')
  const prevCollapsed = useRef<boolean | null>(null)
  useEffect(() => {
    if (isReport) {
      if (prevCollapsed.current === null) prevCollapsed.current = collapsed
      setCollapsed(true)
    } else if (prevCollapsed.current !== null) {
      setCollapsed(prevCollapsed.current)
      prevCollapsed.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReport])

  return (
    <PageTitleProvider>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(c => !c)}
        />
        {/*
          transition-[width,min-width,max-width] ensures the content area
          smoothly fills the freed space when the sidebar collapses.
          flex-1 + min-w-0 handle the flex auto-sizing; the transition
          mirrors the sidebar's 300 ms animation.
        */}
        <div
          className="flex flex-col min-w-0 overflow-hidden transition-all duration-300 ease-in-out"
          style={{ flex: '1 1 0%' }}
        >
          <Header onMenu={() => setMobileOpen(o => !o)} />
          <main className={`flex-1 overflow-auto thin-scroll main-scroll ${fullBleed ? '' : 'p-4 md:p-6 pb-20 lg:pb-6'}`}>
            {fullBleed ? (
              <Outlet />
            ) : (
              // When the sidebar is collapsed, drop the max-width cap so pages use the
              // freed horizontal space; when expanded, keep the standard constrained width.
              <div className={`mx-auto ${collapsed ? 'max-w-none' : 'max-w-7xl'}`}>
                <Outlet />
              </div>
            )}
          </main>
        </div>

        {/* Ambuja logo — mobile only, pinned to bottom */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-sm border-t border-gray-100 shadow-[0_-1px_4px_rgba(0,0,0,0.05)] flex items-center justify-center py-1.5">
          <img src="/ambuja-logo.png" alt="Ambuja" className="h-5 w-auto object-contain opacity-70" />
        </div>
      </div>
      <Toaster position="top-right" richColors closeButton duration={4000} />
    </PageTitleProvider>
  )
}
