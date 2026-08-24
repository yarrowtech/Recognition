import logging
from dataclasses import dataclass
from threading import Lock
from time import monotonic, perf_counter

import cv2
import numpy as np

from .config import settings
from .recognition import ProfileIndex
from .tracker import FaceTracker

logger = logging.getLogger(__name__)
MIN_ENROLLMENT_FACE_PIXELS = 112


@dataclass
class FaceCandidate:
    bbox: np.ndarray
    embedding: np.ndarray
    detection_score: float


class FaceEngine:
    def __init__(self, profiles: ProfileIndex):
        self.profiles = profiles
        self.trackers: dict[str, FaceTracker] = {}
        self.model = None
        self.model_error: str | None = None
        self.model_providers: dict[str, list[str]] = {}
        self.lock = Lock()
        self.frame_number = 0

    def load(self):
        if self.model is not None or self.model_error:
            return
        try:
            import onnxruntime

            # ONNX Runtime can load cuDNN from the NVIDIA Python package declared
            # in requirements.txt. Without this preload, CUDA is advertised as an
            # available provider but model sessions silently fall back to CPU.
            onnxruntime.preload_dlls(cuda=False, cudnn=True)
            from insightface.app import FaceAnalysis
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
            self.model = FaceAnalysis(name=settings.face_model_name, providers=providers)
            self.model.prepare(ctx_id=0, det_size=(640, 640), det_thresh=settings.face_detection_threshold)
            self.model_providers = {
                str(name): model.session.get_providers()
                for name, model in self.model.models.items()
                if hasattr(model, "session")
            }
            logger.info(
                "Loaded InsightFace model %s with providers %s",
                settings.face_model_name,
                self.model_providers,
            )
        except Exception as error:
            self.model_error = str(error)
            logger.exception("Face model failed to load")

    @property
    def available(self) -> bool:
        self.load()
        return self.model is not None

    @property
    def using_gpu(self) -> bool:
        self.load()
        active = [providers[0] for providers in self.model_providers.values() if providers]
        return bool(active) and all(provider == "CUDAExecutionProvider" for provider in active)

    def detect(self, frame: np.ndarray) -> list[FaceCandidate]:
        self.load()
        if self.model is None:
            raise RuntimeError(f"Face model unavailable: {self.model_error}")
        faces = self.model.get(frame)
        return [FaceCandidate(np.asarray(face.bbox, dtype=float), np.asarray(face.normed_embedding, dtype=np.float32), float(face.det_score)) for face in faces]

    @staticmethod
    def _reset_pending_identity(track) -> None:
        track.pending_person_id = None
        track.pending_label = None
        track.pending_count = 0
        track.pending_confidence = 0.0
        track.pending_misses = 0

    def _apply_recognition_result(
        self,
        track,
        person_id: str | None,
        name: str | None,
        confidence: float,
    ) -> None:
        if track.person_id:
            if person_id == track.person_id:
                previous_confidence = track.confidence
                track.mismatch_count = 0
                track.label = name or track.label
                track.confidence = (
                    confidence
                    if previous_confidence is None
                    else previous_confidence * 0.7 + confidence * 0.3
                )
                return

            # Do not let one odd frame replace a confirmed identity. Conversely,
            # do not leave an old identity permanently attached after a track
            # association error or a different person entering the same position.
            track.mismatch_count += 1
            if track.mismatch_count >= settings.recognition_mismatch_frames:
                track.person_id = None
                track.label = None
                track.confidence = confidence
                track.mismatch_count = 0
                self._reset_pending_identity(track)
            return

        track.confidence = confidence
        if person_id is None:
            if track.pending_person_id:
                track.pending_misses += 1
                if track.pending_misses >= settings.recognition_confirm_frames:
                    self._reset_pending_identity(track)
            return

        if track.pending_person_id == person_id:
            track.pending_count += 1
            track.pending_confidence += confidence
            track.pending_misses = 0
        else:
            track.pending_person_id = person_id
            track.pending_label = name
            track.pending_count = 1
            track.pending_confidence = confidence
            track.pending_misses = 0

        if track.pending_count >= settings.recognition_confirm_frames:
            track.person_id = track.pending_person_id
            track.label = track.pending_label
            track.confidence = track.pending_confidence / track.pending_count
            track.mismatch_count = 0
            self._reset_pending_identity(track)

    @staticmethod
    def _recognition_quality(frame: np.ndarray, candidate: FaceCandidate) -> bool:
        if candidate.detection_score < settings.recognition_min_detection_score:
            return False
        frame_height, frame_width = frame.shape[:2]
        x1, y1, x2, y2 = [int(value) for value in candidate.bbox]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(frame_width, x2), min(frame_height, y2)
        if min(x2 - x1, y2 - y1) < settings.recognition_min_face_pixels:
            return False
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return False
        blur_score = cv2.Laplacian(
            cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F
        ).var()
        return bool(blur_score >= settings.recognition_min_blur_score)

    def process(self, camera_id: str, frame: np.ndarray) -> tuple[list[dict], float]:
        started = perf_counter()
        with self.lock:
            candidates = self.detect(frame)
            tracker = self.trackers.setdefault(
                camera_id,
                FaceTracker(
                    settings.track_lost_grace_seconds,
                    settings.track_appearance_threshold,
                ),
            )
            tracks = tracker.update(
                [candidate.bbox for candidate in candidates],
                embeddings=[candidate.embedding for candidate in candidates],
            )
            by_box = {tuple(candidate.bbox): candidate for candidate in candidates}
            self.frame_number += 1
            output = []
            for track in tracks:
                candidate = by_box.get(tuple(track.bbox))
                if candidate is None:
                    continue
                recognition_interval = (
                    settings.recognition_revalidate_frames
                    if track.person_id
                    else settings.recognition_interval_frames
                )
                should_recognize = (
                    track.recognition_frame == 0
                    or self.frame_number - track.recognition_frame >= recognition_interval
                )
                if should_recognize:
                    track.recognition_frame = self.frame_number
                    if self._recognition_quality(frame, candidate):
                        person_id, name, confidence = self.profiles.match(candidate.embedding)
                        self._apply_recognition_result(track, person_id, name, confidence)
                x1, y1, x2, y2 = [int(value) for value in track.bbox]
                output.append({
                    "trackId": track.track_id, "personId": track.person_id,
                    "label": track.label or f"Unknown #{track.track_id}", "confidence": track.confidence,
                    "box": {"x": max(0, x1), "y": max(0, y1), "width": max(1, x2-x1), "height": max(1, y2-y1)},
                })
        return output, (perf_counter() - started) * 1000

    def enrollment_embedding(self, frame: np.ndarray) -> np.ndarray:
        faces = self.detect(frame)
        if len(faces) != 1:
            raise ValueError("Enrollment image must contain exactly one face")
        face = faces[0]
        x1, y1, x2, y2 = [int(value) for value in face.bbox]
        crop = frame[max(0, y1):y2, max(0, x1):x2]
        if crop.size == 0 or min(crop.shape[:2]) < MIN_ENROLLMENT_FACE_PIXELS:
            raise ValueError(
                f"Face is too small; move closer until it is at least "
                f"{MIN_ENROLLMENT_FACE_PIXELS} x {MIN_ENROLLMENT_FACE_PIXELS} pixels"
            )
        if cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() < 35:
            raise ValueError("Image is too blurry; use a sharper photo")
        return face.embedding
