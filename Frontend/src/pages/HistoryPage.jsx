import { Download, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card, EmptyState, PageHeader } from '../components/ui'
import { api, formatDateTime, formatDuration } from '../lib/api'

export default function HistoryPage() {
  const [rows, setRows] = useState([]); const [query, setQuery] = useState('')
  useEffect(() => { api('/api/sessions?limit=100').then(setRows).catch(() => {}) }, [])
  const shown = rows.filter((item) => item.person.toLowerCase().includes(query.toLowerCase()))
  return <><PageHeader eyebrow="Records" title="Presence history" description="Search known and unknown visits across all monitored cameras." actions={<button className="button subtle" onClick={() => window.print()}><Download size={16}/>Export view</button>}/><Card><div className="table-tools"><label className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by person…"/></label><span>{shown.length} sessions</span></div>{shown.length ? <div className="table-scroll"><table><thead><tr><th>Person</th><th>Camera</th><th>Entered</th><th>Exited</th><th>Duration</th><th>Status</th></tr></thead><tbody>{shown.map((row) => <tr key={row.id}><td><span className="person-cell"><span className={`avatar ${row.personId ? '' : 'muted'}`}>{row.person.slice(0, 1)}</span><strong>{row.person}</strong></span></td><td>{row.cameraId}</td><td>{formatDateTime(row.startedAt)}</td><td>{formatDateTime(row.endedAt)}</td><td className="mono">{formatDuration(row.durationSeconds)}</td><td><span className={`pill ${row.status === 'active' ? 'success' : ''}`}>{row.status}</span></td></tr>)}</tbody></table></div> : <EmptyState/>}</Card></>
}
