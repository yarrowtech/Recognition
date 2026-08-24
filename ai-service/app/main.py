import logging
from datetime import datetime, timezone

import cv2
import httpx
import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .recognition import ProfileIndex
from .schemas import FrameResult
from .vision import FaceEngine
from .vlm import VisionLanguageModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
profiles = ProfileIndex()
engine = FaceEngine(profiles)
vlm = VisionLanguageModel()
app = FastAPI(title="Sentinel AI Service", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin.split(","), allow_methods=["*"], allow_headers=["*"])


def decode_image(data: bytes) -> np.ndarray:
    frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(400, "Malformed or unsupported image")
    return frame


@app.get("/health")
async def health():
    available = await run_in_threadpool(lambda: engine.available)
    vision_model = await vlm.status()
    try:
        import onnxruntime
        available_providers = onnxruntime.get_available_providers()
    except ImportError:
        available_providers = []
    ready = available and engine.using_gpu and vision_model["available"] and vision_model["vision"]
    return {
        "status": "ok" if ready else "degraded",
        "faceModel": available,
        "model": settings.face_model_name,
        "matchThreshold": settings.face_match_threshold,
        "matchMargin": settings.face_match_margin,
        "recognitionPolicy": {
            "confirmFrames": settings.recognition_confirm_frames,
            "revalidateFrames": settings.recognition_revalidate_frames,
            "mismatchFrames": settings.recognition_mismatch_frames,
            "minimumFacePixels": settings.recognition_min_face_pixels,
        },
        "availableProviders": available_providers,
        "modelProviders": engine.model_providers,
        "gpu": engine.using_gpu,
        "visionModel": vision_model,
    }


@app.post("/v1/process-frame", response_model=FrameResult)
async def process_frame(cameraId: str = Form(...), image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(415, "An image file is required")
    frame = decode_image(await image.read())
    await profiles.refresh_if_needed()
    try:
        tracks, inference_ms = await run_in_threadpool(engine.process, cameraId, frame)
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error
    timestamp = datetime.now(timezone.utc).isoformat()
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            await client.post(
                f"{settings.node_api_url}/internal/observations",
                headers={"x-service-token": settings.internal_service_token},
                json={"cameraId": cameraId, "timestamp": timestamp, "tracks": [
                    {key: track[key] for key in ("trackId", "personId", "label", "confidence")} for track in tracks
                ]},
            )
    except Exception as error:
        logging.warning("Node observation callback unavailable: %s", error)
    return {"cameraId": cameraId, "timestamp": timestamp, "width": frame.shape[1], "height": frame.shape[0], "inferenceMs": inference_ms, "tracks": tracks}


@app.post("/v1/enroll")
async def enroll(image: UploadFile = File(...), x_service_token: str | None = Header(None)):
    if x_service_token != settings.internal_service_token:
        raise HTTPException(401, "Invalid service token")
    frame = decode_image(await image.read())
    try:
        embedding = await run_in_threadpool(engine.enrollment_embedding, frame)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(422 if isinstance(error, ValueError) else 503, str(error)) from error
    return {"embedding": embedding.astype(float).tolist(), "modelName": "InsightFace", "modelVersion": settings.face_model_name}


@app.post("/v1/analyze")
async def analyze(prompt: str = Form(..., min_length=3, max_length=500), image: UploadFile = File(...)):
    data = await image.read()
    decode_image(data)
    response = await vlm.analyze_scene(data, prompt)
    return {"response": response, "model": settings.ollama_model}
