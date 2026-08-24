import { ArrowLeft, Clock3, History, Timer } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, EmptyState, PageHeader, StatCard } from '../components/ui'
import { api, formatDateTime, formatDuration } from '../lib/api'

export default function PersonPage() {
  const { id } = useParams(); const [data, setData] = useState(null)
  useEffect(() => { api(`/api/people/${id}`).then(setData).catch(() => {}) }, [id])
  if (!data) return <div className="loading-page">Loading person…</div>
  return <><PageHeader eyebrow={<Link to="/people"><ArrowLeft size={14}/> People</Link>} title={data.name} description={data.externalId || 'Registered identity'} /><div className="stat-grid three"><StatCard label="Total presence" value={formatDuration(data.totalDurationSeconds)} detail="All recorded visits" icon={Timer} tone="blue"/><StatCard label="Visits" value={data.visits} detail="All cameras" icon={History} tone="green"/><StatCard label="Face profiles" value={data.faceCount} detail="Enrollment samples" icon={Clock3} tone="violet"/></div><Card><div className="card-header"><div><h2>Session history</h2><p>Most recent visits</p></div></div>{data.sessions.length ? <div className="table-scroll"><table><thead><tr><th>Camera</th><th>Entered</th><th>Exited</th><th>Duration</th><th>Status</th></tr></thead><tbody>{data.sessions.map((session) => <tr key={session.id}><td>{session.cameraId}</td><td>{formatDateTime(session.startedAt)}</td><td>{formatDateTime(session.endedAt)}</td><td className="mono">{formatDuration(session.durationSeconds)}</td><td><span className={`pill ${session.status === 'active' ? 'success' : ''}`}>{session.status}</span></td></tr>)}</tbody></table></div> : <EmptyState/>}</Card></>
}
