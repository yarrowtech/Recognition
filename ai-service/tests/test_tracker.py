import numpy as np

from app.tracker import FaceTracker


def box(x: int):
    return np.array([x, 10, x + 50, 60], dtype=float)


def test_track_survives_short_occlusion():
    tracker = FaceTracker(retention_seconds=7)
    first = tracker.update([box(10)], now=0)[0]
    tracker.update([], now=2)
    recovered = tracker.update([box(15)], now=3)[0]
    assert recovered.track_id == first.track_id


def test_track_expires_after_grace_period():
    tracker = FaceTracker(retention_seconds=7)
    first = tracker.update([box(10)], now=0)[0]
    replacement = tracker.update([box(10)], now=8)[0]
    assert replacement.track_id != first.track_id


def test_appearance_prevents_track_swap_when_faces_cross():
    tracker = FaceTracker(retention_seconds=7, appearance_threshold=0.15)
    ada = np.array([1.0, 0.0], dtype=np.float32)
    grace = np.array([0.0, 1.0], dtype=np.float32)

    first = tracker.update([box(10), box(100)], now=0, embeddings=[ada, grace])
    ada_track_id = first[0].track_id
    grace_track_id = first[1].track_id
    tracker.update([box(45), box(65)], now=0.1, embeddings=[ada, grace])
    crossed = tracker.update([box(30), box(80)], now=0.2, embeddings=[grace, ada])

    by_x = {int(track.bbox[0]): track.track_id for track in crossed}
    assert by_x[80] == ada_track_id
    assert by_x[30] == grace_track_id
