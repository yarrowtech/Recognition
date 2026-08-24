import numpy as np

from app.recognition import Profile, ProfileIndex


def test_recognition_accepts_close_embedding():
    index = ProfileIndex()
    index.profiles = [Profile("person-1", "Ada", np.array([1.0, 0.0], dtype=np.float32))]
    person_id, name, confidence = index.match(np.array([0.99, 0.01], dtype=np.float32))
    assert person_id == "person-1"
    assert name == "Ada"
    assert confidence > 0.99


def test_recognition_keeps_low_similarity_unknown():
    index = ProfileIndex()
    index.profiles = [Profile("person-1", "Ada", np.array([1.0, 0.0], dtype=np.float32))]
    person_id, name, confidence = index.match(np.array([0.0, 1.0], dtype=np.float32))
    assert person_id is None
    assert name is None
    assert confidence == 0.0
