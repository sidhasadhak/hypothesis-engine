"""LLM provider abstraction — Ollama (local) or Anthropic (cloud), both via instructor.

Two roles, two model slots:
  coder   — SQL generation, hypothesis scoring, decomposition (structured reasoning)
  narrator — report synthesis (long-form prose)

Env vars:
  HERMES_CODER_MODEL     default: qwen2.5-coder:32b
  HERMES_NARRATOR_MODEL  default: llama3.3:70b
  HERMES_MODEL           fallback for both if role-specific var is unset
  HERMES_BACKEND         ollama (default) | anthropic
"""
from __future__ import annotations

import os
from typing import Literal, Type, TypeVar

import instructor
from openai import OpenAI
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

Role = Literal["coder", "narrator"]

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")

_FALLBACK = os.getenv("HERMES_MODEL", "qwen2.5-coder:32b")
_MODEL_FOR_ROLE: dict[Role, str] = {
    "coder":   os.getenv("HERMES_CODER_MODEL",   _FALLBACK),
    "narrator": os.getenv("HERMES_NARRATOR_MODEL", os.getenv("HERMES_MODEL", "llama3.3:70b")),
}


def _build_ollama_client() -> instructor.Instructor:
    raw = OpenAI(base_url=OLLAMA_BASE_URL, api_key="ollama")
    return instructor.from_openai(raw, mode=instructor.Mode.JSON)


def _build_anthropic_client() -> instructor.Instructor:
    import anthropic
    raw = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return instructor.from_anthropic(raw)


class LLMProvider:
    """Call .complete() with a Pydantic response_model, get a typed object back."""

    def __init__(self, backend: str, role: Role):
        self.backend = backend
        self.role = role
        if backend == "ollama":
            self._client = _build_ollama_client()
            self._model = _MODEL_FOR_ROLE[role]
        elif backend == "anthropic":
            self._client = _build_anthropic_client()
            # Anthropic: one capable model handles both roles
            self._model = os.getenv("HERMES_MODEL", "claude-sonnet-4-6")
        else:
            raise ValueError(f"Unknown backend: {backend!r}. Use 'ollama' or 'anthropic'.")

    def complete(
        self,
        system: str,
        user: str,
        response_model: Type[T],
        temperature: float = 0.1,
    ) -> T:
        if self.backend == "anthropic":
            return self._client.messages.create(
                model=self._model,
                max_tokens=4096,
                system=system,
                messages=[{"role": "user", "content": user}],
                response_model=response_model,
            )
        else:
            return self._client.chat.completions.create(
                model=self._model,
                temperature=temperature,
                response_model=response_model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )


# Per-role provider cache — one client per role per process
_providers: dict[Role, LLMProvider] = {}


def get_provider(role: Role = "coder") -> LLMProvider:
    if role not in _providers:
        backend = os.getenv("HERMES_BACKEND", "ollama")
        _providers[role] = LLMProvider(backend=backend, role=role)
    return _providers[role]
