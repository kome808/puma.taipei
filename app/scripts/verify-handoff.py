#!/usr/bin/env python3
"""Verify the initial handoff snapshot without accessing credentials or APIs."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
manifest = json.loads((root / "HANDOFF_MANIFEST.json").read_text(encoding="utf-8"))
failures = []
for entry in manifest["files"]:
    relative = Path(entry["path"])
    path = root / relative
    if relative.is_absolute() or ".." in relative.parts or path.is_symlink():
        failures.append(f"unsafe path: {relative}")
        continue
    if not path.is_file():
        failures.append(f"missing: {relative}")
        continue
    content = path.read_bytes()
    if len(content) != entry["bytes"] or hashlib.sha256(content).hexdigest() != entry["sha256"]:
        failures.append(f"different: {relative}")

print(json.dumps({"files_checked": len(manifest["files"]), "failures": failures}, ensure_ascii=False, indent=2))
raise SystemExit(bool(failures))

