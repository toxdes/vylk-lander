#!/usr/bin/env python3
"""Record one continuous Vylk walkthrough with real sync and offline editing.

Run with uv run --with playwright python3 scripts/capture_workflows.py
--source ../vylk --output .impeccable/media/walkthrough-originals. Requires Go, Chrome, FFmpeg and Playwright's
recording encoder. Cursor artwork is a capture overlay, never application code.
"""

import argparse
import contextlib
import json
import math
import os
import random
import re
import secrets
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

CURSOR = """(() => {
  addEventListener('DOMContentLoaded', () => {
    const cursor = document.createElement('div');
    cursor.setAttribute('aria-hidden', 'true');
    cursor.setAttribute('popover', 'manual');
    cursor.dataset.captureCursor = 'arrow';
    cursor.style.cssText = 'position:fixed;left:0;top:0;margin:0;padding:0;border:0;background:transparent;overflow:visible;width:28px;height:32px;z-index:2147483647;pointer-events:none;transform:translate(1800px,950px);filter:drop-shadow(0 2px 2px #0008)';
    const arrow = '<path d="M2 2v25l6-7 5 10 4-2-5-10h10Z"/>';
    const grab = '<path d="M8 16V7a2 2 0 0 1 4 0v7-10a2 2 0 0 1 4 0v10-8a2 2 0 0 1 4 0v9-5a2 2 0 0 1 4 0v10c0 6-4 10-9 10-4 0-6-2-8-5l-5-7a2 2 0 0 1 3-3l3 3Z"/>';
    const grabbing = '<path d="M7 17v-6a2 2 0 0 1 4 0v3-5a2 2 0 0 1 4 0v5-4a2 2 0 0 1 4 0v5-3a2 2 0 0 1 4 0v8c0 6-3 10-8 10-4 0-6-2-8-5l-4-5a2 2 0 0 1 3-3l3 3"/>';
    let dragging = false;
    function paint(target) {
      const kind = dragging ? 'grabbing' : target?.closest?.('.preview-drag-handle') ? 'grab' : 'arrow';
      cursor.dataset.captureCursor = kind;
      cursor.innerHTML = '<svg viewBox="0 0 28 32" width="28" height="32" fill="white" stroke="#17191c" stroke-width="1.6" stroke-linejoin="round">'+(kind==='grabbing'?grabbing:kind==='grab'?grab:arrow)+'</svg>';
    }
    document.body.append(cursor);
    cursor.showPopover();
    paint(null);
    addEventListener('pointermove', e => { paint(e.target); const hand=cursor.dataset.captureCursor!=='arrow';cursor.style.transform=`translate(${e.clientX-(hand?11:0)}px,${e.clientY-(hand?12:0)}px)`; },true);
    addEventListener('pointerdown',e=>{dragging=!!e.target.closest?.('.preview-drag-handle');paint(e.target);cursor.style.filter='drop-shadow(0 0 5px #e6a64e)'},true);
    addEventListener('pointerup',e=>{dragging=false;paint(e.target);cursor.style.filter='drop-shadow(0 2px 2px #0008)'},true);
  });
})();"""

BOARD = """# TODO

- [ ] Plan the weekend
- [ ] Book a table
- [ ] Send the invitations

# WIP

- [ ] Choose a walking route
- [ ] Check the weather

# DONE

- [x] Pick a day
"""
CHAPTER = """# Chapter Three: The map room

Mara found the room at the top of the stairs, where the house had always ended before. Its door stood open. Inside, a hundred maps hung from threads, turning slowly in a wind she could not feel.

The oldest map showed a river running through the city. There had been no river for three hundred years. Yet, when she held the paper to the light, something blue moved beneath the ink.

On the desk lay a compass without a needle, a cup of cold tea, and a note in her mother's handwriting.

*If you have found this room, the city has begun to remember.*
"""


def checked(response):
    if not response.ok:
        raise RuntimeError(f"Capture API: {response.status}: {response.text()}")
    return response.json()


