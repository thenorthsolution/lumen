from __future__ import annotations

import os
from functools import lru_cache
from typing import Sequence


DEFAULT_MODEL = "BAAI/bge-m3"


class Embedder:
    def __init__(self, model_name: str = DEFAULT_MODEL) -> None:
        self.model_name = model_name
        self._model = _load_model(model_name)

    def encode(self, texts: Sequence[str]) -> list[list[float]]:
        embeddings = self._model.encode(
            list(texts),
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return [embedding.tolist() for embedding in embeddings]

    def encode_one(self, text: str) -> list[float]:
        return self.encode([text])[0]


@lru_cache(maxsize=2)
def _load_model(model_name: str):
    from sentence_transformers import SentenceTransformer

    local_only = os.environ.get("NLS_EMBED_LOCAL_ONLY", "").lower() in {
        "1",
        "true",
        "yes",
    }

    try:
        return SentenceTransformer(model_name, local_files_only=local_only)
    except Exception as exc:  # pragma: no cover - error mapping path
        message = str(exc)
        if (
            "huggingface.co" in message
            or "adapter_config.json" in message
            or "client has been closed" in message
            or "nodename nor servname provided" in message
        ):
            raise SystemExit(
                "The embedding model could not be loaded from Hugging Face. "
                "This runtime currently cannot download the model. "
                "Set NLS_EMBED_MODEL to a local model directory or pre-download "
                f"'{model_name}' into the local Hugging Face cache. "
                "If you want to force offline mode, set NLS_EMBED_LOCAL_ONLY=1."
            ) from exc
        raise
