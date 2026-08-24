import { Activity, Clock3, Eye, Timer, UserRoundCheck, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardHeader, EmptyState, PageHeader, StatCard } from '../components/ui'
import { api, formatDuration, formatTime } from '../lib/api'

export default function DashboardPage() {
  const [data, setData] = useState(null); const [live, setLive] = useState([]); const [recent, setRecent] = useState([])
  useEffect(() => { Promise.all([api('/api/analytics/overview?days=1'), api('/api/live'), api('/api/sessions?limit=6')]).then(([summary, people, sessions]) => { setData(summary); setLive(people); setRecent(sessions) }).catch(() => {}) }, [])
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour: `${String(hour).padStart(2, '0')}:00`, entries: data?.hourly?.find((item) => item.hour === hour)?.entries || 0 }))
  const known = Math.max(0, (data?.totalVisits || 0) - (data?.unknownVisits || 0)); const pie = [{ name: 'Known', value: known }, { name: 'Unknown', value: data?.unknownVisits || 0 }]
  return <><PageHeader eyebrow="Overview" title="Good day. Here’s what’s happening." description="Live occupancy and visit activity from your monitored spaces." actions={<a className="button primary" href="/live"><Eye size={17} />Open live view</a>} />
    <div className="stat-grid">
      <StatCard label="Visits today" value={data?.totalVisits ?? '—'} detail="Recorded sessions" icon={Users} tone="blue" />
      <StatCard label="Currently present" value={live.length} detail={`${live.filter((x) => x.personId).length} recognized`} icon={UserRoundCheck} tone="green" />
      <StatCard label="Unknown now" value={live.filter((x) => !x.personId).length} detail="Awaiting identification" icon={Activity} tone="amber" />
      <StatCard label="Average visit" value={data ? formatDuration(data.averageVisitSeconds) : '—'} detail="Today" icon={Timer} tone="violet" />
    </div>
    <div className="dashboard-grid">
      <Card className="chart-wide"><CardHeader title="Entries by hour" subtitle="Sessions started today" /><div className="chart"><ResponsiveContainer><AreaChart data={hourly}><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4f7cff" stopOpacity={.32}/><stop offset="1" stopColor="#4f7cff" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#202d42"/><XAxis dataKey="hour" tick={{fill:'#75839a',fontSize:11}} interval={3}/><YAxis allowDecimals={false} tick={{fill:'#75839a',fontSize:11}}/><Tooltip contentStyle={{background:'#101827',border:'1px solid #27354b',borderRadius:10}}/><Area type="monotone" dataKey="entries" stroke="#668cff" strokeWidth={2} fill="url(#area)"/></AreaChart></ResponsiveContainer></div></Card>
      <Card><CardHeader title="Identity mix" subtitle="Visits today" /><div className="donut-wrap">{data?.totalVisits ? <><ResponsiveContainer width="100%" height={190}><PieChart><Pie data={pie} dataKey="value" innerRadius={54} outerRadius={76} paddingAngle={4} stroke="none">{pie.map((entry,index)=><Cell key={entry.name} fill={index?'#f4b860':'#527fff'}/>)}</Pie></PieChart></ResponsiveContainer><div className="donut-label"><strong>{data.totalVisits}</strong><span>visits</span></div></> : <EmptyState title="No visits today" />}</div><div className="legend"><span><i className="known"/>Known <b>{known}</b></span><span><i className="unknown"/>Unknown <b>{data?.unknownVisits || 0}</b></span></div></Card>
      <Card className="activity-card"><CardHeader title="Recent sessions" subtitle="Latest entries and exits" action={<Clock3 size={18}/>} />{recent.length ? <div className="activity-list">{recent.map((item) => <div key={item.id}><span className={`avatar ${item.personId ? '' : 'muted'}`}>{item.person.slice(0,1)}</span><div><strong>{item.person}</strong><p>{item.status === 'closed' ? 'left' : 'entered'} via {item.cameraId}</p></div><time>{formatTime(item.startedAt)}</time></div>)}</div> : <EmptyState />}</Card>
    </div></>
}
