import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { usePageTitle } from '../../store/pageTitleContext'
import { Users, Database, Shield, ClipboardList, Mail } from 'lucide-react'
import UsersTab from './UsersTab'
import DataInputTab from './DataInputTab'
import SafetyMeasuresTab from './SafetyMeasuresTab'
import EaseCriteriaTab from './EaseCriteriaTab'
import EmailSettingsTab from './EmailSettingsTab'

const TABS = [
  { to: '/admin', label: 'Users', icon: Users, exact: true },
  { to: '/admin/data', label: 'Data Input', icon: Database },
  { to: '/admin/safety', label: 'Safety Measures', icon: Shield },
  { to: '/admin/ease-criteria', label: 'SHE Criteria', icon: ClipboardList },
  { to: '/admin/email', label: 'Email Settings', icon: Mail },
]

export default function Admin() {
  const loc = useLocation()
  usePageTitle('Admin Panel', 'Manage users, projects, reference data, and SHE evaluation criteria')
  return (
    <div className="space-y-6">
      <div className="lg:hidden">
        <h1 className="page-title">Admin Panel</h1>
        <p className="text-sm text-gray-400 mt-1">Manage users, projects, reference data, and SHE evaluation criteria</p>
      </div>

      {/* Tab bar — horizontally scrollable on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-0.5 sm:pb-0">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl w-fit min-w-max">
          {TABS.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? loc.pathname === to : loc.pathname.startsWith(to)
            return (
              <NavLink
                key={to}
                to={to}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 whitespace-nowrap flex-shrink-0 ${
                  active
                    ? 'bg-white shadow-sm text-indigo-700'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                {label}
              </NavLink>
            )
          })}
        </div>
      </div>

      <Routes>
        <Route index element={<UsersTab />} />
        <Route path="data" element={<DataInputTab />} />
        <Route path="safety" element={<SafetyMeasuresTab />} />
        <Route path="ease-criteria" element={<EaseCriteriaTab />} />
        <Route path="email" element={<EmailSettingsTab />} />
      </Routes>
    </div>
  )
}
