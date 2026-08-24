import base64
import logging
from dataclasses import dataclass
from time import monotonic

import httpx
import numpy as np

from .config import settings

logger = logging.getLogger(__name__)


@dataclass
class Profile:
    person_id: str
    name: str
    embedding: np.ndarray


class ProfileIndex:
    def __init__(self):
        self.profiles: list[Profile] = []
        self.last_refresh = 0.0

    async def refresh_if_needed(self):
        if monotonic() - self.last_refresh < 10:
            return
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                response = await client.get(
                    f"{settings.node_api_url}/internal/face-profiles",
                    headers={"x-service-token": settings.internal_service_token},
                )
                response.raise_for_status()
            profiles = []
            for item in response.json()["data"]:
                vector = np.frombuffer(base64.b64decode(item["embedding"]), dtype=np.float32).copy()
                norm = np.linalg.norm(vector)
                if norm:
                    profiles.append(Profile(item["personId"], item["name"], vector / norm))
            self.profiles = profiles
            self.last_refresh = monotonic()
        except Exception as error:
            logger.warning("Could not refresh face profiles: %s", error)

    def match(self, embedding: np.ndarray) -> tuple[str | None, str | None, float]:
        if not self.profiles:
            return None, None, 0.0
        normalized = embedding / max(float(np.linalg.norm(embedding)), 1e-9)
        similarities = np.array([float(np.dot(normalized, profile.embedding)) for profile in self.profiles])
        index = int(np.argmax(similarities))
        confidence = float(similarities[index])
        profile = self.profiles[index]
        if confidence < settings.face_match_threshold:
            return None, None, confidence
        return profile.person_id, profile.name, confidence
