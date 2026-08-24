import numpy as np

from app.recognition import ProfileIndex
from app.tracker import Track
from app.vision import FaceEngine


def make_track() -> Track:
    return Track(1, np.array([0, 0, 160, 160], dtype=float), 0.0, np.zeros(2))


def test_identity_requires_multiple_agreeing_results():
    engine = FaceEngine(ProfileIndex())
    track = make_track()

    engine._apply_recognition_result(track, "person-1", "Ada", 0.70)
    engine._apply_recognition_result(track, "person-1", "Ada", 0.72)
    assert track.person_id is None

    engine._apply_recognition_result(track, "person-1", "Ada", 0.71)
    assert track.person_id == "person-1"
    assert track.label == "Ada"
    assert abs(track.confidence - 0.71) < 0.001


def test_one_mismatch_does_not_replace_confirmed_identity():
    engine = FaceEngine(ProfileIndex())
    track = make_track()
    for _ in range(3):
        engine._apply_recognition_result(track, "person-1", "Ada", 0.70)

    engine._apply_recognition_result(track, "person-2", "Grace", 0.75)

    assert track.person_id == "person-1"
    assert track.label == "Ada"


def test_repeated_mismatches_clear_stale_identity():
    engine = FaceEngine(ProfileIndex())
    track = make_track()
    for _ in range(3):
        engine._apply_recognition_result(track, "person-1", "Ada", 0.70)

    for _ in range(3):
        engine._apply_recognition_result(track, "person-2", "Grace", 0.75)

    assert track.person_id is None
    assert track.label is None


def test_different_pending_identity_restarts_confirmation():
    engine = FaceEngine(ProfileIndex())
    track = make_track()

    engine._apply_recognition_result(track, "person-1", "Ada", 0.70)
    engine._apply_recognition_result(track, "person-2", "Grace", 0.75)
    engine._apply_recognition_result(track, "person-1", "Ada", 0.72)

    assert track.person_id is None
    assert track.pending_person_id == "person-1"
    assert track.pending_count == 1


def test_confirmation_tolerates_occasional_unknown_results():
    engine = FaceEngine(ProfileIndex())
    track = make_track()

    engine._apply_recognition_result(track, "person-1", "Ada", 0.44)
    engine._apply_recognition_result(track, None, None, 0.37)
    engine._apply_recognition_result(track, "person-1", "Ada", 0.43)
    engine._apply_recognition_result(track, None, None, 0.36)
    engine._apply_recognition_result(track, "person-1", "Ada", 0.45)

    assert track.person_id == "person-1"
    assert track.label == "Ada"
