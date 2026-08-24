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


def test_negative_similarity_is_reported_as_zero_confidence():
    index = ProfileIndex()
    index.profiles = [Profile("person-1", "Ada", np.array([1.0, 0.0], dtype=np.float32))]

    person_id, name, confidence = index.match(np.array([-1.0, 0.0], dtype=np.float32))

    assert person_id is None
    assert name is None
    assert confidence == 0.0


def test_recognition_rejects_ambiguous_people_even_above_threshold():
    index = ProfileIndex()
    close_embedding = np.array([0.995, 0.1], dtype=np.float32)
    close_embedding /= np.linalg.norm(close_embedding)
    index.profiles = [
        Profile("person-1", "Ada", np.array([1.0, 0.0], dtype=np.float32)),
        Profile("person-2", "Grace", close_embedding),
    ]

    person_id, name, confidence = index.match(np.array([1.0, 0.0], dtype=np.float32))

    assert person_id is None
    assert name is None
    assert confidence == 1.0


def test_multiple_samples_of_same_person_do_not_count_as_runner_up():
    index = ProfileIndex()
    index.profiles = [
        Profile("person-1", "Ada", np.array([1.0, 0.0], dtype=np.float32)),
        Profile("person-1", "Ada", np.array([0.999, 0.045], dtype=np.float32)),
        Profile("person-2", "Grace", np.array([0.0, 1.0], dtype=np.float32)),
    ]

    person_id, name, _ = index.match(np.array([1.0, 0.0], dtype=np.float32))

    assert person_id == "person-1"
    assert name == "Ada"
