#!/usr/bin/env python3
"""Capture real Vylk screenshots using disposable local data.

Run with: uv run --with playwright python3 scripts/capture_media.py --source PATH --output PATH
Requires Go, Chrome, and FFmpeg. Never connects to an existing Vylk instance.
"""

import argparse
import json
import os
import secrets
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

NOTE = """# Small notes for slower days

A quiet place to keep the useful bits close.


**A thought worth keeping.**

Follow [a useful link](https://vylk.toxdes.com) and leave a little room to think.

## A few good things

- [ ] Make room for a walk
- [x] Write down one good idea
- [ ] Come back tomorrow

> Keep the useful bits. Let the rest go.
"""
SAMPLES = [
    ("capture-writing", "Small notes for slower days", "writing,personal", NOTE),
    (
        "capture-weekend",
        "A weekend without a plan",
        "personal",
        "# A weekend without a plan\n\n- Walk somewhere green\n- Find a new book\n- Leave time for nothing",
    ),
    (
        "capture-ideas",
        "Things worth trying",
        "ideas",
        "# Things worth trying\n\nA small project. A different route home. A recipe shared by a friend.",
    ),
    (
        "capture-reading",
        "From the reading pile",
        "books",
        "# From the reading pile\n\nKeep the passages that make you pause, and a few thoughts of your own.",
    ),
    (
        "capture-project",
        "The next small step",
        "projects",
        "# The next small step\n\n- [x] Write down the idea\n- [ ] Make a little time\n- [ ] Start small",
    ),
    (
        "capture-garden",
        "Notes from the garden",
        "personal",
        "# Notes from the garden\n\nMint by the kitchen window. A new leaf on the basil. Remember to water on Friday.",
    ),
]


def checked(response):
    if not response.ok:
        raise RuntimeError(
            f"Local capture API returned {response.status}: {response.text()}"
        )
    return response.json()


def settled(page):
    page.evaluate("""async () => {
      await document.fonts.ready;
      await Promise.all(document.getAnimations().filter(a =>
        a.effect?.getComputedTiming().iterations !== Infinity
      ).map(a => a.finished.catch(() => {})));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }""")


def select_text(page, text):
    page.locator("#zen-source-editor").evaluate(
        """(editor, text) => {
      editor.focus({preventScroll: true});
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.parentElement.closest('.zen-md-inline-syntax')) continue;
        const start = node.textContent.indexOf(text);
        if (start < 0) continue;
        const selection = window.getSelection();
        selection.setBaseAndExtent(node, start, node, start + text.length);
        return;
      }
      throw new Error('Sample text not found: ' + text);
    }""",
        text,
    )
    expect(page.locator("#zen-selection-toolbar")).to_be_visible()


def screenshot(page, output, name):
    settled(page)
    png = output / f"{name}.png"
    page.screenshot(path=png)
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-i",
            str(png),
            "-c:v",
            "libwebp",
            "-quality",
            "90",
            "-compression_level",
            "6",
            str(output / f"{name}.webp"),
        ],
        check=True,
    )
    print(f"Captured {name}", flush=True)


def open_note(page, base):
    page.goto(base + "/capture-writing")
    expect(page.locator("#editor")).to_be_visible()
    expect(page.locator("#note-title")).to_have_value("Small notes for slower days")


