export type Observation = {
  cameraId: string;
  trackId: number;
  personId?: string | null;
  label?: string;
  confidence?: number;
  seenAt: Date;
};

export type LiveTrack = Observation & { sessionId: string; startedAt: Date; lastSeenAt: Date; persistedAt: Date; state: 'active' | 'lost' };

export function shouldClose(lastSeenAt: Date, now: Date, graceSeconds: number) {
  return now.getTime() - lastSeenAt.getTime() > graceSeconds * 1000;
}

export function durationSeconds(startedAt: Date, endedAt: Date) {
  return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
}