@contextlib.contextmanager
def server(binary, scratch):
    env = {k: v for k, v in os.environ.items() if not k.startswith("VYLK_")}
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    password = secrets.token_urlsafe(24)
    env.update(
        PORT=str(port),
        VYLK_NO_BROWSER="1",
        VYLK_PASSWORD=password,
        VYLK_DIR=str(scratch / "notes"),
        VYLK_DB=str(scratch / "notes.db"),
    )
    base = f"http://127.0.0.1:{port}"
    with (scratch / "server.log").open("w") as log:
        process = subprocess.Popen([str(binary)], env=env, stdout=log, stderr=log)
        try:
            deadline = time.monotonic() + 30
            while True:
                if process.poll() is not None:
                    raise RuntimeError("Capture server exited")
                try:
                    with urlopen(base, timeout=1):
                        break
                except URLError:
                    if time.monotonic() > deadline:
                        raise RuntimeError("Capture server startup timed out")
                    time.sleep(0.1)
            yield base, password
        finally:
            process.terminate()
            process.wait(timeout=10)


class Director:
    def __init__(self, page, pace):
        self.page = page
        self.pace = pace
        # Seeded variation keeps the movement reproducible without uniform timing.
        self.random = random.Random(20261020 + page.viewport_size["width"])
        self.position = (
            page.viewport_size["width"] * 0.88,
            page.viewport_size["height"] * 0.84,
        )
        page.mouse.move(*self.position)

    def hold(self, seconds=2):
        self.page.wait_for_timeout(
            seconds * self.random.uniform(0.88, 1.12) * 1000 * self.pace
        )

    def move(self, x, y, duration=None, bend=None):
        start_x, start_y = self.position
        dx, dy = x - start_x, y - start_y
        distance = math.hypot(dx, dy)
        if distance < 0.5:
            return
        seconds = duration if duration is not None else min(1.1, 0.28 + distance / 1700)
        curve = (
            bend
            if bend is not None
            else self.random.uniform(-1, 1) * min(34, distance * 0.08)
        )
        normal_x, normal_y = -dy / distance, dx / distance
        steps = max(8, round(seconds * 60))
        started = time.monotonic()
        for step in range(1, steps + 1):
            t = step / steps
            progress = t * t * (3 - 2 * t)
            arc = math.sin(math.pi * progress) * curve
            self.page.mouse.move(
                start_x + dx * progress + normal_x * arc,
                start_y + dy * progress + normal_y * arc,
            )
            # Wall-clock pacing matters: Playwright's steps alone can run in bursts.
            remaining = started + seconds * self.pace * t - time.monotonic()
            if remaining > 0:
                self.page.wait_for_timeout(remaining * 1000)
        self.position = (x, y)

    def hover(self, target):
        target.scroll_into_view_if_needed()
        box = target.bounding_box()
        self.move(
            box["x"] + min(110, box["width"] * 0.4), box["y"] + box["height"] * 0.52
        )
        self.hold(0.35)

    def click(self, target):
        target.scroll_into_view_if_needed()
        box = target.bounding_box()
        x = (
            box["x"]
            + box["width"] / 2
            + self.random.uniform(-1, 1) * min(5, box["width"] * 0.12)
        )
        y = (
            box["y"]
            + box["height"] / 2
            + self.random.uniform(-1, 1) * min(3, box["height"] * 0.1)
        )
        self.move(x, y)
        self.hold(0.18)
        # Use the current pointer position; locator.click() would recenter it.
        self.page.mouse.down()
        self.hold(0.09)
        self.page.mouse.up()
        self.hold(0.55)

    def type(self, text, delay=65):
        if chr(0x2014) in text:
            raise ValueError("Sample note text must not contain em dashes")
        for character in text:
            self.page.keyboard.type(character)
            milliseconds = delay * self.random.uniform(0.55, 1.25)
            if character in ".!?":
                milliseconds += self.random.uniform(150, 300)
            elif character == "\n":
                milliseconds += self.random.uniform(150, 260)
            elif character == " ":
                milliseconds += self.random.uniform(20, 80)
            self.page.wait_for_timeout(milliseconds * self.pace)

    def select(self, target, value):
        self.click(target)
        option = target.locator(f'option[value="{value}"]')
        expect(option).to_be_visible()
        # Keep the actual browser picker and pointer in the recorded page's top layer.
        self.page.evaluate(
            """()=>{const c=document.querySelector('[data-capture-cursor]');c.hidePopover();c.showPopover()}"""
        )
        self.hold(0.8)
        if hasattr(self, "output"):
            self.page.screenshot(
                path=str(self.output / f"picker-{target.get_attribute('id')}.png")
            )
        self.click(option)
        expect(target).to_have_value(value)
        self.hold(0.3)

    def view(self, mode):
        self.click(
            self.page.locator(f'.view-control[data-panel="{mode}"]')
            .filter(visible=True)
            .first
        )

    def card(self, text):
        return self.page.locator("#preview .interactive-preview-list-card").filter(
            has_text=text
        )

    def drag(self, text, target_text):
        card = self.card(text)
        self.hover(card)
        self.hold(0.5)
        handle = card.locator(".preview-drag-handle")
        bounds = handle.bounding_box()
        x, y = bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2
        self.move(x, y, duration=0.3, bend=3)
        self.hold(0.3)
        self.page.mouse.down()
        expect(self.page.locator("[data-capture-cursor]")).to_have_attribute(
            "data-capture-cursor", "grabbing"
        )
        self.hold(0.2)
        self.move(x + 12, y + 3, duration=0.24, bend=2)
        self.hold(0.35)
        target = self.card(target_text).bounding_box()
        # Stay near the pickup x-coordinate so the ghost does not slide out of the document.
        end_x = x + 8
        end_y = target["y"] + target["height"] - 3
        self.move(end_x, end_y, duration=1.05, bend=16)
        self.hold(0.4)
        # Reflow can move the target while dragging; settle on its live edge.
        target = self.card(target_text).bounding_box()
        self.move(
            x + 8,
            target["y"] + target["height"] - 3,
            duration=0.25,
            bend=0,
        )
        self.hold(0.3)
        self.page.mouse.up()
        self.hold(1.4)


