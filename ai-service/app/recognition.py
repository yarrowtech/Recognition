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
        # Rank identities, not individual enrollment images. Otherwise, several
        # samples belonging to the winning identity can incorrectly occupy both
        # first and second place and make the separation check meaningless.
        best_by_person: dict[str, tuple[Profile, float]] = {}
        for profile in self.profiles:
            similarity = float(np.dot(normalized, profile.embedding))
            current = best_by_person.get(profile.person_id)
            if current is None or similarity > current[1]:
                best_by_person[profile.person_id] = (profile, similarity)

        ranked = sorted(best_by_person.values(), key=lambda item: item[1], reverse=True)
        profile, confidence = ranked[0]
        runner_up = ranked[1][1] if len(ranked) > 1 else -1.0
        reported_confidence = max(0.0, min(1.0, confidence))
        if (
            confidence < settings.face_match_threshold
            or confidence - runner_up < settings.face_match_margin
        ):
            return None, None, reported_confidence
        return profile.person_id, profile.name, reported_confidence
