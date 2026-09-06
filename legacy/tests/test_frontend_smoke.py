"""Smoke tests for the served frontend shell.

These guard the class of regression that pure unit tests miss: the app HTML,
its ES-module entry point, and every local static asset it references must
actually be served. CI runs pytest on every push/PR, so unlike the Node tests
these always run on `master`.
"""

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
INDEX_HTML = (FRONTEND_DIR / "index.html").read_text(encoding="utf-8")

# Element IDs that main.js wires to on load. If any of these disappear from the
# HTML, the app breaks at startup, so the shell must always expose them.
CRITICAL_IDS = [
    "brain-canvas",
    "prompt",
    "simulate-btn",
    "cancel-simulate-btn",
    "retry-simulate-btn",
    "settings-panel",
    "api-key-input",
    "save-api-key-btn",
    "timeline-slider",
    "play-pause-btn",
    "log-panel",
]

# Local files referenced directly from index.html via src=/href="/static/...".
LOCAL_STATIC_REFS = sorted(set(re.findall(r'(?:src|href)="(/static/[^"]+)"', INDEX_HTML)))

# Every shipped JS module (excludes Node *.test.mjs files).
JS_MODULES = sorted(p.name for p in (FRONTEND_DIR / "js").glob("*.js"))


def test_index_is_served():
    resp = client.get("/")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert "<title" in resp.text.lower()


def test_index_loads_main_js_as_es_module():
    assert re.search(
        r'<script[^>]+type="module"[^>]+src="/static/js/main\.js"', INDEX_HTML
    ), "index.html must load /static/js/main.js as an ES module"


@pytest.mark.parametrize("element_id", CRITICAL_IDS)
def test_index_exposes_critical_control(element_id):
    assert f'id="{element_id}"' in INDEX_HTML, f"missing critical element id={element_id}"


@pytest.mark.parametrize("ref", LOCAL_STATIC_REFS)
def test_local_static_reference_is_served(ref):
    resp = client.get(ref)
    assert resp.status_code == 200, f"{ref} -> {resp.status_code}"
    assert resp.content, f"{ref} served empty"


@pytest.mark.parametrize("module_name", JS_MODULES)
def test_js_module_is_served(module_name):
    resp = client.get(f"/static/js/{module_name}")
    assert resp.status_code == 200, f"{module_name} -> {resp.status_code}"
    assert resp.content, f"{module_name} served empty"


def test_brain_model_is_served():
    resp = client.get("/static/assets/brain.glb")
    assert resp.status_code == 200
    assert resp.content, "brain.glb served empty"