def login(context, base, password):
    context.capture_started = time.monotonic()
    page = context.new_page()
    page.goto(base)
    page.locator('#login-form input[name="password"]').fill(password)
    page.locator('#login-form button[type="submit"]').click()
    expect(page.locator("#dashboard")).to_be_visible()
    return page


def seed(page, base, notes):
    if any(chr(0x2014) in field for note in notes for field in note[1:]):
        raise ValueError("Sample note titles and content must not contain em dashes")
    prefs = checked(page.request.get(base + "/api/prefs"))
    prefs.update(
        theme="default-dark",
        startView="editor",
        collapseDetails=False,
        hideSaveButton=False,
        interactivePreview=True,
        autoSave=True,
        fontFamily="Inter",
        fontFamilyGoogle=True,
        fontSize="1rem",
        editorFontFamily="JetBrains Mono",
        editorFontFamilyGoogle=True,
        editorFontSize="1rem",
        previewFontFamily="Inter",
        previewFontFamilyGoogle=True,
        previewFontSize="1rem",
        zenFontFamily="Inter",
        zenFontFamilyGoogle=True,
        zenFontSize="1rem",
        zenPageWidth="standard",
        reduceMotion="always",
        contentWidth="wide",
    )
    checked(
        page.request.patch(
            base + "/api/prefs",
            data=prefs,
            headers={"If-Match": str(prefs["revision"])},
        )
    )
    for note_id, title, tags, content in notes:
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
    fonts_ready(page, ("Inter", "JetBrains Mono"))


def fonts_ready(page, names):
    for name in names:
        page.wait_for_function(
            """async name => {
              const faces=[...document.fonts].filter(f=>f.family.replaceAll('"','')===name);
              if (!faces.length) return false;
              await document.fonts.load('16px "'+name+'"','Vylk writing');
              return document.fonts.check('16px "'+name+'"') && faces.some(f=>f.status==='loaded');
            }""",
            arg=name,
            timeout=45000,
        )


def context_for(browser, scratch, name, width=1920, height=1080, mobile=False):
    context = browser.new_context(
        viewport={"width": width, "height": height},
        is_mobile=mobile,
        has_touch=mobile,
        device_scale_factor=1,
        reduced_motion="reduce",
        bypass_csp=True,
        record_video_dir=str(scratch / name),
        record_video_size={"width": width, "height": height},
    )
    context.add_init_script(CURSOR)
    return context


def open_note(director, title):
    director.click(director.page.locator(".note-item").filter(has_text=title).first)
    expect(director.page.locator("#editor")).to_be_visible()
    fonts_ready(director.page, ("Inter", "JetBrains Mono"))


