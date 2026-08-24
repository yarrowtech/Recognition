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

    def process(self, camera_id: str, frame: np.ndarray) -> tuple[list[dict], float]:
        started = perf_counter()
        with self.lock:
            candidates = self.detect(frame)
            tracker = self.trackers.setdefault(camera_id, FaceTracker(settings.track_lost_grace_seconds))
            tracks = tracker.update([candidate.bbox for candidate in candidates])
            by_box = {tuple(candidate.bbox): candidate for candidate in candidates}
            self.frame_number += 1
            output = []
            for track in tracks:
                candidate = by_box.get(tuple(track.bbox))
                if candidate is None:
                    continue
                if not track.person_id and (self.frame_number - track.recognition_frame >= 5 or track.recognition_frame == 0):
                    person_id, name, confidence = self.profiles.match(candidate.embedding)
                    track.recognition_frame = self.frame_number
                    track.person_id, track.label, track.confidence = person_id, name, confidence
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
        if crop.size == 0 or min(crop.shape[:2]) < 80:
            raise ValueError("Face is too small; move closer to the camera")
        if cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var() < 35:
            raise ValueError("Image is too blurry; use a sharper photo")
        return face.embedding
