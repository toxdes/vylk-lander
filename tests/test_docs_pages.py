import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import docs_markdown
import docs_pages

TEMPLATE = (Path(__file__).resolve().parents[1] / "scripts/docs-template.html").read_text()


# Headings that docs_pages.LEGACY_ANCHORS redirects to.
LEGACY_HEADINGS = {
    "getting-started.md": ["Install vylk"],
    "how-to.md": ["Write and organize", "Use other devices", "Keep your notes safe"],
    "concepts.md": ["Saving and sync"],
    "cli-reference.md": ["Environment variables"],
}


def sources(**overrides):
    pages = {}
    for name, _, _ in docs_pages.PAGES:
        headings = "".join(f"## {heading}\n\n" for heading in LEGACY_HEADINGS.get(name, ["Section"]))
        pages[name] = f"# {name}\n\n{headings}Text.\n"
    pages.update(overrides)
    return pages


class MarkdownTests(unittest.TestCase):
    def test_tables_bold_and_numbered_list_continuation(self):
        document = docs_markdown.render(
            "# Page\n\n| Name | Value |\n| --- | --- |\n| `PORT` | **8080** |\n\n"
            "1. First\n\n```sh\nrun\n```\n\n2. Second\n"
        )
        self.assertIn("<th>Name</th>", document.content)
        self.assertIn("<td><code>PORT</code></td><td><strong>8080</strong></td>", document.content)
        self.assertIn('<ol start="2"><li>Second</li></ol>', document.content)
        self.assertEqual(document.title, "Page")

    def test_subheadings_get_anchors_and_duplicates_fail(self):
        document = docs_markdown.render('# Page\n\n## Group\n\n### Respond to "Notes database changed"\n')
        self.assertIn('<h3 id="respond-to-notes-database-changed">', document.content)
        self.assertEqual(document.toc, [("group", "Group")])
        with self.assertRaises(ValueError):
            docs_markdown.render("# Page\n\n## Same\n\n### Same\n")

    def test_unsupported_and_malformed_blocks_fail(self):
        for text in ("# Page\n\n> quote\n", "# Page\n\n  - nested\n", "# Page\n\n| a |\n| b |\n", "## No title\n"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                docs_markdown.render(text)


class PageTests(unittest.TestCase):
    def test_links_map_to_published_pages_and_release_sources(self):
        link = docs_pages.link_mapper("v1.2.3")
        self.assertEqual(link("how-to.md#turn-on-encryption"), "how-to.html#turn-on-encryption")
        self.assertEqual(link("getting-started.md"), "index.html")
        self.assertEqual(link("api/client-protocol.md#encryption-wire-format"), "api/client-protocol.html#encryption-wire-format")
        self.assertEqual(link("../AGENTS.md"), "https://github.com/toxdes/vylk/blob/v1.2.3/AGENTS.md")
        self.assertEqual(link("#local"), "#local")

    def test_pages_render_with_navigation_version_and_legacy_redirect(self):
        pages = docs_pages.render_pages(
            sources(**{"how-to.md": "# How-to guides\n\n## Write and organize\n\n## Use other devices\n\n## Keep your notes safe\n\nUse `__VYLK_VERSION__`.\n"}),
            TEMPLATE,
            "1.2.3",
            "v1.2.3",
        )
        self.assertEqual(set(pages), {output for _, output, _ in docs_pages.PAGES})
        self.assertIn("<code>1.2.3</code>", pages["how-to.html"])
        self.assertIn('<a href="how-to.html" aria-current="page">How-to guides</a>', pages["how-to.html"])
        self.assertIn("location.replace", pages["index.html"])
        self.assertNotIn("location.replace", pages["how-to.html"])
        self.assertIn('"end-to-end-encryption": "encryption.html"', pages["index.html"])
        self.assertIn("https://github.com/toxdes/vylk/blob/v1.2.3/docs/how-to.md", pages["how-to.html"])

    def test_broken_internal_links_fail_the_build(self):
        for text in ("[missing](how-to.md#nowhere)", "[missing](#nowhere)"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                docs_pages.render_pages(
                    sources(**{"concepts.md": f"# Concepts\n\n## Saving and sync\n\n{text}\n"}),
                    TEMPLATE,
                    "1.2.3",
                    "v1.2.3",
                )

    def test_missing_legacy_redirect_target_fails_the_build(self):
        with self.assertRaisesRegex(ValueError, "install-vylk"):
            docs_pages.render_pages(
                sources(**{"getting-started.md": "# Getting started\n\n## Install\n"}),
                TEMPLATE,
                "1.2.3",
                "v1.2.3",
            )


if __name__ == "__main__":
    unittest.main()
