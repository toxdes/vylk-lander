import re
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


def render(pages):
    return docs_pages.render_pages(pages, TEMPLATE, "1.2.3", "v1.2.3", docs_pages.navigation(pages, "# Client guide\n"))


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

    def test_indented_lines_continue_a_list_item(self):
        document = docs_markdown.render("# Page\n\n- First line\n  continues `here`.\n- Second\n")
        self.assertIn("<ul><li>First line continues <code>here</code>.</li><li>Second</li></ul>", document.content)

    def test_subheadings_get_anchors_and_duplicates_fail(self):
        document = docs_markdown.render('# Page\n\n## Group\n\n### Respond to "Notes database changed"\n')
        self.assertIn('<h3 id="respond-to-notes-database-changed">', document.content)
        self.assertEqual(document.toc, [("group", "Group")])
        with self.assertRaises(ValueError):
            docs_markdown.render("# Page\n\n## Same\n\n### Same\n")

    def test_unsupported_and_malformed_blocks_fail(self):
        for text in ("# Page\n\n> quote\n", "# Page\n\n  - nested\n", "# Page\n\n- item\n  - nested\n", "# Page\n\n| a |\n| b |\n", "## No title\n"):
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
        pages = render(sources(**{"how-to.md": "# How-to guides\n\n## Write and organize\n\n## Use other devices\n\n## Keep your notes safe\n\nUse `__VYLK_VERSION__`.\n"}))
        self.assertEqual(set(pages), {output for _, output, _ in docs_pages.PAGES})
        self.assertIn("<code>1.2.3</code>", pages["how-to.html"])
        self.assertIn('<a href="how-to.html" aria-current="page">How-to guides</a>', pages["how-to.html"])
        self.assertIn("location.replace", pages["index.html"])
        self.assertNotIn("location.replace", pages["how-to.html"])
        self.assertIn('"end-to-end-encryption": "encryption.html"', pages["index.html"])
        self.assertIn("https://github.com/toxdes/vylk/blob/v1.2.3/docs/how-to.md", pages["how-to.html"])

    def test_every_page_lists_every_page_in_one_order(self):
        pages = render(sources())
        expected = ["index.html", "how-to.html", "concepts.html", "encryption.html", "cli-reference.html",
                    "api/index.html", "api/client-protocol.html"]
        for output, html in pages.items():
            with self.subTest(output=output):
                outline = html.split('<div class="api-desktop-outline">')[1].split("</div>")[0]
                links = [href for href in re.findall(r'<a href="([^"]+)"', outline) if not href.startswith("#")]
                self.assertEqual(links, expected)
        self.assertIn('<a href="api/index.html">HTTP API reference</a><a href="api/client-protocol.html">Client guide</a>', pages["index.html"])

    def test_sidebar_links_resolve_from_the_api_folder(self):
        nav = [("index.html", "Start"), ("api/index.html", "API"), ("api/client-protocol.html", "Guide")]
        html = docs_pages.sidebar(nav, "api/index.html", [("sync", "Sync", 1), ("push", "Push", 2)])
        self.assertEqual(html, '<a href="../index.html">Start</a><a href="index.html" aria-current="page">API</a>'
                         '<a class="toc-section" href="#sync">Sync</a><a class="toc-section toc-subsection" href="#push">Push</a>'
                         '<a href="client-protocol.html">Guide</a>')

    def test_broken_internal_links_fail_the_build(self):
        for text in ("[missing](how-to.md#nowhere)", "[missing](#nowhere)"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                render(sources(**{"concepts.md": f"# Concepts\n\n## Saving and sync\n\n{text}\n"}))

    def test_missing_legacy_redirect_target_fails_the_build(self):
        with self.assertRaisesRegex(ValueError, "install-vylk"):
            render(sources(**{"getting-started.md": "# Getting started\n\n## Install\n"}))


if __name__ == "__main__":
    unittest.main()
