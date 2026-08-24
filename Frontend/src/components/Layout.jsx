import { Activity, BarChart3, Camera, Clock3, Gauge, Settings, Users, Video } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

const navigation = [
  ['Dashboard', '/dashboard', Gauge], ['Live monitor', '/live', Video], ['People', '/people', Users],
  ['History', '/history', Clock3], ['Analytics', '/analytics', BarChart3], ['Cameras', '/cameras', Camera],
]

export default function Layout() {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Activity size={20} /></span><div>Sentinel<span>Vision</span></div></div>
      <nav>{navigation.map(([label, to, Icon]) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><NavLink to="/settings"><Settings size={18} /><span>Settings</span></NavLink><div className="privacy-note"><span className="status-dot online" />Frames processed in memory</div></div>
    </aside>
    <main className="main"><Outlet /></main>
  </div>
}
