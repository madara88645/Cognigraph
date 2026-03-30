import pytest
import asyncio
from fastapi.testclient import TestClient
from backend.main import app, classify_scenario

def test_classify_scenario_missing_key():
    import os
    if "OPENROUTER_API_KEY" in os.environ:
        del os.environ["OPENROUTER_API_KEY"]
    if "openrouter_api_key" in os.environ:
        del os.environ["openrouter_api_key"]
    if "OPENAI_API_KEY" in os.environ:
        del os.environ["OPENAI_API_KEY"]
    if "openai_api_key" in os.environ:
        del os.environ["openai_api_key"]

    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY is not set"):
        asyncio.run(classify_scenario("test"))

if __name__ == "__main__":
    test_classify_scenario_missing_key()
    print("All basic async structural tests passed.")
