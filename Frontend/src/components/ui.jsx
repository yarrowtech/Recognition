import { AlertCircle, Inbox } from 'lucide-react'

export function PageHeader({ eyebrow, title, description, actions }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="header-actions">{actions}</div>}</header>
}
export function Card({ className = '', children }) { return <section className={`card ${className}`}>{children}</section> }
export function CardHeader({ title, subtitle, action }) { return <div className="card-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div> }
export function StatCard({ label, value, detail, icon: Icon, tone = '' }) { return <Card className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19} /></div><div><p>{label}</p><strong>{value}</strong><span>{detail}</span></div></Card> }
export function Status({ online, children }) { return <span className={`status ${online ? 'is-online' : ''}`}><i />{children}</span> }
export function EmptyState({ title = 'No data yet', text = 'Activity will appear here once monitoring starts.' }) { return <div className="empty"><Inbox size={28} /><strong>{title}</strong><p>{text}</p></div> }
export function ErrorBanner({ message }) { return message ? <div className="error-banner"><AlertCircle size={17} />{message}</div> : null }
