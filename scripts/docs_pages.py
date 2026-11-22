"""Render VYLK's docs/*.md user documentation into static pages under /docs/."""

import json
import posixpath
import re
from html import escape

import docs_markdown

# Source file in VYLK's docs/, published file under /docs/, and page description.
PAGES = (
    ("getting-started.md", "index.html", "Install vylk, open it in a browser, and write your first note."),
    ("how-to.md", "how-to.html", "Steps for other devices, HTTPS, encryption, backups, and updates."),
    ("concepts.md", "concepts.html", "Where vylk stores notes and how devices sync and resolve conflicts."),
    ("encryption.md", "encryption.html", "How vylk end-to-end encryption works and what it does not protect."),
    ("cli-reference.md", "cli-reference.html", "vylk command-line options, environment variables, files, and startup errors."),
)
PUBLISHED = {source: output for source, output, _ in PAGES}
PUBLISHED.update({"api/README.md": "api/index.html", "api/client-protocol.md": "api/client-protocol.html"})
SOURCE_URL = "https://github.com/toxdes/vylk/blob"

# Section anchors of the former single-page docs. Released apps and READMEs link to them.
LEGACY_ANCHORS = {
    "start": "index.html",
    "install": "index.html#install-vylk",
    "features": "how-to.html#write-and-organize",
    "offline": "concepts.html#saving-and-sync",
    "end-to-end-encryption": "encryption.html",
    "security": "how-to.html#keep-your-notes-safe",
    "remote": "how-to.html#use-other-devices",
    "config": "cli-reference.html#environment-variables",
    "build": "https://github.com/toxdes/vylk/blob/main/docs/development.md",
}


def link_mapper(tag):
    def link(url):
        if url.startswith(("https://", "http://", "#")):
            return url
        path, _, fragment = url.partition("#")
        path = posixpath.normpath(path)
        if path in PUBLISHED:
            return PUBLISHED[path] + (f"#{fragment}" if fragment else "")
        if path.startswith("api/"):
            return url
        return f"{SOURCE_URL}/{tag}/" + posixpath.normpath(f"docs/{path}") + (
            f"#{fragment}" if fragment else ""
        )

    return link


def legacy_redirect():
    targets = json.dumps(LEGACY_ANCHORS)
    return (
        "  <script>(function(){var t=" + targets + ";function go(){var h=location.hash.slice(1);"
        "if(Object.prototype.hasOwnProperty.call(t,h))location.replace(t[h]);}"
        "go();addEventListener('hashchange',go);})();</script>\n"
    )


def check_links(pages):
    """Fail on links to missing pages or anchors, including legacy redirect targets."""
    ids = {output: set(re.findall(r'\sid="([^"]+)"', html)) for output, html in pages.items()}
    for output, html in pages.items():
        hrefs = re.findall(r'<a href="([^"]+)"', html)
        if output == "index.html":
            hrefs += LEGACY_ANCHORS.values()
        for href in hrefs:
            if href.startswith(("https://", "http://", "../", "api/")):
                continue
            page, _, fragment = href.partition("#")
            page = page or output
            if page not in ids:
                raise ValueError(f"{output} links to a missing page: {href}")
            if fragment and fragment not in ids[page]:
                raise ValueError(f"{output} links to a missing anchor: {href}")


def render_pages(sources, template, version, tag, preview=False):
    """Return {published file: HTML}. `sources` maps docs/ file names to Markdown."""
    link = link_mapper(tag)
    documents = {output: docs_markdown.render(sources[source].replace("__VYLK_VERSION__", version), link) for source, output, _ in PAGES}
    pages = {}
    for source, output, description in PAGES:
        document = documents[output]
        toc = ""
        for _, other, _ in PAGES:
            current = ' aria-current="page"' if other == output else ""
            toc += f'<a href="{other}"{current}>{escape(documents[other].title)}</a>'
            if other == output:
                toc += "".join(f'<a class="toc-section" href="#{anchor}">{escape(text)}</a>' for anchor, text in document.toc)
        values = {
            "TITLE": escape(document.title),
            "DESCRIPTION": escape(description, quote=True),
            "HEAD": legacy_redirect() if output == "index.html" else "",
            "TOC": toc,
            "CONTENT": document.content,
            "VERSION": escape(version),
            "PREVIEW": " · Local preview" if preview else "",
            "SOURCE": escape(f"{SOURCE_URL}/{tag}/docs/{source}", quote=True),
        }
        html = template
        for key, value in values.items():
            html = html.replace("{{" + key + "}}", value)
        if re.search(r"\{\{[A-Z]+\}\}", html):
            raise ValueError("Unresolved docs template placeholder")
        pages[output] = html
    check_links(pages)
    return pages
