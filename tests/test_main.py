import pytest
import json
import os
from unittest.mock import patch
from fastapi.testclient import TestClient

from backend.main import _parse_model_json, _strip_markdown_fences, _load_dotenv_file, app

client = TestClient(app)

def test_strip_markdown_fences_with_fences():
    raw = "```json\n{\"key\": \"value\"}\n```"
    assert _strip_markdown_fences(raw) == '{"key": "value"}'

def test_strip_markdown_fences_without_fences():
    raw = "{\"key\": \"value\"}"
    assert _strip_markdown_fences(raw) == '{"key": "value"}'

def test_strip_markdown_fences_empty_string():
    assert _strip_markdown_fences("") == ""

def test_strip_markdown_fences_whitespace():
    raw = "   \n```json\n{\"key\": \"value\"}\n```\n   "
    assert _strip_markdown_fences(raw) == '{"key": "value"}'

def test_strip_markdown_fences_incomplete_less_than_3_lines():
    raw = "```json\n{\"key\": \"value\"}"
    # According to _strip_markdown_fences logic:
    # if len(lines) >= 3 is False, it just returns text.strip()
    assert _strip_markdown_fences(raw) == "```json\n{\"key\": \"value\"}"

def test_strip_markdown_fences_missing_closing_fence():
    raw = "```json\n{\"key\": \"value\"}\nother"
    # Lines: ['```json', '{"key": "value"}', 'other']
    # len >= 3 is True. lines = lines[1:] -> ['{"key": "value"}', 'other']
    # lines[-1] != '```' so it joins them.
    assert _strip_markdown_fences(raw) == '{"key": "value"}\nother'

def test_strip_markdown_fences_empty_fences():
    raw = "```\n\n```"
    assert _strip_markdown_fences(raw) == ""

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

def test_serve_index_success():
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")

def test_serve_index_not_found():
    with patch("backend.main.FRONTEND_INDEX") as mock_index:
        mock_index.exists.return_value = False
        response = client.get("/")
        assert response.status_code == 500
        assert response.json() == {"detail": "Frontend index.html not found."}

@patch("backend.main.ENV_FILE")
def test_load_dotenv_file_not_exists(mock_env_file):
    mock_env_file.exists.return_value = False
    with patch.dict(os.environ, {}, clear=True):
        _load_dotenv_file()
    mock_env_file.read_text.assert_not_called()

@patch("backend.main.ENV_FILE")
def test_load_dotenv_file_valid_lines(mock_env_file):
    mock_env_file.exists.return_value = True
    mock_env_file.read_text.return_value = (
        "TEST_VAR1=value1\n"
        "  TEST_VAR2  =  value2  \n"
        "TEST_VAR3=\"value3\"\n"
        "TEST_VAR4='value4'"
    )
    with patch.dict(os.environ, {}, clear=True):
        _load_dotenv_file()
        assert os.environ.get("TEST_VAR1") == "value1"
        assert os.environ.get("TEST_VAR2") == "value2"
        assert os.environ.get("TEST_VAR3") == "value3"
        assert os.environ.get("TEST_VAR4") == "value4"

@patch("backend.main.ENV_FILE")
def test_load_dotenv_file_ignored_lines(mock_env_file):
    mock_env_file.exists.return_value = True
    mock_env_file.read_text.return_value = (
        "\n"
        "   \n"
        "# This is a comment\n"
        "INVALID_LINE_NO_EQUALS\n"
        "TEST_VAR5=value5"
    )
    with patch.dict(os.environ, {}, clear=True):
        _load_dotenv_file()
        assert os.environ.get("TEST_VAR5") == "value5"
        assert len(os.environ) == 1

@patch("backend.main.ENV_FILE")
def test_load_dotenv_file_existing_vars_not_overwritten(mock_env_file):
    mock_env_file.exists.return_value = True
    mock_env_file.read_text.return_value = "TEST_VAR6=new_value"

    with patch.dict(os.environ, {"TEST_VAR6": "old_value"}, clear=True):
        _load_dotenv_file()
        assert os.environ.get("TEST_VAR6") == "old_value"
