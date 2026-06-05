import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  return (
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
        <main className="flex-1 overflow-auto p-4 md:p-6 thin-scroll main-scroll">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
