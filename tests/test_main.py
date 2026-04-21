import json
import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import (
    _classification_system_instruction,
    _extract_chat_message_text,
    _load_dotenv_file,
    _normalize_byok_model_slug,
    _parse_model_json,
    _resolve_openrouter_api_key,
    _select_openrouter_model,
    _strip_markdown_fences,
    app,
    run_snn,
)
from backend.neuromodulation import resolve_snn_modulation

client = TestClient(app)


def test_strip_markdown_fences_with_fences():
    raw = '```json\n{"key": "value"}\n```'
    assert _strip_markdown_fences(raw) == '{"key": "value"}'


def test_strip_markdown_fences_without_fences():
    raw = '{"key": "value"}'
    assert _strip_markdown_fences(raw) == '{"key": "value"}'


def test_strip_markdown_fences_empty_string():
    assert _strip_markdown_fences("") == ""


def test_strip_markdown_fences_whitespace():
    raw = '   \n```json\n{"key": "value"}\n```\n   '
    assert _strip_markdown_fences(raw) == '{"key": "value"}'


def test_strip_markdown_fences_incomplete_less_than_3_lines():
    raw = '```json\n{"key": "value"}'
    # According to _strip_markdown_fences logic:
    # if len(lines) >= 3 is False, it just returns text.strip()
    assert _strip_markdown_fences(raw) == '```json\n{"key": "value"}'


def test_strip_markdown_fences_missing_closing_fence():
    raw = '```json\n{"key": "value"}\nother'
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


def test_extract_chat_message_text_none_or_not_dict():
    assert _extract_chat_message_text(None) == ""
    assert _extract_chat_message_text("not a dict") == ""
    assert _extract_chat_message_text(123) == ""
    assert _extract_chat_message_text(["list"]) == ""


def test_extract_chat_message_text_no_content():
    assert _extract_chat_message_text({}) == ""
    assert _extract_chat_message_text({"other_key": "value"}) == ""
    assert _extract_chat_message_text({"content": None}) == ""


def test_extract_chat_message_text_string_content():
    assert _extract_chat_message_text({"content": "hello world"}) == "hello world"
    assert _extract_chat_message_text({"content": "  hello world  "}) == "hello world"


def test_extract_chat_message_text_list_of_strings():
    assert _extract_chat_message_text({"content": ["hello", " ", "world"]}) == "hello world"


def test_extract_chat_message_text_list_of_dicts():
    content = [
        {"type": "text", "text": "hello "},
        {"content": "world"},
        {"type": "image_url", "image_url": "http://example.com/image.jpg"},  # Ignored
    ]
    assert _extract_chat_message_text({"content": content}) == "hello world"


def test_extract_chat_message_text_list_mixed_and_unusual():
    content = [
        "hello ",
        123,  # Ignored (not str or dict)
        {"type": "text", "text": "world "},
        {"type": "text", "text": 456},  # Ignored (text is not str)
        {"content": "!"},
        {"content": 789},  # Ignored (content is not str)
        ["nested list"],  # Ignored (not str or dict)
    ]
    assert _extract_chat_message_text({"content": content}) == "hello world !"


def test_extract_chat_message_text_unusual_types():
    assert _extract_chat_message_text({"content": 12345}) == "12345"
    assert _extract_chat_message_text({"content": True}) == "True"
    assert _extract_chat_message_text({"content": 3.14}) == "3.14"


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


def test_healthz_success():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_resolve_openrouter_api_key_prefers_override():
    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "server-key"}, clear=True):
        assert _resolve_openrouter_api_key("user-key") == "user-key"


def test_resolve_openrouter_api_key_reads_environment():
    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "server-key"}, clear=True):
        assert _resolve_openrouter_api_key("") == "server-key"


def test_resolve_openrouter_api_key_missing_raises():
    with (
        patch.dict(os.environ, {}, clear=True),
        pytest.raises(RuntimeError, match="OPENROUTER_API_KEY is not set"),
    ):
        _resolve_openrouter_api_key("")


def test_select_openrouter_model_uses_demo_without_byok():
    with patch.multiple(
        "backend.main",
        OPENROUTER_MODEL="expensive-model",
        OPENROUTER_DEMO_MODEL="cheap-model",
    ):
        assert _select_openrouter_model("") == "cheap-model"
        assert _select_openrouter_model("   ") == "cheap-model"


def test_select_openrouter_model_uses_byok_model_when_header_present():
    with patch.multiple(
        "backend.main",
        OPENROUTER_MODEL="expensive-model",
        OPENROUTER_DEMO_MODEL="cheap-model",
    ):
        assert _select_openrouter_model("sk-or-user") == "expensive-model"


