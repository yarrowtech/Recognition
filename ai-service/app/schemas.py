from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class Detection(BaseModel):
    trackId: int
    personId: str | None = None
    label: str
    confidence: float | None = None
    box: BoundingBox


class FrameResult(BaseModel):
    cameraId: str
    timestamp: str
    width: int
    height: int
    inferenceMs: float
    tracks: list[Detection]
