from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    node_api_url: str = "http://localhost:4000"
    internal_service_token: str = "local-development-token"
    cors_origin: str = "http://localhost:5173"
    face_model_name: str = "buffalo_l"
    face_match_threshold: float = 0.40
    face_match_margin: float = 0.10
    face_detection_threshold: float = 0.55
    recognition_min_face_pixels: int = 64
    recognition_min_detection_score: float = 0.55
    recognition_min_blur_score: float = 20.0
    recognition_confirm_frames: int = 3
    recognition_interval_frames: int = 2
    recognition_revalidate_frames: int = 12
    recognition_mismatch_frames: int = 3
    track_lost_grace_seconds: float = 7.0
    track_appearance_threshold: float = 0.15
    ai_process_fps: int = 24
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5vl:7b"
    qwen_min_interval_seconds: float = 10.0


settings = Settings()
