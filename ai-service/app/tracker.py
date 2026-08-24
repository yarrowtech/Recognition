from dataclasses import dataclass
from time import monotonic

import numpy as np


@dataclass
class Track:
    track_id: int
    bbox: np.ndarray
    last_seen: float
    velocity: np.ndarray
    person_id: str | None = None
    label: str | None = None
    confidence: float | None = None
    recognition_frame: int = 0
    pending_person_id: str | None = None
    pending_label: str | None = None
    pending_count: int = 0
    pending_confidence: float = 0.0
    pending_misses: int = 0
    mismatch_count: int = 0
    appearance_embedding: np.ndarray | None = None


def _center(box: np.ndarray) -> np.ndarray:
    return np.array(((box[0] + box[2]) / 2, (box[1] + box[3]) / 2))


def _iou(a: np.ndarray, b: np.ndarray) -> float:
    x1, y1 = np.maximum(a[:2], b[:2])
    x2, y2 = np.minimum(a[2:], b[2:])
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = max(1.0, (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - intersection)
    return float(intersection / union)


class FaceTracker:
    """Small multi-face tracker with velocity prediction and grace-period retention."""

    def __init__(self, retention_seconds: float = 7.0, appearance_threshold: float = 0.15):
        self.retention_seconds = retention_seconds
        self.appearance_threshold = appearance_threshold
        self.tracks: dict[int, Track] = {}
        self.next_id = 1

    def update(
        self,
        boxes: list[np.ndarray],
        now: float | None = None,
        embeddings: list[np.ndarray] | None = None,
    ) -> list[Track]:
        now = now if now is not None else monotonic()
        normalized_embeddings = None
        if embeddings is not None:
            normalized_embeddings = [embedding / max(float(np.linalg.norm(embedding)), 1e-9) for embedding in embeddings]
        self.tracks = {key: track for key, track in self.tracks.items() if now - track.last_seen <= self.retention_seconds}
        candidates: list[tuple[float, int, int]] = []
        for track_id, track in self.tracks.items():
            elapsed = max(0.0, now - track.last_seen)
            predicted_center = _center(track.bbox) + track.velocity * elapsed
            size = np.linalg.norm(track.bbox[2:] - track.bbox[:2])
            for face_index, box in enumerate(boxes):
                appearance_similarity = None
                if normalized_embeddings is not None and track.appearance_embedding is not None:
                    appearance_similarity = float(np.dot(track.appearance_embedding, normalized_embeddings[face_index]))
                    if appearance_similarity < self.appearance_threshold:
                        continue
                distance = float(np.linalg.norm(predicted_center - _center(box)))
                overlap = _iou(track.bbox, box)
                max_distance = max(80.0, size * 0.8)
                if overlap > 0.03 or distance < max_distance:
                    appearance_score = appearance_similarity if appearance_similarity is not None else 0.0
                    candidates.append((overlap * 2.0 - distance / max_distance + appearance_score, track_id, face_index))

        matched_tracks: set[int] = set()
        matched_faces: set[int] = set()
        visible: list[Track] = []
        for _, track_id, face_index in sorted(candidates, reverse=True):
            if track_id in matched_tracks or face_index in matched_faces:
                continue
            track = self.tracks[track_id]
            elapsed = max(0.001, now - track.last_seen)
            measured_velocity = (_center(boxes[face_index]) - _center(track.bbox)) / elapsed
            track.velocity = track.velocity * 0.65 + measured_velocity * 0.35
            track.bbox = boxes[face_index]
            track.last_seen = now
            if normalized_embeddings is not None:
                measured_appearance = normalized_embeddings[face_index]
                if track.appearance_embedding is None:
                    track.appearance_embedding = measured_appearance
                else:
                    blended = track.appearance_embedding * 0.8 + measured_appearance * 0.2
                    track.appearance_embedding = blended / max(float(np.linalg.norm(blended)), 1e-9)
            matched_tracks.add(track_id)
            matched_faces.add(face_index)
            visible.append(track)

        for face_index, box in enumerate(boxes):
            if face_index in matched_faces:
                continue
            appearance = normalized_embeddings[face_index] if normalized_embeddings is not None else None
            track = Track(self.next_id, box, now, np.zeros(2), appearance_embedding=appearance)
            self.tracks[self.next_id] = track
            self.next_id += 1
            visible.append(track)
        return visible
