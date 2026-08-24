import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'

const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const CamerasPage = lazy(() => import('./pages/CamerasPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const LivePage = lazy(() => import('./pages/LivePage'))
const PeoplePage = lazy(() => import('./pages/PeoplePage'))
const PersonPage = lazy(() => import('./pages/PersonPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

export default function App() {
  return <Suspense fallback={<div className="loading-page">Loading…</div>}><Routes><Route element={<Layout/>}><Route index element={<Navigate to="/dashboard" replace/>}/><Route path="/dashboard" element={<DashboardPage/>}/><Route path="/live" element={<LivePage/>}/><Route path="/people" element={<PeoplePage/>}/><Route path="/people/:id" element={<PersonPage/>}/><Route path="/history" element={<HistoryPage/>}/><Route path="/analytics" element={<AnalyticsPage/>}/><Route path="/cameras" element={<CamerasPage/>}/><Route path="/settings" element={<SettingsPage/>}/></Route></Routes></Suspense>
}
