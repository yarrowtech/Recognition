import { randomUUID } from 'node:crypto';
import { cacheOccupancy } from './cache.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { logger } from './logger.js';
import type { RealtimeHub } from './realtime.js';
import { durationSeconds, shouldClose, type LiveTrack, type Observation } from './sessionEngine.js';

const active = new Map<string, LiveTrack>();
const occupancyPublishedAt = new Map<string, number>();
const keyOf = (cameraId: string, trackId: number) => `${cameraId}:${trackId}`;

export function anonymizeActivePerson(personId: string) {
  for (const track of active.values()) {
    if (track.personId === personId) {
      track.personId = null;
      track.label = `Unknown #${track.trackId}`;
    }
  }
}

export class PresenceService {
  private timer?: NodeJS.Timeout;
  constructor(private hub: RealtimeHub) {}

  async restore() {
    const { rows } = await pool.query(
      `SELECT id, camera_id, track_id, person_id, label, started_at, last_seen_at, status
       FROM sessions WHERE status IN ('active', 'lost')`,
    );
    for (const row of rows) {
      active.set(keyOf(row.camera_id, row.track_id), {
        sessionId: row.id, cameraId: row.camera_id, trackId: row.track_id,
        personId: row.person_id, label: row.label, seenAt: row.last_seen_at,
        startedAt: row.started_at, lastSeenAt: row.last_seen_at, persistedAt: row.last_seen_at, state: row.status,
      });
    }
    this.timer = setInterval(() => void this.sweep(), 1000);
  }

  stop() { if (this.timer) clearInterval(this.timer); }

  list(cameraId?: string) {
    const now = new Date();
    return [...active.values()]
      .filter((track) => !cameraId || track.cameraId === cameraId)
      .map((track) => ({
        sessionId: track.sessionId, cameraId: track.cameraId, trackId: track.trackId,
        personId: track.personId ?? null, name: track.label ?? `Unknown #${track.trackId}`,
        status: track.state, startedAt: track.startedAt,
        durationSeconds: durationSeconds(track.startedAt, now),
      }));
  }

  async observe(cameraId: string, observations: Omit<Observation, 'cameraId' | 'seenAt'>[], seenAt: Date) {
    const seenKeys = new Set<string>();
    for (const item of observations) {
      const observation: Observation = { ...item, cameraId, seenAt };
      const key = keyOf(cameraId, item.trackId);
      seenKeys.add(key);
      const previous = active.get(key);
      if (!previous) await this.enter(observation);
      else await this.update(previous, observation);
    }

    for (const track of active.values()) {
      const key = keyOf(track.cameraId, track.trackId);
      if (track.cameraId === cameraId && !seenKeys.has(key) && track.state === 'active') {
        track.state = 'lost';
        await pool.query(`UPDATE sessions SET status = 'lost', last_seen_at = $2 WHERE id = $1`, [track.sessionId, track.lastSeenAt]);
        await this.event(track, 'PERSON_LOST');
        this.hub.broadcast('person.updated', this.publicTrack(track));
      }
    }
    await this.publishOccupancy(cameraId);
    return this.list(cameraId);
  }

  private async enter(observation: Observation) {
    const sessionId = randomUUID();
    const label = observation.personId ? (observation.label ?? 'Known person') : `Unknown #${observation.trackId}`;
    const track: LiveTrack = { ...observation, label, sessionId, startedAt: observation.seenAt, lastSeenAt: observation.seenAt, persistedAt: observation.seenAt, state: 'active' };
    active.set(keyOf(track.cameraId, track.trackId), track);
    await pool.query(
      `INSERT INTO sessions (id, person_id, camera_id, track_id, label, started_at, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,$6)`,
      [sessionId, track.personId ?? null, track.cameraId, track.trackId, track.label, track.startedAt],
    );
    await this.event(track, track.personId ? 'PERSON_ENTERED' : 'UNKNOWN_PERSON_DETECTED');
    logger.info({ cameraId: track.cameraId, trackId: track.trackId, personId: track.personId }, 'Person entered');
    this.hub.broadcast('person.entered', this.publicTrack(track));
  }

