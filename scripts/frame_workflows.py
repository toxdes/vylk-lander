#!/usr/bin/env python3
"""Apply the approved Vylk recording frames and 1.5x speed without re-recording.

uv run --with playwright python3 scripts/frame_workflows.py --source DIR --output assets
The source directory contains the desktop/phone WebM files and walkthrough.json.
"""

import argparse
import json
import math
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

MASK_CSS = """
body{background:#000!important}
body:before,.dock{display:none!important}
.titlebar,.status,.home{visibility:hidden!important}
.window,.phone,.phone-screen{background:none!important;box-shadow:none!important;outline:none!important}
.video-slot{background:#fff!important}
"""


def probe(path):
    data = json.loads(
        subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
                str(path),
            ],
            text=True,
        )
    )
    stream = next(s for s in data["streams"] if s["codec_type"] == "video")
    return float(data["format"]["duration"]), stream["width"], stream["height"]


def render_frames(template, scratch, chrome):
    result = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=chrome, headless=True)
        try:
            for name in ("single", "dual"):
                page = browser.new_page(
                    viewport={"width": 1920, "height": 1080}, device_scale_factor=1
                )
                page.goto(template.as_uri() + ("#dual" if name == "dual" else ""))
                page.evaluate(
                    "async () => {await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))}"
                )
                slots = page.locator(".video-slot").evaluate_all("""elements => elements.filter(e=>e.getBoundingClientRect().width).map(e=>{
                    const r=e.getBoundingClientRect();
                    return {id:e.id,x:r.x,y:r.y,width:r.width,height:r.height};
                })""")
                background = scratch / f"{name}-frame.png"
                page.screenshot(path=str(background))
                page.add_style_tag(content=MASK_CSS)
                mask = scratch / f"{name}-mask.png"
                page.screenshot(path=str(mask))
                result[name] = {"background": background, "mask": mask, "slots": slots}
                page.close()
        finally:
            browser.close()
    return result


def branch(input_label, mask_label, slot, crop, output_label):
    x, y, width, height = [round(slot[key]) for key in ("x", "y", "width", "height")]
    source_crop = f"crop={crop}," if crop else ""
    return (
        (
            f"[{input_label}]{source_crop}scale={width}:{height}:flags=lanczos,format=rgb24[pixels{output_label}];"
            f"[{mask_label}]crop={width}:{height}:{x}:{y},format=gray[mask{output_label}];"
            f"[pixels{output_label}][mask{output_label}]alphamerge[{output_label}]"
        ),
        x,
        y,
    )


def render_segment(source, destination, metadata, frame, start, end, speed, dual):
    duration = end - start
    command = [
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-ss",
        str(metadata["desktop_offset"] + start),
        "-i",
        str(source / "walkthrough-desktop.webm"),
        "-ss",
        str(metadata["phone_offset"] + start),
        "-i",
        str(source / "walkthrough-phone.webm"),
    ]
    for asset in (frame["background"], frame["mask"]):
        command += ["-loop", "1", "-framerate", "30", "-i", str(asset)]
    if dual:
        command += ["-loop", "1", "-framerate", "30", "-i", str(frame["mask"])]
    timing = f"setpts=(PTS-STARTPTS)/{speed},fps=30"
    filters = [f"[0:v]{timing}[desktop]"]
    desktop = next(slot for slot in frame["slots"] if slot["id"] == "desktop")
    graph, x, y = branch(
        "desktop", "3:v", desktop, "1440:1000:0:0" if dual else None, "d"
    )
    filters += [
        graph,
        f"[2:v][d]overlay={x}:{y}:shortest=1" + ("[stage]" if dual else "[out]"),
    ]
    if dual:
        filters.append(f"[1:v]{timing}[phone]")
        phone = next(slot for slot in frame["slots"] if slot["id"] == "phone")
        graph, x, y = branch("phone", "4:v", phone, None, "p")
        filters += [graph, f"[stage][p]overlay={x}:{y}:shortest=1[out]"]
    command += [
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[out]",
        "-t",
        str(duration / speed),
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "21",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
        str(destination),
    ]
    subprocess.run(command, check=True)
    print(f"Rendered {'desktop and phone' if dual else 'desktop'} segment", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--speed", type=float, default=1.5)
    parser.add_argument("--chrome", default="/usr/bin/google-chrome")
    args = parser.parse_args()
    if not math.isfinite(args.speed) or args.speed <= 0:
        parser.error("--speed must be positive and finite")
    source, output = args.source.resolve(), args.output.resolve()
    if source == output:
        parser.error(
            "Keep separate source and output directories to preserve originals"
        )
    metadata = json.loads((source / "walkthrough.json").read_text())
    if not metadata.get("success") or not metadata.get("dual_start"):
        parser.error(
            "The source walkthrough must have passed all action and offline checks"
        )
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="vylk-walkthrough-frames-") as directory:
        scratch = Path(directory)
        frames = render_frames(
            Path(__file__).with_name("media-frame.html"), scratch, args.chrome
        )
        segments = []
        for index, (start, end, dual) in enumerate(
            [
                (0, metadata["dual_start"], False),
                (metadata["dual_start"], metadata["duration"], True),
            ]
        ):
            path = scratch / f"segment-{index}.mp4"
            render_segment(
                source,
                path,
                metadata,
                frames["dual" if dual else "single"],
                start,
                end,
                args.speed,
                dual,
            )
            segments.append(path)
        listing = scratch / "segments.txt"
        listing.write_text("".join(f"file '{segment}'\n" for segment in segments))
        destination = output / "vylk-demo-walkthrough.mp4"
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(listing),
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(destination),
            ],
            check=True,
        )
    duration, width, height = probe(destination)
    assert (width, height) == (1920, 1080)
    assert math.isclose(duration, metadata["duration"] / args.speed, abs_tol=0.3)
    drag = next(
        item["time"]
        for item in metadata["events"]
        if item["name"] == "Drag a completed task"
    )
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-ss",
            str((drag + 2.8) / args.speed),
            "-i",
            str(destination),
            "-frames:v",
            "1",
            "-c:v",
            "libwebp",
            "-quality",
            "90",
            str(destination.with_suffix(".webp")),
        ],
        check=True,
    )
    published = {
        **metadata,
        "playback_speed": args.speed,
        "recordings": [
            {
                "name": "walkthrough",
                "file": destination.name,
                "width": width,
                "height": height,
                "duration": duration,
                "original_duration": metadata["duration"],
                "bytes": destination.stat().st_size,
            }
        ],
        "framing": "macOS window and Dock, no menu bar; notchless phone with matched height during sync and offline use",
        "chapters": [
            {"name": item["name"], "time": round(item["time"] / args.speed, 3)}
            for item in metadata["events"]
        ],
    }
    (output / "workflows.json").write_text(json.dumps(published, indent=2) + "\n")
    print(
        f"Finished one continuous walkthrough: {duration:.2f}s, 1920x1080, {args.speed}x",
        flush=True,
    )


if __name__ == "__main__":
    main()
