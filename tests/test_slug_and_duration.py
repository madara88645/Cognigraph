"""Unit tests for two previously untested pure helpers in backend.main.

* ``_normalize_byok_model_slug`` — sanitises the user-supplied OpenRouter model
  slug before it reaches the API.  The function is security-relevant: an invalid
  or malformed slug must be rejected (returned as '') rather than forwarded.

* ``_adaptive_sim_duration_ms`` — picks the Brian2 simulation window (500 ms for
  short prompts, 1 000 ms for longer ones).  The threshold is a named constant
  (``SIM_SHORT_PROMPT_CHAR_THRESHOLD = 60``), so boundary values are the critical
  cases.
"""

import pytest

from backend.main import (
    SIM_DURATION_MS_DEFAULT,
    SIM_DURATION_MS_SHORT,
    SIM_SHORT_PROMPT_CHAR_THRESHOLD,
    _adaptive_sim_duration_ms,
    _normalize_byok_model_slug,
)


# ---------------------------------------------------------------------------
# _normalize_byok_model_slug
# ---------------------------------------------------------------------------


class TestNormalizeByokModelSlug:
    def test_empty_string_returns_empty(self) -> None:
        assert _normalize_byok_model_slug("") == ""

    def test_whitespace_only_returns_empty(self) -> None:
        assert _normalize_byok_model_slug("   ") == ""

    def test_none_like_falsy_returns_empty(self) -> None:
        assert _normalize_byok_model_slug(None) == ""  # type: ignore[arg-type]

    def test_simple_valid_slug_returned_unchanged(self) -> None:
        slug = "openai/gpt-4o"
        assert _normalize_byok_model_slug(slug) == slug

    def test_slug_with_colon_and_version_returned_unchanged(self) -> None:
        slug = "anthropic/claude-3.5-sonnet:beta"
        assert _normalize_byok_model_slug(slug) == slug

    def test_slug_with_numbers_and_dots_returned_unchanged(self) -> None:
        slug = "meta-llama/llama-3.1-8b-instruct"
        assert _normalize_byok_model_slug(slug) == slug

    def test_double_dot_path_traversal_rejected(self) -> None:
        assert _normalize_byok_model_slug("../etc/passwd") == ""

    def test_slug_too_long_rejected(self) -> None:
        long_slug = "a" * 129
        assert _normalize_byok_model_slug(long_slug) == ""

    def test_slug_at_max_length_accepted(self) -> None:
        slug = "a" * 128
        assert _normalize_byok_model_slug(slug) == slug

    def test_space_in_slug_rejected(self) -> None:
        assert _normalize_byok_model_slug("openai /gpt-4") == ""

    def test_angle_bracket_injection_rejected(self) -> None:
        assert _normalize_byok_model_slug("<script>") == ""

    def test_semicolon_rejected(self) -> None:
        assert _normalize_byok_model_slug("model;rm -rf /") == ""

    def test_underscore_accepted(self) -> None:
        slug = "some_provider/some_model"
        assert _normalize_byok_model_slug(slug) == slug


# ---------------------------------------------------------------------------
# _adaptive_sim_duration_ms
# ---------------------------------------------------------------------------


class TestAdaptiveSimDurationMs:
    def test_empty_prompt_returns_short_duration(self) -> None:
        assert _adaptive_sim_duration_ms("") == SIM_DURATION_MS_SHORT

    def test_short_prompt_returns_short_duration(self) -> None:
        short = "x" * (SIM_SHORT_PROMPT_CHAR_THRESHOLD - 1)
        assert _adaptive_sim_duration_ms(short) == SIM_DURATION_MS_SHORT

    def test_prompt_at_threshold_returns_short_duration(self) -> None:
        at_limit = "x" * SIM_SHORT_PROMPT_CHAR_THRESHOLD
        assert _adaptive_sim_duration_ms(at_limit) == SIM_DURATION_MS_SHORT

    def test_prompt_one_over_threshold_returns_default_duration(self) -> None:
        over = "x" * (SIM_SHORT_PROMPT_CHAR_THRESHOLD + 1)
        assert _adaptive_sim_duration_ms(over) == SIM_DURATION_MS_DEFAULT

    def test_long_prompt_returns_default_duration(self) -> None:
        long_prompt = "Describe the neural correlates of working memory in detail." * 5
        assert _adaptive_sim_duration_ms(long_prompt) == SIM_DURATION_MS_DEFAULT

    def test_short_duration_constant_value(self) -> None:
        assert SIM_DURATION_MS_SHORT == 500

    def test_default_duration_constant_value(self) -> None:
        assert SIM_DURATION_MS_DEFAULT == 1000

    def test_threshold_constant_value(self) -> None:
        assert SIM_SHORT_PROMPT_CHAR_THRESHOLD == 60
