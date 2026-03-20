"""Cycling ML Service — placeholder (real logic added in WP03)."""

from fastapi import FastAPI

app = FastAPI(title="Cycling ML Service")


@app.get("/health")
def health():
    return {"status": "no_model", "model_version": None, "models_loaded": []}
