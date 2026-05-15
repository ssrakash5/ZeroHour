from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ENV_FILE = Path(__file__).parent.parent / ".env"
ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / "env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(ROOT_ENV_FILE), str(BACKEND_ENV_FILE)),
        extra="ignore",
    )
    DATABASE_URL: str = "postgresql+psycopg://zerohour:zerohour@localhost:5432/zerohour"
    REDIS_URL: str = "redis://localhost:6379"
    GEMINI_API_KEY: str = ""
    GEMMA_MODEL: str = "gemma-4-26b-a4b-it"
    GEMMA_TRIAGE_MODEL: str = "gemma-4-e2b-it"
    GEMINI_INSECURE_SKIP_VERIFY: bool = True


settings = Settings()

_is_remote = all(
    host not in settings.DATABASE_URL
    for host in ("localhost", "127.0.0.1", "@postgres:", "@postgres/")
)

# prepare_threshold=None disables server-side prepared statements, required for
# Supabase's pgbouncer transaction pooler (port 6543).
_connect_args = {"prepare_threshold": None, "sslmode": "require"} if _is_remote else {}

engine = create_async_engine(settings.DATABASE_URL, echo=False, connect_args=_connect_args)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with SessionLocal() as session:
        yield session


async def create_tables():
    from db import models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
