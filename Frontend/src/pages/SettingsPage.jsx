import { Activity, Database, EyeOff, RefreshCw, Server, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardHeader, PageHeader } from '../components/ui'
import { AI_URL, api } from '../lib/api'
import './SettingsPage.css'

const percentage = (value) => `${((Number(value) || 0) * 100).toFixed(1)}%`

async function fetchCalibrationData() {
  const calibration = await api('/api/people/calibration')
  let threshold = null
  try {
    const response = await fetch(`${AI_URL}/health`)
    const health = await response.json()
    if (response.ok && Number.isFinite(Number(health.matchThreshold))) threshold = Number(health.matchThreshold)
  } catch {
    // Calibration remains useful when the optional live health check is unavailable.
  }
  return { calibration, threshold }
}

export default function SettingsPage() {
  const [calibration, setCalibration] = useState(null)
  const [currentThreshold, setCurrentThreshold] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadCalibration = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchCalibrationData()
      setCalibration(result.calibration)
      setCurrentThreshold(result.threshold)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    fetchCalibrationData()
      .then((result) => {
        if (!active) return
        setCalibration(result.calibration)
        setCurrentThreshold(result.threshold)
      })
      .catch((err) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return <>
    <PageHeader eyebrow="Configuration" title="Settings" description="Runtime thresholds and secrets are controlled with server environment variables."/>
    <div className="settings-grid">
      <Card><CardHeader title="Privacy defaults"/><div className="setting-row"><ShieldCheck/><div><strong>Metadata-only retention</strong><p>Continuous raw video is never stored.</p></div></div><div className="setting-row"><EyeOff/><div><strong>Protected biometrics</strong><p>Embeddings stay behind the internal service boundary.</p></div></div></Card>
      <Card><CardHeader title="Service configuration"/><div className="setting-row"><Database/><div><strong>PostgreSQL + Redis</strong><p>History is durable; live state is transient.</p></div></div><div className="setting-row"><Server/><div><strong>Environment managed</strong><p>See .env.example files for all supported settings.</p></div></div></Card>
      <Card className="calibration-card">
        <CardHeader title="Recognition threshold calibration" subtitle="Calculated from your enrolled users and camera conditions." action={<button className="icon-button" title="Recalculate" onClick={loadCalibration} disabled={loading}><RefreshCw size={15}/></button>}/>
        {error ? <div className="calibration-message error">{error}</div> : loading ? <div className="calibration-message">Calculating enrollment similarities…</div> : calibration?.ready ? <>
          <div className="calibration-score"><Activity/><div><span>Recommended starting threshold</span><strong>{calibration.recommendedThreshold.toFixed(4)}</strong><small>Current: {currentThreshold === null ? 'unavailable' : currentThreshold.toFixed(4)}</small></div></div>
          <div className="calibration-metrics">
            <div><span>Genuine mean</span><strong>{calibration.genuine.mean.toFixed(4)}</strong><small>{calibration.genuine.pairs} same-person pairs</small></div>
            <div><span>Impostor maximum</span><strong>{calibration.impostor.maximum.toFixed(4)}</strong><small>{calibration.impostor.pairs} different-person pairs</small></div>
            <div><span>Observed false accepts</span><strong>{percentage(calibration.observedFalseAcceptRate)}</strong><small>Enrollment set only</small></div>
            <div><span>Observed false rejects</span><strong>{percentage(calibration.observedFalseRejectRate)}</strong><small>Enrollment set only</small></div>
          </div>
          <p className="calibration-note">Review this recommendation with real probe images before changing <code>FACE_MATCH_THRESHOLD</code>. Enrollment-only results can be optimistic.</p>
        </> : <div className="calibration-message"><strong>More samples required</strong><span>{calibration?.reason}</span><small>{calibration?.people || 0} people · {calibration?.profiles || 0} profiles</small></div>}
      </Card>
    </div>
  </>
}
