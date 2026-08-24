import { Camera, MapPin, Plus, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card, EmptyState, PageHeader, Status } from '../components/ui'
import { api } from '../lib/api'

export default function CamerasPage() {
  const [cameras, setCameras] = useState([]); const [live, setLive] = useState([])
  useEffect(() => { Promise.all([api('/api/cameras'), api('/api/live')]).then(([items, people]) => { setCameras(items); setLive(people) }).catch(() => {}) }, [])
  return <><PageHeader eyebrow="Sources" title="Cameras" description="The MVP supports a browser webcam; camera records are ready for future RTSP adapters." actions={<button className="button primary" disabled title="Available after RTSP adapter"><Plus size={16}/>Add camera</button>}/>{cameras.length ? <div className="camera-grid">{cameras.map((camera) => <Card key={camera.id} className="camera-tile"><div className="camera-preview"><Video size={34}/><span>{camera.id}</span></div><div className="camera-info"><div><h2>{camera.name}</h2><Status online={camera.status === 'enabled'}>{camera.status}</Status></div><p><MapPin size={14}/>{camera.location || 'No location'}</p><div className="camera-metrics"><span><strong>{live.filter((item) => item.cameraId === camera.id).length}</strong> present</span><span><strong>Browser</strong> source</span></div><a href="/live" className="button subtle"><Camera size={16}/>Open live view</a></div></Card>)}</div> : <Card><EmptyState title="No cameras configured"/></Card>}</>
}