  private async update(track: LiveTrack, observation: Observation) {
    const reappeared = track.state === 'lost';
    const previousPersonId = track.personId ?? null;
    const observedPersonId = observation.personId ?? null;
    const identityChanged = previousPersonId !== observedPersonId;
    const newlyIdentified = !previousPersonId && Boolean(observedPersonId);
    track.lastSeenAt = observation.seenAt;
    track.seenAt = observation.seenAt;
    track.state = 'active';
    if (identityChanged) {
      track.personId = observedPersonId;
      track.label = observedPersonId
        ? (observation.label ?? 'Known person')
        : `Unknown #${track.trackId}`;
    }
    const shouldPersist = observation.seenAt.getTime() - track.persistedAt.getTime() >= 1000 || reappeared || identityChanged;
    if (shouldPersist) {
      await pool.query(
        `UPDATE sessions SET last_seen_at=$2, status='active', person_id=$3, label=$4 WHERE id=$1`,
        [track.sessionId, track.lastSeenAt, track.personId ?? null, track.label],
      );
      track.persistedAt = observation.seenAt;
    }
    if (reappeared) await this.event(track, 'PERSON_REAPPEARED');
    if (newlyIdentified) await this.event(track, 'PERSON_IDENTIFIED', { confidence: observation.confidence });
    if (previousPersonId && !observedPersonId) {
      await this.event(track, 'PERSON_IDENTITY_CLEARED', { previousPersonId });
    } else if (previousPersonId && observedPersonId && previousPersonId !== observedPersonId) {
      await this.event(track, 'PERSON_IDENTITY_CORRECTED', { previousPersonId, confidence: observation.confidence });
    }
    if (shouldPersist) this.hub.broadcast(identityChanged && observedPersonId ? 'person.recognized' : 'person.updated', this.publicTrack(track));
  }

  private async sweep() {
    const now = new Date();
    const affected = new Set<string>();
    for (const [key, track] of active) {
      if (track.state === 'lost' && shouldClose(track.lastSeenAt, now, config.TRACK_LOST_GRACE_SECONDS)) {
        const duration = durationSeconds(track.startedAt, track.lastSeenAt);
        await pool.query(
          `UPDATE sessions SET status='closed', ended_at=$2, duration_seconds=$3 WHERE id=$1`,
          [track.sessionId, track.lastSeenAt, duration],
        );
        await this.event(track, 'PERSON_LEFT', { durationSeconds: duration });
        active.delete(key);
        affected.add(track.cameraId);
        this.hub.broadcast('person.left', { ...this.publicTrack(track), durationSeconds: duration });
        logger.info({ cameraId: track.cameraId, trackId: track.trackId, durationSeconds: duration }, 'Person left');
      }
    }
    for (const cameraId of affected) await this.publishOccupancy(cameraId, true);
  }

  private async event(track: LiveTrack, eventType: string, metadata: Record<string, unknown> = {}) {
    await pool.query(
      `INSERT INTO presence_events (session_id, person_id, camera_id, track_id, event_type, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [track.sessionId, track.personId ?? null, track.cameraId, track.trackId, eventType, metadata],
    );
  }

  private publicTrack(track: LiveTrack) {
    return {
      sessionId: track.sessionId, cameraId: track.cameraId, trackId: track.trackId,
      personId: track.personId ?? null, name: track.label ?? `Unknown #${track.trackId}`,
      status: track.state, startedAt: track.startedAt,
      durationSeconds: durationSeconds(track.startedAt, new Date()),
    };
  }

  private async publishOccupancy(cameraId: string, force = false) {
    const now = Date.now();
    if (!force && now - (occupancyPublishedAt.get(cameraId) ?? 0) < 500) return;
    occupancyPublishedAt.set(cameraId, now);
    const people = this.list(cameraId);
    const data = { cameraId, total: people.length, known: people.filter((p) => p.personId).length, unknown: people.filter((p) => !p.personId).length, people };
    await cacheOccupancy(cameraId, data);
    this.hub.broadcast('occupancy.updated', data);
  }
}
