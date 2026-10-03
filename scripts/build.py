#!/usr/bin/env python3
"""Build the static lander and release-matched API reference without a runtime service."""

import json
import os
import re
import shutil
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.dont_write_bytecode = True

from api_reference import render_guide, render_reference, validate_specification

ROOT = Path(__file__).resolve().parents[1]
VERSION_PATTERN = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+")
RELEASE_URL = "https://api.github.com/repos/toxdes/vylk/releases/latest"
SOURCE_URL = "https://raw.githubusercontent.com/toxdes/vylk"


def download(url):
    request = Request(
        url, headers={"User-Agent": "vylk-lander-build", "Cache-Control": "no-cache"}
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=20) as response:
                data = response.read(4 * 1024 * 1024 + 1)
                if len(data) > 4 * 1024 * 1024:
                    raise ValueError("Documentation download exceeds 4 MiB")
                return data.decode("utf-8")
        except HTTPError as error:
            if error.code == 404:
                raise ValueError(
                    f"Release source is missing: {url}. Publish a release containing "
                    "docs/api before deploying, or use VYLK_API_SOURCE for a local preview."
                ) from error
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
        except (OSError, UnicodeError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def release_version():
    if value := os.environ.get("VYLK_VERSION"):
        version = value
    elif url := os.environ.get("VYLK_VERSION_URL"):
        version = download(url).strip()
    else:
        # Release hooks can fire immediately after publication; avoid a CDN's
        # cached latest-release response selecting the previous documentation.
        url = f"{RELEASE_URL}?build={time.time_ns()}"
        version = json.loads(download(url))["tag_name"].removeprefix("v")
    if not VERSION_PATTERN.fullmatch(version):
        raise ValueError("Expected a stable VYLK version in X.Y.Z form")
    return version


def documentation(version):
    local = os.environ.get("VYLK_API_SOURCE")
    if local:
        source = Path(local).expanduser().resolve()
        version_text = (source / "VERSION").read_text().strip()
        spec_text = (source / "docs/api/openapi.json").read_text()
        guide = (source / "docs/api/client-protocol.md").read_text()
    else:
        base = f"{SOURCE_URL}/v{version}"
        version_text = download(f"{base}/VERSION").strip()
        spec_text = download(f"{base}/docs/api/openapi.json")
        guide = download(f"{base}/docs/api/client-protocol.md")
    if version_text != version:
        raise ValueError("Selected source VERSION does not match the lander version")
    spec = json.loads(spec_text)
    validate_specification(spec)
    spec["info"]["version"] = version
    return spec, guide, bool(local)


def build():
    version = release_version()
    spec, guide, preview = documentation(version)
    destination = ROOT / "dist"
    if destination.is_symlink():
        raise ValueError("Refusing to replace a symlinked dist directory")
    template = (ROOT / "scripts/api-template.html").read_text()
    # Acquire and validate everything before replacing the last successful build.
    with tempfile.TemporaryDirectory(prefix=".build-", dir=ROOT) as directory:
        output = Path(directory) / "dist"
        output.mkdir()
        for pattern in ("index.html", "*.css", "*.js"):
            for file in ROOT.glob(pattern):
                shutil.copy2(file, output / file.name)
        for name in ("assets", "docs"):
            shutil.copytree(ROOT / name, output / name)
        api = output / "docs/api"
        api.mkdir(exist_ok=True)
        (api / "openapi.json").write_text(json.dumps(spec, indent=2) + "\n")
        (api / "client-protocol.md").write_text(guide)
        (api / "index.html").write_text(render_reference(spec, template, preview))
        (api / "client-protocol.html").write_text(
            render_guide(guide, spec, template, preview)
        )
        (output / "version.js").write_text(f'window.VYLK_VERSION = "{version}";\n')
        for file in output.rglob("*"):
            if file.is_file() and file.suffix in (".html", ".js"):
                file.write_text(file.read_text().replace("__VYLK_VERSION__", version))
        if destination.exists():
            shutil.rmtree(destination)
        output.rename(destination)
    print(
        f"Prepared VYLK lander and API reference for v{version}"
        + (" (local preview)" if preview else "")
    )


if __name__ == "__main__":
    try:
        build()
    except (OSError, ValueError, KeyError) as error:
        print(f"Lander build failed: {error}", file=sys.stderr)
        sys.exit(1)
