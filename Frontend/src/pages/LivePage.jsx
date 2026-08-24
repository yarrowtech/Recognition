import { BrainCircuit, Camera, CameraOff, CircleStop, Maximize2, Play, Radio, Users } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardHeader, EmptyState, ErrorBanner, PageHeader, Status } from '../components/ui'
import { useRealtime } from '../hooks/useRealtime'
import { AI_URL, api, formatDuration } from '../lib/api'
import './LivePage.css'

const TARGET_FPS = Math.max(1, Math.min(30, Number(import.meta.env.VITE_AI_PROCESS_FPS || 24)))
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS
const OVERLAY_SMOOTHING_MS = 55
const LOST_BOX_GRACE_MS = 160
const CAPTURE_MAX_WIDTH = 960

export default function LivePage() {
  const videoRef = useRef(null)
  const overlayRef = useRef(null)
  const captureRef = useRef(document.createElement('canvas'))
  const streamRef = useRef(null)
  const busyRef = useRef(false)
  const targetsRef = useRef(new Map())
  const displayedRef = useRef(new Map())
  const completedFramesRef = useRef([])
  const [running, setRunning] = useState(false)
  const [detections, setDetections] = useState([])
  const [people, setPeople] = useState([])
  const [error, setError] = useState('')
  const [fps, setFps] = useState(0)
  const [analysis, setAnalysis] = useState('')

  const onEvent = useCallback((event) => {
    if (event.type === 'occupancy.updated' && event.data.cameraId === 'CAM01') setPeople(event.data.people)
  }, [])
  const realtime = useRealtime(onEvent)

  useEffect(() => { api('/api/live?cameraId=CAM01').then(setPeople).catch(() => {}) }, [])

  useEffect(() => {
    let animationFrame
    let previousTime = performance.now()

    const draw = (now) => {
      const canvas = overlayRef.current
      const video = videoRef.current
      if (canvas && video?.videoWidth) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const blend = 1 - Math.exp(-(now - previousTime) / OVERLAY_SMOOTHING_MS)
        const targets = targetsRef.current
        const displayed = displayedRef.current

        targets.forEach((target, trackId) => {
          const current = displayed.get(trackId)
          if (!current) {
            displayed.set(trackId, { ...target, box: { ...target.box }, lastSeen: now })
            return
          }
          current.label = target.label
          current.personId = target.personId
          current.confidence = target.confidence
          current.lastSeen = now
          for (const key of ['x', 'y', 'width', 'height']) {
            current.box[key] += (target.box[key] - current.box[key]) * blend
          }
        })

        displayed.forEach((item, trackId) => {
          const missingFor = targets.has(trackId) ? 0 : now - item.lastSeen
          if (missingFor > LOST_BOX_GRACE_MS) {
            displayed.delete(trackId)
            return
          }
          const opacity = 1 - missingFor / LOST_BOX_GRACE_MS
          const known = Boolean(item.personId)
          const color = known ? '#55d99a' : '#f4b860'
          const background = known ? 'rgba(20,92,66,.92)' : 'rgba(108,67,16,.92)'
          const { y, width, height } = item.box
          const x = canvas.width - item.box.x - width
          ctx.globalAlpha = opacity
          ctx.lineWidth = Math.max(2, canvas.width / 360)
          ctx.strokeStyle = color
          ctx.shadowColor = color
          ctx.shadowBlur = 8
          ctx.beginPath()
          ctx.roundRect(x, y, width, height, Math.min(16, width / 7, height / 7))
          ctx.stroke()
          ctx.shadowBlur = 0
          ctx.font = `600 ${Math.max(14, canvas.width / 50)}px Inter, sans-serif`
          const confidence = item.confidence ? `${Math.round(item.confidence * 100)}%` : 'unknown'
          const text = `${item.label}  ·  ${confidence}`
          const labelWidth = Math.min(ctx.measureText(text).width + 18, canvas.width - x)
          const labelY = Math.max(0, y - 30)
          ctx.fillStyle = background
          ctx.fillRect(x, labelY, labelWidth, 30)
          ctx.fillStyle = '#fff'
          ctx.fillText(text, x + 9, labelY + 21, Math.max(0, labelWidth - 18))
          ctx.globalAlpha = 1
        })
      }
      previousTime = now
      animationFrame = requestAnimationFrame(draw)
    }

    animationFrame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animationFrame)
  }, [])

  const captureBlob = useCallback(() => new Promise((resolve) => {
    const video = videoRef.current
    const canvas = captureRef.current
    const scale = Math.min(1, CAPTURE_MAX_WIDTH / video.videoWidth)
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(resolve, 'image/jpeg', 0.76)
  }), [])

  const processFrame = useCallback(async () => {
    if (busyRef.current || !videoRef.current?.videoWidth) return
    busyRef.current = true
    try {
      const blob = await captureBlob()
      const form = new FormData()
      form.append('cameraId', 'CAM01')
      form.append('image', blob, 'frame.jpg')
      const response = await fetch(`${AI_URL}/v1/process-frame`, { method: 'POST', body: form })
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Frame processing failed')

      const scaleX = videoRef.current.videoWidth / body.width
      const scaleY = videoRef.current.videoHeight / body.height
      const tracks = body.tracks.map((track) => ({
        ...track,
        box: {
          x: track.box.x * scaleX,
          y: track.box.y * scaleY,
          width: track.box.width * scaleX,
          height: track.box.height * scaleY,
        },
      }))
      targetsRef.current = new Map(tracks.map((track) => [track.trackId, track]))
      setDetections(tracks)

      const now = performance.now()
      const completed = completedFramesRef.current
      completed.push(now)
      while (completed.length && completed[0] < now - 1000) completed.shift()
      setFps(completed.length > 1 ? (completed.length - 1) * 1000 / (completed.at(-1) - completed[0]) : 0)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      busyRef.current = false
    }
  }, [captureBlob])

  useEffect(() => {
    if (!running) return undefined
    let cancelled = false
    let timer
    const tick = async () => {
      const started = performance.now()
      await processFrame()
      if (!cancelled) timer = window.setTimeout(tick, Math.max(0, FRAME_INTERVAL_MS - (performance.now() - started)))
    }
    tick()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [processFrame, running])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
        audio: false,
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      completedFramesRef.current = []
      setRunning(true)
      setError('')
    } catch (err) {
      setError(`Camera unavailable: ${err.message}`)
    }
  }

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    targetsRef.current.clear()
    displayedRef.current.clear()
    completedFramesRef.current = []
    setFps(0)
    setRunning(false)
    setDetections([])
    api('/api/live/disconnect', { method: 'POST', body: JSON.stringify({ cameraId: 'CAM01' }) }).catch(() => {})
  }

  useEffect(() => () => { streamRef.current?.getTracks().forEach((track) => track.stop()) }, [])

  const analyze = async () => {
    try {
      setAnalysis('Analyzing scene…')
      const blob = await captureBlob()
      const form = new FormData()
      form.append('cameraId', 'CAM01')
      form.append('prompt', 'Briefly describe the activity in this room. Do not attempt to identify anyone.')
      form.append('image', blob, 'scene.jpg')
      const result = await api('/api/ai/analyze', { method: 'POST', body: form })
      setAnalysis(result.response)
    } catch (err) {
      setAnalysis(`Analysis unavailable: ${err.message}`)
    }
  }

  return <><PageHeader eyebrow="Live monitoring" title="Primary webcam" description="Faces are processed in memory; continuous video is not recorded." actions={<><Status online={running}>{running ? 'Camera live' : 'Camera offline'}</Status>{running ? <button className="button danger" onClick={stop}><CircleStop size={16}/>Stop</button> : <button className="button primary" onClick={start}><Play size={16}/>Start camera</button>}</>} />
    <ErrorBanner message={error}/><div className="live-grid"><div><Card className="video-card"><div className="video-toolbar"><span><Radio size={15}/>{running ? 'Live · CAM01' : 'Preview stopped'}</span><div><span>{fps.toFixed(1)} / {TARGET_FPS} FPS</span><button className="icon-button" title="Fullscreen" onClick={() => videoRef.current?.parentElement?.requestFullscreen()}><Maximize2 size={16}/></button></div></div><div className="video-stage"><video ref={videoRef} muted playsInline/><canvas ref={overlayRef}/>{!running && <div className="camera-empty"><CameraOff size={38}/><strong>Camera is off</strong><p>Start the webcam to begin local monitoring.</p><button className="button primary" onClick={start}><Camera size={17}/>Connect webcam</button></div>}</div><div className="video-footer"><span><Users size={16}/>{detections.length} visible</span><span className="known-text">{detections.filter((x) => x.personId).length} known</span><span className="unknown-text">{detections.filter((x) => !x.personId).length} unknown</span><button className="button subtle" disabled={!running} onClick={analyze}><BrainCircuit size={16}/>Analyze scene</button></div></Card>{analysis && <Card className="analysis-result"><CardHeader title="Visual analysis" subtitle="Qwen2.5-VL · on demand"/><p>{analysis}</p></Card>}</div>
    <Card className="present-card"><CardHeader title="Currently present" subtitle={`${people.length} active session${people.length === 1 ? '' : 's'}`} action={<Status online={realtime}>{realtime ? 'Realtime' : 'Reconnecting'}</Status>}/>{people.length ? <div className="present-list">{people.map((person) => <div key={person.sessionId}><span className={`avatar ${person.personId ? '' : 'muted'}`}>{person.name.slice(0, 1)}</span><div><strong>{person.name}</strong><p>{person.personId ? 'Recognized' : 'Unrecognized'} · Track {person.trackId}</p></div><time>{formatDuration(person.durationSeconds)}</time></div>)}</div> : <EmptyState title="The room is empty" text="People will appear after the camera detects a face."/>}</Card></div></>
}
