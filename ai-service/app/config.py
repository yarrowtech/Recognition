from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    node_api_url: str = "http://localhost:4000"
    internal_service_token: str = "local-development-token"
    cors_origin: str = "http://localhost:5173"
    face_model_name: str = "buffalo_l"
    face_match_threshold: float = 0.45
    face_detection_threshold: float = 0.55
    track_lost_grace_seconds: float = 7.0
    ai_process_fps: int = 24
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5vl:7b"
    qwen_min_interval_seconds: float = 10.0


settings = Settings()
