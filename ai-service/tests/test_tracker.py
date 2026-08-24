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
