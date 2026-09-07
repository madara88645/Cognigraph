"""Build frontend/js/main.js from _dedented_app.js by slicing and wiring imports."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS = ROOT / "frontend" / "js"
DEDENTED = JS / "_dedented_app.js"
lines = DEDENTED.read_text(encoding="utf-8").splitlines()


def line_idx(one_based: int) -> int:
    return one_based - 1


# 1-based inclusive ranges to REMOVE (after constants removal, line numbers shift — build in reverse order)
# Work on original indices: delete from end first


def remove_range(lines: list[str], start_1: int, end_1: int) -> list[str]:
    s, e = line_idx(start_1), line_idx(end_1)
    return lines[:s] + lines[e + 1 :]


out = lines[:]
# Remove API block: formatFastApiDetail through end of callSimulation (before handleSimulateClick)
out = remove_range(out, 1134, 1240)
# Remove storage keys block (now shifted) — find "const API_KEY_STORAGE_KEY"
new_lines = []
i = 0
while i < len(out):
    if out[i].strip().startswith("const API_KEY_STORAGE_KEY"):
        # remove 10 lines (150-159 original) but counts shifted after API removal
        # After first removal, constant block for API keys starts at different line
        # Safer: remove by content
        j = i
        while j < len(out) and not (
            out[j].strip().startswith("const PRIMARY_LIVE_DEMO_ORIGIN")
            and ");" in "".join(out[i : j + 4])[-200:]
        ):
            j += 1
        # Actually remove the block from API_KEY through closing })();
        start = i
        while i < len(out) and "})();" not in out[i]:
            i += 1
        i += 1  # skip line with })();
        new_lines.extend(out[:start])
        out = out[i:]
        i = 0
        continue
    new_lines.append(out[i])
    i += 1
out = new_lines

# Remove constants block (lines 12-114 in original _dedented_app) — search for CONSTANTS comment through FIRE_PULSE_TO_BURST
trimmed = []
i = 0
while i < len(out):
    if "CONSTANTS" in out[i] and "══════" in out[i - 1] if i > 0 else False:
        # back up to start of block comment
        start = i - 1
        if i >= 2 and "══════" in out[i - 2]:
            start = i - 2
        while start > 0 and "import" not in out[start] and "CONSTANTS" not in out[start]:
            start -= 1
        # Find start: line after TWEEN and blank — look for /* CONSTANTS
        while start < len(out) and "CONSTANTS" not in out[start]:
            start += 1
        start = start - 1  # include banner start
        if start > 0 and "══════" in out[start - 1]:
            start -= 1
        end = start
        while end < len(out) and not (end + 1 < len(out) and "DOM REFS" in out[end + 1]):
            end += 1
        # remove from start through line before DOM REFS banner
        while end < len(out) and "DOM REFS" not in out[end]:
            end += 1
        end -= 1  # last line of constants: FIRE_PULSE_TO_BURST
        # Find FIRE_PULSE_TO_BURST line
        for k in range(start, len(out)):
            if "DOM REFS" in out[k]:
                end = k - 1
                # walk back past blank
                while end > start and out[end].strip() == "":
                    end -= 1
                break
        trimmed.extend(out[:start])
        trimmed.extend(out[end + 1 :])
        out = trimmed
        break
    i += 1
else:
    out = trimmed if trimmed else out

# The loop above is fragile — use simpler: read original line numbers from DEDENTED only

print("Use manual assembly — fallback")