def capture(source, output, chrome):
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="vylk-media-") as directory:
        scratch = Path(directory)
        binary = scratch / "vylk"
        env = {k: v for k, v in os.environ.items() if not k.startswith("VYLK_")}
        env.setdefault(
            "GOCACHE", str(Path(tempfile.gettempdir()) / "vylk-media-go-cache")
        )
        subprocess.run(
            ["go", "build", "-o", str(binary), "./cmd/vylk"],
            cwd=source,
            env=env,
            check=True,
        )
        password = secrets.token_urlsafe(24)
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        env.update(
            PORT=str(port),
            VYLK_NO_BROWSER="1",
            VYLK_PASSWORD=password,
            VYLK_DIR=str(scratch / "notes"),
            VYLK_DB=str(scratch / "notes.db"),
        )
        base = f"http://127.0.0.1:{port}"
        with (scratch / "server.log").open("w") as log:
            server = subprocess.Popen([str(binary)], env=env, stdout=log, stderr=log)
            try:
                deadline = time.monotonic() + 30
                while True:
                    if server.poll() is not None:
                        raise RuntimeError("Isolated capture server failed to start")
                    try:
                        with urlopen(base, timeout=1):
                            break
                    except URLError:
                        if time.monotonic() >= deadline:
                            raise RuntimeError(
                                "Isolated capture server did not become ready"
                            )
                        time.sleep(0.1)
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch(
                        executable_path=chrome, headless=True
                    )
                    try:
                        context = browser.new_context(
                            viewport={"width": 1440, "height": 900},
                            reduced_motion="reduce",
                        )
                        page = context.new_page()
                        page.goto(base)
                        page.locator('#login-form input[name="password"]').fill(
                            password
                        )
                        page.locator('#login-form button[type="submit"]').click()
                        expect(page.locator("#dashboard")).to_be_visible()
                        prefs = checked(page.request.get(base + "/api/prefs"))
                        prefs.update(
                            theme="default-dark",
                            startView="split",
                            collapseDetails=True,
                            hideSaveButton=False,
                            interactivePreview=True,
                            zenFontFamily="system-sans",
                            zenFontFamilyGoogle=False,
                            reduceMotion="system",
                            contentWidth="wide",
                        )
                        checked(
                            page.request.patch(
                                base + "/api/prefs",
                                data=prefs,
                                headers={"If-Match": str(prefs["revision"])},
                            )
                        )
                        for note_id, title, tags, content in SAMPLES:
                            checked(
                                page.request.post(
                                    base + "/api/notes",
                                    data={
                                        "id": note_id,
                                        "title": title,
                                        "tags": tags,
                                        "content": content,
                                        "base_revision": 0,
                                    },
                                )
                            )
                        page.reload()
                        expect(page.locator(".note-item")).to_have_count(len(SAMPLES))
                        for label, width, height in [
                            ("desktop", 1440, 900),
                            ("mobile", 390, 844),
                        ]:
                            page.set_viewport_size({"width": width, "height": height})
                            page.goto(base)
                            expect(page.locator(".note-item")).to_have_count(
                                len(SAMPLES)
                            )
                            screenshot(page, output, f"vylk-dashboard-{label}")
                            open_note(page, base)
                            page.keyboard.press(
                                "Control+3" if width > 560 else "Control+1"
                            )
                            screenshot(page, output, f"vylk-editor-{label}")
                            page.locator("#editor-prefs-btn").click()
                            page.locator("#prefs-tab-editor").click()
                            expect(page.locator("#prefs-modal")).to_be_visible()
                            screenshot(page, output, f"vylk-preferences-{label}")
                            page.locator("#prefs-close").click()
                            expect(page.locator("#prefs-modal")).to_be_hidden()
                            page.keyboard.press("Control+4")
                            select_text(page, "A thought worth keeping")
                            screenshot(page, output, f"vylk-focus-{label}")
                        context.close()
                    finally:
                        browser.close()
            finally:
                server.terminate()
                server.wait(timeout=10)
    version = (source / "VERSION").read_text().strip()
    revision = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=source, text=True
    ).strip()
    (output / "capture.json").write_text(
        json.dumps(
            {
                "version": version,
                "revision": revision,
                "sample_data": True,
                "desktop": [1440, 900],
                "mobile": [390, 844],
            },
            indent=2,
        )
        + "\n"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--chrome", default="/usr/bin/google-chrome")
    args = parser.parse_args()
    capture(args.source.resolve(), args.output.resolve(), args.chrome)


if __name__ == "__main__":
    main()
