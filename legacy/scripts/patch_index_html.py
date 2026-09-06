import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
p = ROOT / "frontend" / "index.html"
t = p.read_text(encoding="utf-8")

t = re.sub(
    r"<style>.*?</style>",
    '<link rel="stylesheet" href="/static/styles.css" />',
    t,
    count=1,
    flags=re.S,
)

t = re.sub(
    r'<script type="importmap">.*?</script>\s*<script type="module">.*?</script>',
    """<script type=\"importmap\">
      {
        \"imports\": {
          \"three\": \"https://unpkg.com/three@0.161.0/build/three.module.js\",
          \"three/addons/\": \"https://unpkg.com/three@0.161.0/examples/jsm/\"
        }
      }
    </script>
    <script type=\"module\" src=\"/static/js/main.js\"></script>""",
    t,
    count=1,
    flags=re.S,
)

# Timeline frame counter next to play cluster
needle = '<button id="replay-btn"'
insert = """
                   <span id="timeline-frame-label" class="text-[10px] font-mono text-slate-400 tabular-nums whitespace-nowrap pl-1">0 / 1000 · 0 ms</span>
                   <button id="replay-btn" """
if needle in t and "timeline-frame-label" not in t:
    t = t.replace(needle, insert, 1)

p.write_text(t, encoding="utf-8")
print("patched", p)