PICKER_CSS = """
#pref-preview-font-size,#pref-zen-font-size{appearance:base-select;font:14px/1.3 Inter,sans-serif;white-space:nowrap;min-width:170px}
#pref-preview-font-size::picker(select),#pref-zen-font-size::picker(select){
  appearance:base-select;background:#24263b;color:#e7e8ef;border:1px solid #555a75;
  border-radius:7px;padding:5px;box-shadow:0 12px 30px #0006;font:14px Inter,sans-serif
}
#pref-preview-font-size option,#pref-zen-font-size option{padding:9px 12px;border-radius:4px}
#pref-preview-font-size option:hover,#pref-zen-font-size option:hover{background:#45465f}
"""


def change_font(d, target, name):
    d.click(d.page.locator(target))
    d.page.keyboard.press("Control+A")
    d.type(name, 65)
    d.page.keyboard.press("Tab")
    d.hold(0.3)


NOTES = [
    ("demo-weekend", "A weekend, one task at a time", "planning,personal", BOARD),
    (
        "chapter-one",
        "The City That Remembered: 01. A key without a door",
        "novel,draft",
        "# Chapter One: A key without a door\n\nThe key arrived on a Tuesday, wrapped in a map of a city that no longer existed. Mara knew the handwriting before she read the note. Her mother had been missing for eleven years.",
    ),
    (
        "chapter-two",
        "The City That Remembered: 02. The house at dusk",
        "novel,draft",
        "# Chapter Two: The house at dusk\n\nAt dusk the windows filled with light, one by one, although no one had lived in the house since the flood. Mara waited across the street until the last window went dark.",
    ),
    (
        "chapter-three",
        "The City That Remembered: 03. The map room",
        "novel,draft",
        CHAPTER,
    ),
    (
        "links",
        "Links to revisit",
        "scratchpad,reading",
        "# Links to revisit\n\nA reading list, a trail map, and a recipe for another day.",
    ),
    (
        "garden",
        "Notes from the garden",
        "personal",
        "# Notes from the garden\n\nMint by the kitchen window. Water the basil before the weekend.",
    ),
]
CONTINUATION = "\n\nMara set the compass on the oldest map. The paper softened beneath her hand. Far below the house, she heard water moving through the dark."
OFFLINE_TEXT = "\n\nOffline reminder: pack a notebook for the train.\n"


