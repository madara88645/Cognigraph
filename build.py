#!/usr/bin/env python3
"""Concatenate src/ into ONE self-contained dist/index.html (stdlib only).

Order:  head.html  ->  <style> styles/*.css (sorted)  ->  body.html
        -> <script type="module"> [CDN imports hoisted] lib/*.js data/*.js llm/*.js brain/*.js ui/*.js modes/*.js main.js
Rules applied to every JS file:
  * local imports (from './x' or '../x') are removed (everything shares one scope)
  * CDN imports (from 'three', 'three/addons/...') are hoisted to the top and de-duplicated
  * a leading `export ` is stripped from declarations; `export { ... }` lines are dropped
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "dist" / "index.html"

JS_DIRS = ["lib", "data", "llm", "brain", "ui", "modes"]
IMPORT_RE = re.compile(r"""^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]\s*;?\s*$""")
EXPORT_LIST_RE = re.compile(r"""^\s*export\s*\{[^}]*\}\s*(?:from\s+['"][^'"]+['"])?\s*;?\s*$""")

def js_files():
    files = []
    for d in JS_DIRS:
        files += sorted((SRC / d).glob("*.js"))
    files.append(SRC / "main.js")
    return [f for f in files if f.exists()]

MULTILINE_IMPORT_RE = re.compile(r"""^[ \t]*import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]\s*;?[ \t]*$""", re.M)

def process_js(path):
    cdn, body = [], []
    text = path.read_text(encoding="utf-8")
    # collapse multi-line `import { a,\n b } from '...'` onto one line so the per-line rules below see it
    text = MULTILINE_IMPORT_RE.sub(lambda m: "import {} from '{}';".format(
        "{" + " ".join(m.group(0).split("{", 1)[1].split("}", 1)[0].split()) + "}", m.group(1)), text)
    for line in text.splitlines():
        m = IMPORT_RE.match(line)
        if m:
            spec = m.group(1)
            if spec.startswith("."):
                continue                      # local import: dropped
            cdn.append(line.strip())          # CDN import: hoisted
            continue
        if EXPORT_LIST_RE.match(line):
            continue
        if line.startswith("export default "):
            sys.exit(f"{path}: 'export default' is not supported (use named exports)")
        if line.startswith("export "):
            line = line[len("export "):]
        body.append(line)
    return cdn, "\n".join(body)

def main():
    head = (SRC / "head.html").read_text(encoding="utf-8")
    css = "\n\n".join(f"/* ==== {p.name} ==== */\n" + p.read_text(encoding="utf-8")
                      for p in sorted((SRC / "styles").glob("*.css")))
    body = (SRC / "body.html").read_text(encoding="utf-8")
    imports, chunks = [], []
    for f in js_files():
        cdn, code = process_js(f)
        for c in cdn:
            if c not in imports:
                imports.append(c)
        rel = f.relative_to(SRC)
        chunks.append(f"// ===================== {rel} =====================\n{code}")
    script = "\n".join(imports) + "\n\n" + "\n\n".join(chunks)
    html = (head.rstrip() + "\n<style>\n" + css + "\n</style>\n" + body.rstrip()
            + "\n<script type=\"module\">\n" + script + "\n</script>\n")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT} ({len(html.encode('utf-8'))/1024:.1f} KB, {len(js_files())} js files)")

if __name__ == "__main__":
    main()
