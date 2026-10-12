"""The embedding model the experiment uses, through fastembed."""

from fastembed import TextEmbedding

from app.config import Settings


def load_model(settings: Settings) -> TextEmbedding:
    """Load the embedding model, downloading it into the model cache on first use.

    Args:
        settings: Names the model and the cache directory.
    """
    return TextEmbedding(
        model_name=settings.embedding_model, cache_dir=str(settings.model_cache_dir)
    )
