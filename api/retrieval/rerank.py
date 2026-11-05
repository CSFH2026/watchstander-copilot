"""Local DeBERTa cross-encoder for scenario/action candidate pairs."""
import json
import math
from pathlib import Path


class DebertaReranker:
    def __init__(self, model_dir: Path):
        self.model_dir = model_dir
        self.tokenizer = None
        self.model = None
        self.calibration_path = model_dir / "calibration.json"
        self.calibration = (
            json.loads(self.calibration_path.read_text(encoding="utf-8"))
            if self.calibration_path.is_file() else None
        )
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

    def raw_logits(self, pairs: list[tuple[str, str]]) -> list[tuple[float, float]]:
        if not self:
            return []
        scores: list[tuple[float, float]] = []
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
                batch_scores = self.torch.cat((self.torch.zeros_like(logits[:, 0:1]), logits), dim=1)
            elif logits.shape[-1] == 2:
                batch_scores = logits
            else:
                raise ValueError(f"Expected a 1- or 2-class reranker head, found {logits.shape[-1]} classes")
            scores.extend(tuple(row) for row in batch_scores.float().cpu().tolist())
        return scores

    def score_details(self, pairs: list[tuple[str, str]]) -> list[tuple[float, float]]:
        """Return (positive-class logit margin, calibrated relevance probability)."""
        if self.calibration is None:
            raise RuntimeError(
                f"Calibration parameters are missing: {self.calibration_path}. "
                "Run scripts/calibrate_reranker.py first."
            )
        logits = self.raw_logits(pairs)
        slope = float(self.calibration["slope"])
        intercept = float(self.calibration["intercept"])
        details = []
        for negative, positive in logits:
            margin = positive - negative
            scaled = max(-60.0, min(60.0, slope * margin + intercept))
            probability = 1.0 / (1.0 + math.exp(-scaled))
            details.append((margin, probability))
        return details

    def score(self, pairs: list[tuple[str, str]]) -> list[float]:
        """Return calibrated P(relevant) scores for reranking."""
        return [probability for _, probability in self.score_details(pairs)]
