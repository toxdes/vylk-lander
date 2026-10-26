import os
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import announcements
import build

TEMPLATE = (build.ROOT / "scripts/announcements-template.html").read_text()


def entry(tag="v3.1.1", body="## Changes\n\n1. Original `code`.\n2. Fix syncing."):
    return (
        f"## {tag}\n\nMerged: 2026-10-20\n"
        f"Source: [Pull request #28](https://github.com/toxdes/vylk/pull/28)\n\n{body}\n"
    )


class Inventory(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids, self.anchors = [], []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "a" and attrs.get("href", "").startswith("#"):
            self.anchors.append(attrs["href"][1:])


class AnnouncementTests(unittest.TestCase):
    def test_descriptions_are_not_rewritten(self):
        body = '## Changes\n\n1. fix(sync): "Select All" + "Delete"\n 7. ui(dialogs): uniform motion\n\n**Full Changelog**: https://github.com/toxdes/vylk/compare/v3.0.3...v3.0.4'
        release = announcements.parse_releases(entry(body=body))[0]
        self.assertEqual(release.description, body)
        html = announcements.render_announcements(entry(body=body), "3.1.1", TEMPLATE)
        self.assertIn('<li value="7">ui(dialogs): uniform motion</li>', html)
        self.assertIn("<strong>Full Changelog</strong>", html)
        self.assertIn(
            'href="https://github.com/toxdes/vylk/compare/v3.0.3...v3.0.4"', html
        )

    def test_sort_filter_and_stable_anchors(self):
        text = entry("v3.0.4") + entry("v4.0.0") + entry("v3.1.1")
        html = announcements.render_announcements(text, "3.1.1", TEMPLATE)
        self.assertNotIn("v4.0.0", html)
        self.assertLess(html.index('id="v3.1.1"'), html.index('id="v3.0.4"'))
        inventory = Inventory()
        inventory.feed(html)
        self.assertEqual(len(inventory.ids), len(set(inventory.ids)))
        self.assertTrue(set(inventory.anchors) <= set(inventory.ids))
        self.assertNotIn("{{", html)
        self.assertNotIn("<script", html)

    def test_site_omits_pr_boilerplate_but_keeps_source(self):
        body = "## Changes\n\nChanges since [previous release](https://github.com/toxdes/vylk/releases/tag/v3.1.0):\n\n1. Original change."
        source = entry(body=body)
        html = announcements.render_announcements(source, "3.1.1", TEMPLATE)
        self.assertNotIn("Changes since", html)
        self.assertNotIn("<h3>Changes</h3>", html)
        self.assertNotIn("<time", html)
        self.assertNotIn("Pull request #28", html)
        self.assertIn("Original change.", html)
        self.assertEqual(announcements.parse_releases(source)[0].description, body)

    def test_latest_badge_and_older_history(self):
        source = entry("v3.1.0") + entry("v3.1.1") + entry("v3.0.4")
        html = announcements.render_announcements(source, "3.1.0", TEMPLATE)
        self.assertEqual(html.count('class="release-latest"'), 1)
        self.assertIn('v3.1.0</a></h2><span class="release-latest">Latest</span>', html)
        self.assertIn("Before v3.0.4", html)
        self.assertIn("Changelog was not maintained for older releases", html)
        self.assertNotIn("v3.1.1", html)

    def test_html_is_escaped_and_unsafe_links_are_rejected(self):
        html = announcements.render_description("<script>bad()</script>\n\n`<code>`")
        self.assertIn("&lt;script&gt;bad()&lt;/script&gt;", html)
        self.assertIn("<code>&lt;code&gt;</code>", html)
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            announcements.render_description("[click](javascript:bad)")
        literal = announcements.render_announcements(
            entry(body="{{OUTLINE}}"), "3.1.1", TEMPLATE
        )
        self.assertIn("<p>{{OUTLINE}}</p>", literal)

    def test_invalid_metadata_duplicates_and_missing_descriptions_fail(self):
        for text in (
            "# Releases\n",
            entry() + entry(),
            entry().replace("2026-10-20", "2026-02-30"),
            entry(body=""),
            entry().replace(
                "https://github.com/toxdes/vylk/pull/28", "https://evil.test/28"
            ),
        ):
            with self.subTest(text=text), self.assertRaises(ValueError):
                announcements.parse_releases(text)
        with self.assertRaisesRegex(ValueError, "No announcements"):
            announcements.render_announcements(entry(), "3.0.4", TEMPLATE)

    def test_unsupported_markdown_blocks_fail(self):
        for text in ("```go\ncode\n```", "> quote", "| table |", "    indented code"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                announcements.render_description(text)

    def test_local_history_uses_same_checkout_as_docs(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "releases.md").write_text(entry())
            with patch.dict(os.environ, {"VYLK_API_SOURCE": directory}, clear=True):
                self.assertEqual(build.release_descriptions(), entry())

    def test_remote_history_uses_main_for_retroactive_entries(self):
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(build, "download", return_value=entry()) as fetch,
        ):
            self.assertEqual(build.release_descriptions(), entry())
            self.assertTrue(
                fetch.call_args.args[0].startswith(
                    f"{build.SOURCE_URL}/main/releases.md?build="
                )
            )

    def test_failed_history_preserves_previous_build(self):
        for error in (OSError("download failed"), ValueError("bad history")):
            with self.subTest(error=error), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / "dist").mkdir()
                marker = root / "dist/index.html"
                marker.write_text("previous output")
                with (
                    patch.object(build, "ROOT", root),
                    patch.object(build, "release_version", return_value="3.1.1"),
                    patch.object(build, "documentation", return_value=({}, "", False)),
                    patch.object(build.Path, "read_text", return_value="template"),
                    patch.object(build, "release_descriptions", side_effect=error),
                    self.assertRaises(type(error)),
                ):
                    build.build()
                self.assertEqual(marker.read_text(), "previous output")


if __name__ == "__main__":
    unittest.main()
