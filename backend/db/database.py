from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_FILE), extra="ignore")
    DATABASE_URL: str = "postgresql+psycopg://zerohour:zerohour@localhost:5432/zerohour"
    REDIS_URL: str = "redis://localhost:6379"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemma-4-27b-it"


settings = Settings()

_is_remote = "localhost" not in settings.DATABASE_URL and "127.0.0.1" not in settings.DATABASE_URL

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
