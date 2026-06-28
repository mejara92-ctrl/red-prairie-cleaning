from pathlib import Path
import re

FAVICON = '<link rel="icon" type="image/png" href="/favicon.png">'

updated = []

for path in Path(".").rglob("*.html"):
    if ".git" in path.parts:
        continue

    text = path.read_text(encoding="utf-8")

    # Remove existing favicon tags
    text = re.sub(r'<link[^>]*rel=["\']icon["\'][^>]*>\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<link[^>]*rel=["\']apple-touch-icon["\'][^>]*>\s*', '', text, flags=re.IGNORECASE)

    if "</head>" in text:
        text = text.replace("</head>", f"    {FAVICON}\n</head>", 1)
        path.write_text(text, encoding="utf-8")
        updated.append(path)

print(f"Updated {len(updated)} pages.")
for page in updated:
    print(" -", page)