def test_select_openrouter_model_ignores_model_override_without_byok():
    with patch.multiple(
        "backend.main",
        OPENROUTER_MODEL="expensive-model",
        OPENROUTER_DEMO_MODEL="cheap-model",
    ):
        assert _select_openrouter_model("", "anthropic/claude-3-haiku") == "cheap-model"
        assert _select_openrouter_model("   ", "openai/gpt-4o") == "cheap-model"


def test_select_openrouter_model_byok_respects_model_slug():
    with patch.multiple(
        "backend.main",
        OPENROUTER_MODEL="expensive-model",
        OPENROUTER_DEMO_MODEL="cheap-model",
    ):
        assert _select_openrouter_model("sk", "openai/gpt-4o") == "openai/gpt-4o"
        assert _select_openrouter_model("sk", "  meta-llama/llama-3.1-8b-instruct  ") == (
            "meta-llama/llama-3.1-8b-instruct"
        )


def test_select_openrouter_model_byok_invalid_slug_falls_back_to_env():
    with patch.multiple(
        "backend.main",
        OPENROUTER_MODEL="expensive-model",
        OPENROUTER_DEMO_MODEL="cheap-model",
    ):
        assert _select_openrouter_model("sk", "") == "expensive-model"
        assert _select_openrouter_model("sk", "evil\nmodel") == "expensive-model"
        assert _select_openrouter_model("sk", "x" * 200) == "expensive-model"
        assert _select_openrouter_model("sk", "../../etc/passwd") == "expensive-model"


def test_normalize_byok_model_slug_valid():
    assert _normalize_byok_model_slug("openai/gpt-4o") == "openai/gpt-4o"
    assert (
        _normalize_byok_model_slug("meta-llama/llama-3.1-8b-instruct")
        == "meta-llama/llama-3.1-8b-instruct"
    )
    assert (
        _normalize_byok_model_slug("anthropic/claude-3.5-sonnet:beta")
        == "anthropic/claude-3.5-sonnet:beta"
    )
    assert _normalize_byok_model_slug("my_custom_model_123") == "my_custom_model_123"


def test_normalize_byok_model_slug_whitespace_stripped():
    assert _normalize_byok_model_slug("   openai/gpt-4o  ") == "openai/gpt-4o"
    assert _normalize_byok_model_slug("\n\t  meta-llama/llama-3 \r\n") == "meta-llama/llama-3"


def test_normalize_byok_model_slug_empty_and_none():
    assert _normalize_byok_model_slug("") == ""
    assert _normalize_byok_model_slug(None) == ""  # type: ignore
    assert _normalize_byok_model_slug("   ") == ""
    assert _normalize_byok_model_slug("\n\t\r") == ""


def test_normalize_byok_model_slug_too_long():
    assert _normalize_byok_model_slug("a" * 128) == "a" * 128
    assert _normalize_byok_model_slug("a" * 129) == ""


def test_normalize_byok_model_slug_directory_traversal():
    assert _normalize_byok_model_slug("../etc/passwd") == ""
    assert _normalize_byok_model_slug("some/model/../path") == ""
    assert _normalize_byok_model_slug("..") == ""


def test_normalize_byok_model_slug_invalid_characters():
    assert _normalize_byok_model_slug("model space") == ""
    assert _normalize_byok_model_slug("model<script>") == ""
    assert _normalize_byok_model_slug("model;drop") == ""
    assert _normalize_byok_model_slug("evil\nmodel") == ""
    assert _normalize_byok_model_slug("model\\with\\slash") == ""
    assert _normalize_byok_model_slug('model"quote') == ""


def test_classification_system_instruction_demo_includes_persona():
    text = _classification_system_instruction("")
    assert "senior cognitive neuroscientist" in text
    assert "educational visualization" in text
    assert "STRICT JSON only" in text or "STRICT JSON" in text


def test_classification_system_instruction_byok_is_compact():
    text = _classification_system_instruction("user-key")
    assert text.startswith("You are a neuroscience classifier.")
    assert "senior cognitive neuroscientist" not in text


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
        'TEST_VAR3="value3"\n'
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
        "\n" "   \n" "# This is a comment\n" "INVALID_LINE_NO_EQUALS\n" "TEST_VAR5=value5"
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


def test_run_snn_invalid_lobe():
    """Verify that calling run_snn with an invalid lobe raises a ValueError."""
    params = resolve_snn_modulation("adrenaline", 1.0)
    with pytest.raises(ValueError, match="Unknown lobe: invalid_lobe"):
        run_snn("invalid_lobe", params)  # type: ignore
