"""Vercel FastAPI entrypoint (supported path per Vercel docs)."""

from backend.main import app

__all__ = ["app"]
