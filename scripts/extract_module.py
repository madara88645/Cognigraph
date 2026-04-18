import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / "frontend" / "index.html").read_text(encoding="utf-8")
m = re.search(r'<script type="module">(.*?)</script>', html, re.S)
assert m, "module script not found"
raw = m.group(1).strip()
lines = raw.splitlines()
dedented = []
for line in lines:
    if line.startswith("      "):
        dedented.append(line[6:])
    else:
        dedented.append(line)
out = root / "frontend" / "js" / "_dedented_app.js"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text("\n".join(dedented) + "\n", encoding="utf-8")
print("wrote", out, len(raw), "chars")
