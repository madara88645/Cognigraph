import pytest
import json

from backend.main import _parse_model_json, _strip_markdown_fences

def test_strip_markdown_fences_no_fences():
    raw = '{"key": "value"}'
    assert _strip_markdown_fences(raw) == '{"key": "value"}'

def test_strip_markdown_fences_standard():
    raw = '```json\n{"key": "value"}\n```'
    assert _strip_markdown_fences(raw) == '{"key": "value"}'

def test_strip_markdown_fences_multiline():
    raw = '```\nline1\nline2\n```'
    assert _strip_markdown_fences(raw) == 'line1\nline2'

def test_strip_markdown_fences_incomplete_missing_end():
    # Only 2 lines, so len(lines) >= 3 is False
    raw = '```json\n{"key": "value"}'
    assert _strip_markdown_fences(raw) == '```json\n{"key": "value"}'

def test_strip_markdown_fences_missing_end_but_long():
    # More than 3 lines but missing end fence
    raw = '```json\n{"key": "value"}\n"extra": "value"}'
    assert _strip_markdown_fences(raw) == '{"key": "value"}\n"extra": "value"}'

def test_strip_markdown_fences_extra_whitespace():
    raw = '  \n```json\n{"key": "value"}\n``` \n '
    assert _strip_markdown_fences(raw) == '{"key": "value"}'

def test_parse_model_json_valid_dict():
    # Test valid JSON string without markdown
    raw = '{"key": "value", "number": 42}'
    result = _parse_model_json(raw)
    assert isinstance(result, dict)
    assert result == {"key": "value", "number": 42}

def test_parse_model_json_with_markdown_fences():
    # Test valid JSON string wrapped in markdown fences
    raw = '```json\n{"key": "value"}\n```'
    result = _parse_model_json(raw)
    assert result == {"key": "value"}

def test_parse_model_json_invalid_json():
    # Test invalid JSON syntax
    raw = '{"key": "value", '  # Missing closing brace
    with pytest.raises(json.JSONDecodeError):
        _parse_model_json(raw)

def test_parse_model_json_not_a_dict():
    # Test valid JSON but not a dictionary (e.g., a list)
    raw = '["item1", "item2"]'
    with pytest.raises(ValueError, match="Model output is not a JSON object."):
        _parse_model_json(raw)

    # Test valid JSON but a string
    raw = '"just a string"'
    with pytest.raises(ValueError, match="Model output is not a JSON object."):
        _parse_model_json(raw)
