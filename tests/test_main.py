import pytest
import json
import os
from unittest.mock import patch

from backend.main import _parse_model_json, _load_dotenv_file

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
