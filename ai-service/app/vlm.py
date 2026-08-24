import base64
from time import monotonic

import httpx
from fastapi import HTTPException

from .config import settings


class VisionLanguageModel:
    """Rate-limited Ollama adapter, deliberately separate from frame tracking."""

    def __init__(self):
        self.last_call = 0.0

    async def status(self) -> dict:
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                response = await client.get(f"{settings.ollama_base_url}/api/tags")
                response.raise_for_status()
            models = response.json().get("models", [])
            selected = next((
                model for model in models
                if model.get("name") in {settings.ollama_model, f"{settings.ollama_model}:latest"}
            ), None)
            capabilities = selected.get("capabilities", []) if selected else []
            return {
                "available": selected is not None,
                "model": settings.ollama_model,
                "vision": "vision" in capabilities,
                "capabilities": capabilities,
            }
        except Exception as error:
            return {
                "available": False,
                "model": settings.ollama_model,
                "vision": False,
                "capabilities": [],
                "error": str(error),
            }

    async def analyze_frame(self, image: bytes, prompt: str) -> str:
        wait = settings.qwen_min_interval_seconds - (monotonic() - self.last_call)
        if wait > 0:
            raise HTTPException(429, f"Visual analysis is rate limited; retry in {wait:.1f}s")
        self.last_call = monotonic()
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                tags = await client.get(f"{settings.ollama_base_url}/api/tags")
                tags.raise_for_status()
                names = {model["name"] for model in tags.json().get("models", [])}
                if settings.ollama_model not in names and f"{settings.ollama_model}:latest" not in names:
                    raise HTTPException(503, f"{settings.ollama_model} model is not available in Ollama")
                response = await client.post(
                    f"{settings.ollama_base_url}/api/chat",
                    json={"model": settings.ollama_model, "stream": False, "keep_alive": "5m", "messages": [{
                        "role": "user", "content": prompt,
                        "images": [base64.b64encode(image).decode("ascii")],
                    }]},
                )
                response.raise_for_status()
                return response.json()["message"]["content"]
        except HTTPException:
            raise
        except Exception as error:
            raise HTTPException(503, f"Ollama unavailable: {error}") from error

    async def analyze_scene(self, image: bytes, prompt: str) -> str:
        return await self.analyze_frame(image, prompt)

    async def analyze_event(self, image: bytes, prompt: str) -> str:
        return await self.analyze_frame(image, prompt)

    async def describe_activity(self, image: bytes) -> str:
        return await self.analyze_frame(image, "Briefly describe the visible activity. Do not identify people.")
