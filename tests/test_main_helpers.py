"""Unit tests for small pure helpers in backend.main.

These cover two previously untested helpers:

* ``_classification_cache_key`` — builds the TTLCache key for a classification
  request. Its whitespace/case normalization is what lets semantically identical
  prompts share a cache entry, so a regression here would silently tank the hit
  rate (or, worse, collide unrelated prompts).
* ``_openrouter_response_text`` — pulls assistant text out of an OpenRouter chat
  response, including the fallback to a top-level ``text``/``content`` field when
  ``message.content`` is empty.
"""

import httpx

from backend.main import _classification_cache_key, _openrouter_response_text


def test_cache_key_collapses_internal_whitespace() -> None:
    spaced = _classification_cache_key("morning   cortisol\tpulse", "model-x", False)
    tight = _classification_cache_key("morning cortisol pulse", "model-x", False)
    assert spaced == tight


def test_cache_key_is_case_insensitive() -> None:
    upper = _classification_cache_key("Exam Panic", "model-x", False)
    lower = _classification_cache_key("exam panic", "model-x", False)
    assert upper == lower


def test_cache_key_strips_surrounding_whitespace() -> None:
    padded = _classification_cache_key("  focus task  ", "model-x", False)
    bare = _classification_cache_key("focus task", "model-x", False)
    assert padded == bare


def test_cache_key_distinguishes_model_and_demo_flag() -> None:
    base = _classification_cache_key("calm walk", "model-a", False)
    other_model = _classification_cache_key("calm walk", "model-b", False)
    demo = _classification_cache_key("calm walk", "model-a", True)
    assert base != other_model
    assert base != demo
    # The flag and model name are prefixed before the normalized prompt.
    assert base.startswith("model-a:False:")
    assert demo.startswith("model-a:True:")


def test_response_text_reads_message_content() -> None:
    response = httpx.Response(
        200,
        json={"choices": [{"message": {"content": "  hello world  "}}]},
    )
    assert _openrouter_response_text(response) == "hello world"


def test_response_text_joins_content_parts() -> None:
    response = httpx.Response(
        200,
        json={
            "choices": [
                {
                    "message": {
                        "content": [
                            {"type": "text", "text": "part-a "},
                            {"type": "text", "text": "part-b"},
                        ]
                    }
                }
            ]
        },
    )
    assert _openrouter_response_text(response) == "part-a part-b"


def test_response_text_falls_back_to_choice_text() -> None:
    response = httpx.Response(
        200,
        json={"choices": [{"message": {"content": ""}, "text": "fallback body"}]},
    )
    assert _openrouter_response_text(response) == "fallback body"
