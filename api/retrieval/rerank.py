"""Local DeBERTa cross-encoder for scenario/action candidate pairs."""
from pathlib import Path


class DebertaReranker:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        self.tokenizer = None
        self.model = None
        if not (model_dir / "config.json").is_file():
            raise FileNotFoundError(f"DeBERTa checkpoint not found at {model_dir}")
        try:
            import torch
            from transformers import AutoModelForSequenceClassification, AutoTokenizer
        except ImportError as exc:
            raise RuntimeError(
                "A DeBERTa reranker checkpoint exists but optional dependencies are missing; "
                "install api/requirements-reranker.txt"
            ) from exc
        self.tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True, use_fast=True)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_dir, local_files_only=True)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model.to(self.device)
        self.model.eval()
        self.torch = torch

    def __bool__(self) -> bool:
        return self.model is not None

    def score(self, pairs: list[tuple[str, str]]) -> list[float]:
        if not self:
            return []
        scores = []
        # Small batches bound memory on the offline demo laptop while keeping GPU use optional.
        for start in range(0, len(pairs), 8):
            batch = pairs[start:start + 8]
            encoded = self.tokenizer(
                [query for query, _ in batch], [candidate for _, candidate in batch],
                padding=True, truncation=True, max_length=384, return_tensors="pt",
            ).to(self.device)
            with self.torch.inference_mode():
                logits = self.model(**encoded).logits
            if logits.shape[-1] == 1:
                batch_scores = logits[:, 0]
            elif logits.shape[-1] == 2:
                batch_scores = logits[:, 1]
            else:
                raise ValueError(f"Expected a 1- or 2-class reranker head, found {logits.shape[-1]} classes")
            scores.extend(batch_scores.float().cpu().tolist())
        return scores