def capture(browser, base, password, output, scratch, pace):
    desktop = context_for(browser, scratch, "desktop")
    page = login(desktop, base, password)
    seed(page, base, NOTES)
    page.wait_for_function(
        "Boolean(navigator.serviceWorker?.controller)", timeout=30000
    )
    phone = context_for(browser, scratch, "phone", 390, 844, True)
    mobile = login(phone, base, password)
    fonts_ready(mobile, ("Inter", "JetBrains Mono"))
    page.add_style_tag(content=PICKER_CSS)
    assert page.evaluate("CSS.supports('appearance','base-select')")
    d = Director(page, pace)
    d.output = output
    m = Director(mobile, pace)
    events = []
    started = time.monotonic()
    dual_start = None
    success = False

    def mark(name):
        item = {"name": name, "time": round(time.monotonic() - started, 3)}
        events.append(item)
        print(f"STEP {name}: {item['time']}s", flush=True)

    def dashboard(tag):
        for _ in range(3):
            if page.locator("#dashboard").is_visible():
                break
            previous = page.url
            d.click(page.locator("#back-btn"))
            page.wait_for_function(
                "previous => !document.querySelector('#dashboard').classList.contains('hidden') || location.href !== previous",
                arg=previous,
            )
        expect(page.locator("#dashboard")).to_be_visible()
        d.click(page.locator('#tag-bar [data-tag=""]'))
        d.hold(0.5)
        d.click(page.locator(f'#tag-bar [data-tag="{tag}"]'))
        expect(page.locator(f'#tag-bar [data-tag="{tag}"]')).to_have_attribute(
            "aria-pressed", "true"
        )
        d.hold(0.7)

    try:
        mark("Plan with tags")
        d.hold(1.4)
        dashboard("planning")
        expect(page.locator(".note-item")).to_have_count(1)
        open_note(d, "A weekend, one task at a time")
        d.view("preview")
        d.click(d.card("Choose a walking route").locator("input[type=checkbox]"))
        mark("Drag a completed task")
        d.drag("Choose a walking route", "Pick a day")
        source = page.locator("#note-content").input_value()
        assert source.index("# DONE") < source.index("Choose a walking route")
        todo = d.card("Plan the weekend")
        d.hover(todo)
        d.click(todo.get_by_role("button", name="Edit this block in source"))
        page.keyboard.press("End")
        d.type(": keep Saturday morning free", 55)
        d.view("preview")
        d.drag("Plan the weekend", "Check the weather")
        source = page.locator("#note-content").input_value()
        assert (
            source.index("# WIP")
            < source.index("Plan the weekend")
            < source.index("# DONE")
        )
        d.view("editor")
        d.click(page.locator("#note-content"))
        page.keyboard.press("Control+Home")
        page.keyboard.press("ArrowDown")
        page.keyboard.press("ArrowDown")
        page.keyboard.press("Home")
        d.type("- [ ] Buy [[groceries]]\n", 55)
        d.view("preview")
        d.click(page.locator("#preview .wiki-link").filter(has_text="groceries"))
        expect(page.locator("#note-title")).to_have_value("groceries")
        d.click(page.locator("#note-tags"))
        d.type("planning", 50)
        d.click(page.locator("#note-content"))
        d.type("- [ ] Bread\n- [ ] Tomatoes\n- [ ] Coffee", 55)
        d.view("preview")
        d.hold(1)
        print(
            "PASS task check, both section moves, pencil edit, and linked groceries note",
            flush=True,
        )

        mark("Find a chapter")
        dashboard("novel")
        expect(page.locator(".note-item")).to_have_count(3)
        d.click(page.locator("#prefs-btn"))
        d.click(page.locator("#prefs-tab-editor"))
        change_font(d, "#pref-preview-font", "Newsreader")
        assert page.locator("#pref-preview-font-google").is_checked()
        mark("Preview size picker")
        d.select(page.locator("#pref-preview-font-size"), "1.1rem")
        d.click(page.locator("#prefs-tab-zen"))
        change_font(d, "#pref-zen-font", "Newsreader")
        assert page.locator("#pref-zen-font-google").is_checked()
        mark("Zen size picker")
        d.select(page.locator("#pref-zen-font-size"), "1.25rem")
        fonts_ready(page, ("Newsreader",))
        d.click(page.locator("#prefs-close"))
        open_note(d, "03. The map room")
        d.view("preview")
        d.hold(1.2)
        d.view("zen")
        mark("Write in Zen")
        d.click(page.locator("#zen-source-editor"))
        page.keyboard.press("Control+End")
        d.type(CONTINUATION, 70)
        d.hold(1.2)
        expect(page.locator("#zen-source-editor")).to_contain_text(
            "she heard water moving through the dark."
        )
        page.wait_for_function(
            """async()=>{
          const r=await fetch('/api/notes/chapter-three');const n=await r.json();
          return n.content?.includes('she heard water moving through the dark.');
        }""",
            timeout=20000,
        )
        print(
            "PASS real picker options, Newsreader sizes, and saved chapter continuation",
            flush=True,
        )
        d.click(page.locator('[data-zen-action="exit"]'))
        dashboard("scratchpad")

        mark("Across devices")
        dual_start = time.monotonic() - started
        page.set_viewport_size({"width": 1440, "height": 1000})
        d.position = (min(d.position[0], 1380), min(d.position[1], 960))
        page.mouse.move(*d.position)
        d.click(page.locator("#new-note-btn"))
        d.click(page.locator("#note-title"))
        d.type("Scratchpad", 65)
        d.click(page.locator("#note-tags"))
        d.type("scratchpad", 55)
        d.click(page.locator("#note-content"))
        d.type("# Scratchpad\n\nFor the train ride home.\n", 55)
        d.click(page.locator("#save-btn").filter(visible=True).first)
        expect(mobile.locator('#tag-bar [data-tag="scratchpad"]')).to_be_visible()
        m.click(mobile.locator('#tag-bar [data-tag="scratchpad"]'))
        expect(
            mobile.locator(".note-item").filter(
                has=mobile.get_by_text("Scratchpad", exact=True)
            )
        ).to_be_visible(timeout=20000)
        m.click(
            mobile.locator(".note-item").filter(
                has=mobile.get_by_text("Scratchpad", exact=True)
            )
        )
        m.view("preview")
        d.click(page.locator("#note-content"))
        page.keyboard.press("Control+End")
        page.keyboard.insert_text("\nhttps://www.gutenberg.org/ebooks/84\n")
        expect(
            mobile.locator('#preview a[href="https://www.gutenberg.org/ebooks/84"]')
        ).to_be_visible(timeout=20000)
        d.hold(2)
        print("PASS Scratchpad link arrived through real server sync", flush=True)

        mark("Work offline")
        desktop.set_offline(True)
        assert page.evaluate("navigator.onLine") is False
        d.hold(1.2)
        d.click(page.locator("#note-content"))
        page.keyboard.press("Control+End")
        d.type(OFFLINE_TEXT, 60)
        # The app reports offline after a real sync attempt fails, not merely
        # when the browser toggles its network emulation state.
        expect(page.locator("#editor .offline-notice")).to_be_visible(timeout=15000)
        # Persistence is asynchronous; let the actual local save finish before reloading.
        page.wait_for_timeout(1300)
        expect(mobile.locator("#preview")).not_to_contain_text("Offline reminder")
        note_id = page.url.rsplit("/", 1)[-1]
        server_note = checked(mobile.request.get(base + "/api/notes/" + note_id))
        assert "Offline reminder" not in server_note["content"]
        mark("Reload while offline")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator("#editor")).to_be_visible(timeout=15000)
        expect(page.locator("#note-content")).to_have_value(
            re.compile("Offline reminder: pack a notebook")
        )
        d.view("preview")
        expect(page.locator("#preview")).to_contain_text(
            "Offline reminder: pack a notebook"
        )
        d.hold(1.7)
        mark("Reconnect and sync")
        desktop.set_offline(False)
        expect(mobile.locator("#preview")).to_contain_text(
            "Offline reminder: pack a notebook", timeout=30000
        )
        expect(page.locator("#editor .offline-notice")).to_be_hidden(timeout=15000)
        d.hold(2.4)
        print(
            "PASS real offline edit survived reload, stayed local, and synced after reconnect",
            flush=True,
        )
        mark("End")
        success = True
    finally:
        duration = time.monotonic() - started
        desktop_video = page.video
        phone_video = mobile.video
        page.screenshot(path=str(output / "last-frame.png"))
        desktop.close()
        phone.close()
        desktop_video.save_as(output / "walkthrough-desktop.webm")
        phone_video.save_as(output / "walkthrough-phone.webm")
        metadata = {
            "success": success,
            "duration": duration,
            "desktop_offset": max(0, started - desktop.capture_started),
            "phone_offset": max(0, started - phone.capture_started),
            "dual_start": dual_start,
            "events": events,
            "sample_data": True,
            "single_instance": True,
            "notes_use_em_dashes": False,
            "visible_cursor": True,
            "grab_cursor": True,
            "real_offline_reload": True,
            "capture_picker": "real HTML select/options rendered with appearance:base-select",
            "desktop_size": [1920, 1080],
            "dual_desktop_crop": [1440, 1000, 0, 0],
            "phone_size": [390, 844],
        }
        (output / "walkthrough.json").write_text(json.dumps(metadata, indent=2) + "\n")
        print("Raw recordings preserved at " + str(output), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--chrome", default="/usr/bin/google-chrome")
    parser.add_argument("--pace", type=float, default=1)
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="vylk-walkthrough-") as directory:
        scratch = Path(directory)
        binary = scratch / "vylk"
        env = os.environ.copy()
        env.setdefault("GOCACHE", "/tmp/vylk-media-go-cache")
        subprocess.run(
            ["go", "build", "-o", str(binary), "./cmd/vylk"],
            cwd=source,
            env=env,
            check=True,
        )
        with server(binary, scratch) as (base, password), sync_playwright() as p:
            browser = p.chromium.launch(executable_path=args.chrome, headless=True)
            try:
                capture(browser, base, password, output, scratch, args.pace)
            finally:
                browser.close()
    metadata = json.loads((output / "walkthrough.json").read_text())
    metadata.update(
        version=(source / "VERSION").read_text().strip(),
        revision=subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=source, text=True
        ).strip(),
    )
    (output / "walkthrough.json").write_text(json.dumps(metadata, indent=2) + "\n")


if __name__ == "__main__":
    main()
