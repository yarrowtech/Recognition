import { Camera, ImageUp, Plus, Search, Trash2, UserRound, Video } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, ErrorBanner, PageHeader } from '../components/ui'
import { api, formatDateTime } from '../lib/api'
import './PeoplePage.css'

export default function PeoplePage() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const captureRef = useRef(document.createElement('canvas'))
  const [people, setPeople] = useState([])
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null)
  const [enrollMode, setEnrollMode] = useState('camera')
  const [cameraReady, setCameraReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [modalError, setModalError] = useState('')

  const load = useCallback(() => {
    api('/api/people').then(setPeople).catch((err) => setError(err.message))
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setCameraReady(false)
  }, [])

  const closeModal = useCallback(() => {
    stopCamera()
    setModal(null)
    setModalError('')
    setSubmitting(false)
  }, [stopCamera])

  const openEnrollment = useCallback((person) => {
    setEnrollMode('camera')
    setModalError('')
    setModal({ type: 'enroll', person })
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (modal?.type !== 'enroll' || enrollMode !== 'camera') {
      return undefined
    }

    let cancelled = false
    const startCamera = async () => {
      setCameraReady(false)
      setModalError('')
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 960 },
            height: { ideal: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)
      } catch (err) {
        setModalError(`Camera unavailable: ${err.message}`)
      }
    }
    startCamera()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [enrollMode, modal?.type, stopCamera])

  const create = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setModalError('')
    try {
      const person = await api('/api/people', {
        method: 'POST',
        body: JSON.stringify({ name: form.get('name'), externalId: form.get('externalId') || undefined }),
      })
      load()
      openEnrollment(person)
    } catch (err) {
      setModalError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const submitEnrollment = async (image, filename) => {
    if (!image || !modal?.person) return
    setSubmitting(true)
    setModalError('')
    try {
      const form = new FormData()
      form.append('image', image, filename)
      await api(`/api/people/${modal.person.id}/faces`, { method: 'POST', body: form })
      closeModal()
      load()
    } catch (err) {
      setModalError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const captureAndEnroll = async () => {
    const video = videoRef.current
    if (!cameraReady || !video?.videoWidth) return
    const canvas = captureRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) {
      setModalError('Could not capture the camera frame. Please try again.')
      return
    }
    await submitEnrollment(blob, 'live-enrollment.jpg')
  }

  const uploadAndEnroll = async (event) => {
    event.preventDefault()
    const file = new FormData(event.currentTarget).get('image')
    await submitEnrollment(file, file.name)
  }

  const remove = async (person) => {
    if (!confirm(`Delete ${person.name}? Their face profiles will be permanently removed and history anonymized.`)) return
    try {
      await api(`/api/people/${person.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const filtered = people.filter((person) => `${person.name} ${person.externalId || ''}`.toLowerCase().includes(query.toLowerCase()))

  return <>
    <PageHeader eyebrow="Identity registry" title="People" description="Manage recognized identities and their biometric enrollment profiles." actions={<button className="button primary" onClick={() => { setModalError(''); setModal({ type: 'create' }) }}><Plus size={17}/>Add person</button>}/>
    <ErrorBanner message={error}/>
    <Card>
      <div className="table-tools"><label className="search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people…"/></label><span>{filtered.length} people</span></div>
      {filtered.length ? <div className="table-scroll"><table><thead><tr><th>Person</th><th>External ID</th><th>Face profiles</th><th>Visits</th><th>Last seen</th><th/></tr></thead><tbody>{filtered.map((person) => <tr key={person.id}><td><Link className="person-cell" to={`/people/${person.id}`}><span className="avatar">{person.name.slice(0, 1)}</span><strong>{person.name}</strong></Link></td><td className="mono">{person.externalId || '—'}</td><td><span className={`pill ${person.faceCount ? 'success' : 'warning'}`}>{person.faceCount ? `${person.faceCount} enrolled` : 'Needs enrollment'}</span></td><td>{person.visits}</td><td>{formatDateTime(person.lastSeen)}</td><td><div className="row-actions"><button title="Enroll face" onClick={() => openEnrollment(person)}><Camera size={16}/></button><button title="Delete" onClick={() => remove(person)}><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div> : <EmptyState title="No registered people" text="Add a person, then enroll one or more clear face images."/>}
    </Card>

    {modal && <div className="modal-backdrop" onMouseDown={closeModal}>
      <div className={`modal ${modal.type === 'enroll' ? 'enrollment-modal' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
        <span className="modal-icon"><UserRound/></span>
        <h2>{modal.type === 'create' ? 'Add a person' : `Enroll ${modal.person.name}`}</h2>
        <p>{modal.type === 'create' ? 'Create an identity record. You can enroll a face next.' : 'Capture or upload one sharp image containing exactly one face.'}</p>
        {modalError && <div className="modal-error">{modalError}</div>}

        {modal.type === 'create' ? <form onSubmit={create}>
          <label>Name<input name="name" required minLength="2" autoFocus/></label>
          <label>External ID <small>optional</small><input name="externalId"/></label>
          <div className="modal-actions"><button type="button" className="button subtle" onClick={closeModal}>Cancel</button><button className="button primary" disabled={submitting}>{submitting ? 'Creating…' : 'Create person'}</button></div>
        </form> : <>
          <div className="enrollment-tabs" role="tablist" aria-label="Enrollment source">
            <button type="button" className={enrollMode === 'camera' ? 'active' : ''} onClick={() => setEnrollMode('camera')}><Video size={15}/>Live camera</button>
            <button type="button" className={enrollMode === 'upload' ? 'active' : ''} onClick={() => setEnrollMode('upload')}><ImageUp size={15}/>Upload photo</button>
          </div>

          {enrollMode === 'camera' ? <div className="live-enrollment">
            <div className="enrollment-preview">
              <video ref={videoRef} muted playsInline/>
              <div className="face-guide" aria-hidden="true"/>
              {!cameraReady && !modalError && <span className="camera-waiting">Starting camera…</span>}
            </div>
            <p className="capture-hint">Center one face inside the guide. Look forward and keep still.</p>
            <div className="modal-actions"><button type="button" className="button subtle" onClick={closeModal}>Cancel</button><button type="button" className="button primary" disabled={!cameraReady || submitting} onClick={captureAndEnroll}><Camera size={16}/>{submitting ? 'Validating…' : 'Capture & enroll'}</button></div>
          </div> : <form onSubmit={uploadAndEnroll}>
            <label className="file-drop"><ImageUp/><span>Choose a face image</span><input name="image" type="file" accept="image/*" required/></label>
            <div className="modal-actions"><button type="button" className="button subtle" onClick={closeModal}>Cancel</button><button className="button primary" disabled={submitting}>{submitting ? 'Validating…' : 'Validate & enroll'}</button></div>
          </form>}
        </>}
      </div>
    </div>}
  </>
}
