import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
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
  { to: '/admin/ease-criteria', label: 'EASE Criteria', icon: ClipboardList },
  { to: '/admin/email', label: 'Email Settings', icon: Mail },
]

export default function Admin() {
  const loc = useLocation()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Admin Panel</h1>
        <p className="text-sm text-gray-400 mt-1">Manage users, projects, reference data, and EASE evaluation criteria</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-2xl w-fit flex-wrap">
        {TABS.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? loc.pathname === to : loc.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                active
                  ? 'bg-white shadow-sm text-indigo-700'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          )
        })}
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
