"""Unit tests for _adaptive_sim_duration_ms in backend.main.

This pure helper determines the Brian2 simulation window length based on prompt
length.  Short prompts (≤ SIM_SHORT_PROMPT_CHAR_THRESHOLD chars) get a 500 ms
window; longer prompts get the default 1 000 ms window.  The constants and the
boundary condition are what make this function worth pinning — a silent change
to any of them would alter the visual output for all users without a type error.
"""

from backend.main import (
    SIM_DURATION_MS_DEFAULT,
    SIM_DURATION_MS_SHORT,
    SIM_SHORT_PROMPT_CHAR_THRESHOLD,
    _adaptive_sim_duration_ms,
)


def test_empty_prompt_returns_short_duration() -> None:
    assert _adaptive_sim_duration_ms("") == SIM_DURATION_MS_SHORT


def test_prompt_at_threshold_returns_short_duration() -> None:
    prompt = "a" * SIM_SHORT_PROMPT_CHAR_THRESHOLD
    assert len(prompt) == SIM_SHORT_PROMPT_CHAR_THRESHOLD
    assert _adaptive_sim_duration_ms(prompt) == SIM_DURATION_MS_SHORT


def test_prompt_one_over_threshold_returns_default_duration() -> None:
    prompt = "a" * (SIM_SHORT_PROMPT_CHAR_THRESHOLD + 1)
    assert _adaptive_sim_duration_ms(prompt) == SIM_DURATION_MS_DEFAULT


def test_very_long_prompt_returns_default_duration() -> None:
    prompt = "x" * 500
    assert _adaptive_sim_duration_ms(prompt) == SIM_DURATION_MS_DEFAULT


def test_short_duration_constant_is_500() -> None:
    assert SIM_DURATION_MS_SHORT == 500


def test_default_duration_constant_is_1000() -> None:
    assert SIM_DURATION_MS_DEFAULT == 1000


def test_threshold_constant_is_60() -> None:
    assert SIM_SHORT_PROMPT_CHAR_THRESHOLD == 60


def test_real_world_short_prompt() -> None:
    assert _adaptive_sim_duration_ms("I feel calm.") == SIM_DURATION_MS_SHORT


def test_real_world_long_prompt() -> None:
    prompt = "I am studying for my final exams and feeling intense pressure to perform well under tight deadlines."
    assert len(prompt) > SIM_SHORT_PROMPT_CHAR_THRESHOLD
    assert _adaptive_sim_duration_ms(prompt) == SIM_DURATION_MS_DEFAULT
