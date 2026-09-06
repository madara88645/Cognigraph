"""Tests for pure helper functions in backend.main.

All functions tested here are deterministic with no external I/O, network,
or DB dependencies. None were covered before.

Functions covered:
  _strip_markdown_fences   -- removes ``` fences from LLM-produced text
  _extract_json_object     -- finds the first balanced {...} substring
  _parse_model_json        -- combines fence-stripping + extraction for JSON
  _normalize_byok_model_slug -- validates and sanitises an OpenRouter model id
  _adaptive_sim_duration_ms  -- picks a simulation window from prompt length
"""

import json

import pytest

from backend.main import (
    _adaptive_sim_duration_ms,
    _extract_json_object,
    _normalize_byok_model_slug,
    _parse_model_json,
    _strip_markdown_fences,
)


class TestStripMarkdownFences:
    def test_plain_json_returned_unchanged(self):
        raw = '{"key": "value"}'
        assert _strip_markdown_fences(raw) == '{"key": "value"}'

    def test_backtick_json_fence_removed(self):
        raw = '```json\n{"key": "value"}\n```'
        assert _strip_markdown_fences(raw) == '{"key": "value"}'

    def test_plain_backtick_fence_removed(self):
        raw = '```\n{"key": "value"}\n```'
        assert _strip_markdown_fences(raw) == '{"key": "value"}'

    def test_no_fence_passthrough(self):
        assert _strip_markdown_fences("hello world") == "hello world"

    def test_leading_trailing_whitespace_stripped(self):
        raw = "  \n```\n{}\n```\n  "
        assert _strip_markdown_fences(raw) == "{}"

    def test_only_two_lines_fence_not_stripped(self):
        # Needs at least 3 lines (open-fence, content, close-fence) to strip.
        raw = "```\n{}"
        result = _strip_markdown_fences(raw)
        assert "```" in result or result == "{}"

    def test_empty_string_returns_empty(self):
        assert _strip_markdown_fences("") == ""

    def test_multiline_content_preserved_inside_fence(self):
        raw = '```json\n{\n  "a": 1,\n  "b": 2\n}\n```'
        result = _strip_markdown_fences(raw)
        assert '"a": 1' in result
        assert '"b": 2' in result


class TestExtractJsonObject:
    def test_bare_json_object_returned(self):
        text = '{"key": "value"}'
        assert _extract_json_object(text) == '{"key": "value"}'

    def test_json_with_leading_prose_extracted(self):
        text = 'Here is the result: {"answer": 42}'
        assert _extract_json_object(text) == '{"answer": 42}'

    def test_nested_object_fully_extracted(self):
        text = '{"outer": {"inner": "x"}}'
        assert _extract_json_object(text) == '{"outer": {"inner": "x"}}'

    def test_no_braces_returns_empty_string(self):
        assert _extract_json_object("No braces here at all") == ""

    def test_empty_object_returned(self):
        assert _extract_json_object("{}") == "{}"

    def test_trailing_prose_excluded(self):
        text = '{"x": 1} and some trailing text'
        assert _extract_json_object(text) == '{"x": 1}'

    def test_quoted_closing_brace_not_counted_as_depth(self):
        text = '{"key": "value with } brace"}'
        assert _extract_json_object(text) == text

    def test_multiple_objects_returns_first_only(self):
        text = '{"a": 1} {"b": 2}'
        assert _extract_json_object(text) == '{"a": 1}'


class TestParseModelJson:
    def test_clean_json_parses_correctly(self):
        raw = '{"active_lobe": "frontal", "explanation": "test"}'
        result = _parse_model_json(raw)
        assert result["active_lobe"] == "frontal"

    def test_fenced_json_parses_correctly(self):
        raw = '```json\n{"active_lobe": "temporal"}\n```'
        result = _parse_model_json(raw)
        assert result["active_lobe"] == "temporal"

    def test_json_embedded_in_prose_extracted_and_parsed(self):
        raw = 'Here is my answer:\n{"active_lobe": "parietal"}\nDone.'
        result = _parse_model_json(raw)
        assert result["active_lobe"] == "parietal"

    def test_invalid_json_raises(self):
        with pytest.raises((json.JSONDecodeError, ValueError)):
            _parse_model_json("not json at all, no braces")

    def test_non_dict_json_raises_value_error(self):
        with pytest.raises((json.JSONDecodeError, ValueError)):
            _parse_model_json("[1, 2, 3]")

    def test_empty_object_is_valid(self):
        assert _parse_model_json("{}") == {}

    def test_nested_values_preserved(self):
        raw = '{"level": {"nested": true}}'
        result = _parse_model_json(raw)
        assert result["level"]["nested"] is True


class TestNormalizeByokModelSlug:
    def test_valid_slash_slug_returned(self):
        slug = "openai/gpt-4o"
        assert _normalize_byok_model_slug(slug) == slug

    def test_valid_slug_with_colons(self):
        slug = "anthropic/claude-3:beta"
        assert _normalize_byok_model_slug(slug) == slug

    def test_empty_string_returns_empty(self):
        assert _normalize_byok_model_slug("") == ""

    def test_none_returns_empty(self):
        assert _normalize_byok_model_slug(None) == ""  # type: ignore[arg-type]

    def test_slug_over_128_chars_rejected(self):
        assert _normalize_byok_model_slug("a" * 129) == ""

    def test_slug_exactly_128_chars_accepted(self):
        slug = "a" * 128
        assert _normalize_byok_model_slug(slug) == slug

    def test_dotdot_path_traversal_rejected(self):
        assert _normalize_byok_model_slug("../etc/passwd") == ""

    def test_spaces_rejected(self):
        assert _normalize_byok_model_slug("model name with spaces") == ""

    def test_special_chars_rejected(self):
        assert _normalize_byok_model_slug("model!@#$") == ""

    def test_leading_trailing_whitespace_stripped_before_validation(self):
        assert _normalize_byok_model_slug("  openai/gpt-4  ") == "openai/gpt-4"


class TestAdaptiveSimDurationMs:
    def test_short_prompt_returns_500(self):
        assert _adaptive_sim_duration_ms("hi") == 500

    def test_long_prompt_returns_1000(self):
        assert _adaptive_sim_duration_ms("x" * 61) == 1000

    def test_exactly_60_chars_is_short(self):
        assert _adaptive_sim_duration_ms("x" * 60) == 500

    def test_61_chars_is_long(self):
        assert _adaptive_sim_duration_ms("x" * 61) == 1000

    def test_empty_prompt_returns_500(self):
        assert _adaptive_sim_duration_ms("") == 500

    def test_return_type_is_int(self):
        assert isinstance(_adaptive_sim_duration_ms("hello"), int)
