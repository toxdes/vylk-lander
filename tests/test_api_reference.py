import copy
import json
import os
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import api_reference
import build


class HTMLInventory(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.links = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "a":
            self.links.append(attrs.get("href", ""))
        if tag == "script":
            self.scripts.append(attrs)


SPEC = {
    "openapi": "3.1.0",
    "info": {"title": "Test", "version": "1.2.3"},
    "security": [{"session": []}],
    "tags": [{"name": "Notes"}],
    "paths": {
        "/api/notes": {
            "get": {
                "operationId": "listNotes",
                "summary": "List notes",
                "tags": ["Notes"],
                "responses": {
                    "200": {
                        "description": "Notes",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/Note"}
                            }
                        },
                    }
                },
            }
        }
    },
    "components": {
        "schemas": {
            "Note": {"type": "object", "properties": {"title": {"type": "string"}}}
        }
    },
}
GUIDE = "# Client guide\n\nUse `session` cookies.\n\n## Sync\n\nNever discard pending edits.\n"
TEMPLATE = (build.ROOT / "scripts/api-template.html").read_text()


class ReferenceTests(unittest.TestCase):
    def test_local_references_and_unique_routes(self):
        api_reference.validate_specification(SPEC)
        broken = copy.deepcopy(SPEC)
        broken["paths"]["/api/notes"]["get"]["responses"]["200"]["content"][
            "application/json"
        ]["schema"]["$ref"] = "https://invalid/schema"
        with self.assertRaises(ValueError):
            api_reference.validate_specification(broken)
        broken = copy.deepcopy(SPEC)
        broken["paths"]["/api/notes"]["get"]["tags"] = ["Undeclared"]
        with self.assertRaises(ValueError):
            api_reference.validate_specification(broken)

    def test_reference_has_all_subsections_and_resolving_anchors(self):
        html = api_reference.render_reference(SPEC, TEMPLATE)
        for section in (
            "Request headers",
            "Path parameters",
            "Query parameters",
            "Request body",
            "Response headers",
            "Responses",
        ):
            self.assertIn(section, html)
        inventory = HTMLInventory()
        inventory.feed(html)
        self.assertEqual(len(inventory.ids), len(set(inventory.ids)))
        for href in inventory.links:
            if href.startswith("#"):
                self.assertIn(href[1:], inventory.ids)
            elif href.startswith("index.html#"):
                self.assertIn(href.split("#")[1], inventory.ids)
        self.assertEqual(inventory.scripts, [])
        self.assertIn("../style.css", html)
        self.assertIn("JetBrains+Mono", html)
        self.assertNotIn("{{", html)

    def test_guide_escapes_html_and_rejects_unsafe_links(self):
        html = api_reference.render_guide(
            GUIDE + "\n<script>bad()</script>\n", SPEC, TEMPLATE
        )
        self.assertIn("&lt;script&gt;", html)
        self.assertIn("<code>session</code>", html)
        with self.assertRaises(ValueError):
            api_reference.inline("[bad](javascript:alert)")
        with self.assertRaises(ValueError):
            api_reference.render_guide(
                GUIDE + "\n| unsupported table |\n", SPEC, TEMPLATE
            )

    def test_preview_is_explicit(self):
        self.assertIn(
            "Local preview", api_reference.render_reference(SPEC, TEMPLATE, True)
        )
        self.assertNotIn(
            "Local preview", api_reference.render_reference(SPEC, TEMPLATE, False)
        )

    def test_guide_lists_and_fenced_code(self):
        html = api_reference.render_guide(
            GUIDE + '\n- One\n- Two\n\n1. First\n2. Second\n\n```json\n{"a":1}\n```\n',
            SPEC,
            TEMPLATE,
        )
        self.assertIn("<ul><li>One</li><li>Two</li></ul>", html)
        self.assertIn("<ol><li>First</li><li>Second</li></ol>", html)
        self.assertIn("<pre><code>{&quot;a&quot;:1}</code></pre>", html)
        self.assertIn('aria-current="location"', html)


class BuildTests(unittest.TestCase):
    def test_missing_release_source_has_actionable_error_without_retries(self):
        url = "https://example.test/v3.0.4/docs/api/openapi.json"
        error = HTTPError(url, 404, "Not Found", {}, None)
        with patch.object(build, "urlopen", side_effect=error) as fetch:
            with self.assertRaisesRegex(
                ValueError, "Publish a release containing docs/api"
            ):
                build.download(url)
            fetch.assert_called_once()

    def test_latest_release_not_main_determines_source(self):
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(
                build, "download", return_value='{"tag_name":"v1.2.3"}'
            ) as fetch,
        ):
            self.assertEqual(build.release_version(), "1.2.3")
            fetch.assert_called_once()
            self.assertTrue(
                fetch.call_args.args[0].startswith(build.RELEASE_URL + "?build=")
            )

    def test_remote_documents_use_one_tag(self):
        def fetch(url):
            if url.endswith("/VERSION"):
                return "1.2.3\n"
            if url.endswith("openapi.json"):
                return json.dumps(SPEC)
            return GUIDE

        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(build, "download", side_effect=fetch) as download,
        ):
            spec, guide, local = build.documentation("1.2.3")
            self.assertEqual(spec["info"]["version"], "1.2.3")
            self.assertEqual(guide, GUIDE)
            self.assertFalse(local)
            self.assertEqual(len(download.call_args_list), 3)
            self.assertTrue(
                all("/v1.2.3/" in call.args[0] for call in download.call_args_list)
            )

    def test_mismatched_source_fails_without_fallback(self):
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(
                build, "download", side_effect=["9.9.9", json.dumps(SPEC), GUIDE]
            ) as download,
        ):
            with self.assertRaises(ValueError):
                build.documentation("1.2.3")
            self.assertEqual(download.call_count, 3)

    def test_failed_acquisition_preserves_previous_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "dist").mkdir()
            marker = root / "dist/index.html"
            marker.write_text("previous build")
            with (
                patch.object(build, "ROOT", root),
                patch.object(build, "release_version", return_value="1.2.3"),
                patch.object(
                    build, "documentation", side_effect=OSError("download failed")
                ),
                self.assertRaises(OSError),
            ):
                build.build()
            self.assertEqual(marker.read_text(), "previous build")

    def test_invalid_version_cannot_be_used_as_a_source_ref(self):
        for version in ("../main", "3.0.4\n", "v3.0.4", "3.0.4-beta"):
            with (
                self.subTest(version=version),
                patch.dict(os.environ, {"VYLK_VERSION": version}, clear=True),
                self.assertRaises(ValueError),
            ):
                build.release_version()


if __name__ == "__main__":
    unittest.main()
