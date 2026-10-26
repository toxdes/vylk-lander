"""Render the curated releases.md without fetching PRs in visitors' browsers."""

import re
from dataclasses import dataclass
from datetime import date
from html import escape

from api_reference import inline

VERSION = r"v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
RELEASE_HEADING = re.compile(rf"^## ({VERSION})$", re.MULTILINE)


@dataclass(frozen=True)
class Release:
    tag: str
    date: date
    date_label: str
    source_label: str
    source_url: str
    description: str

    @property
    def version(self):
        return tuple(int(part) for part in self.tag[1:].split("."))


def parse_releases(markdown):
    markdown = markdown.removesuffix("\n<!-- prettier-ignore-end -->\n")
    headings = list(RELEASE_HEADING.finditer(markdown))
    releases = []
    seen = set()
    for index, heading in enumerate(headings):
        tag = heading[1]
        end = (
            headings[index + 1].start() if index + 1 < len(headings) else len(markdown)
        )
        entry = markdown[heading.end() : end].strip()
        metadata = re.fullmatch(
            r"(Merged|Published): (\d{4}-\d{2}-\d{2})\n"
            r"Source: \[([^\]]+)\]\((https://github\.com/toxdes/vylk/[^\s)]+)\)\n\n"
            r"(.+)",
            entry,
            re.DOTALL,
        )
        if tag in seen or not metadata:
            raise ValueError(f"Invalid or duplicate announcement: {tag}")
        seen.add(tag)
        label, day, source_label, source_url, description = metadata.groups()
        releases.append(
            Release(
                tag,
                date.fromisoformat(day),
                label,
                source_label,
                source_url,
                description,
            )
        )
    if not releases:
        raise ValueError("releases.md must contain at least one release description")
    return sorted(releases, key=lambda release: release.version, reverse=True)


def announcement_inline(text):
    # PRs contain Markdown links, code, emphasis, and GitHub's bare-URL autolinks.
    # Source HTML stays escaped; shared inline() rejects unsafe link schemes.
    tokens = re.split(
        r"(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|https?://[^\s<>]+)", text
    )
    output = []
    for token in tokens:
        if token.startswith("**") and token.endswith("**"):
            output.append(f"<strong>{inline(token[2:-2])}</strong>")
        elif token.startswith(("https://", "http://")):
            url = escape(token, quote=True)
            output.append(f'<a href="{url}">{escape(token)}</a>')
        else:
            output.append(inline(token))
    return "".join(output)


def render_description(markdown):
    """Support the source descriptions' headings, paragraphs, and flat lists.

    Fail on unsupported blocks rather than silently dropping release content.
    Keep supplied ordered-list numbers, including non-contiguous sequences.
    """
    output, paragraph = [], []
    list_kind = None

    def flush():
        if paragraph:
            output.append(f"<p>{announcement_inline(' '.join(paragraph))}</p>")
            paragraph.clear()

    def end_list():
        nonlocal list_kind
        if list_kind:
            output.append(f"</{list_kind}>")
            list_kind = None

    for source_line in markdown.splitlines():
        line = source_line.strip()
        # Hide PR boilerplate on the site while retaining the source verbatim.
        if (
            re.fullmatch(r"#{1,4} (?:Changes|What['’]s Changed)", line, re.IGNORECASE)
            or re.fullmatch(
                r"Changes since \[previous release\]\([^)]+\):", line, re.IGNORECASE
            )
            or not line
        ):
            flush()
            end_list()
        elif match := re.fullmatch(r"(#{1,4}) (.+)", line):
            flush()
            end_list()
            level = min(len(match[1]) + 1, 5)
            level = max(level, 3)  # The release version owns h2.
            output.append(f"<h{level}>{announcement_inline(match[2])}</h{level}>")
        elif match := re.fullmatch(r"([-*]|\d+\.) (.+)", line):
            flush()
            kind = "ul" if match[1] in ("-", "*") else "ol"
            if kind != list_kind:
                end_list()
                output.append(f"<{kind}>")
                list_kind = kind
            number = f' value="{int(match[1][:-1])}"' if kind == "ol" else ""
            output.append(f"<li{number}>{announcement_inline(match[2])}</li>")
        elif re.match(r"^(\s{4}|\t|>|\||```|~~~|#{5})", source_line):
            raise ValueError(
                "Unsupported release Markdown block; extend and test the renderer before publishing"
            )
        else:
            end_list()
            paragraph.append(line)
    flush()
    end_list()
    return "".join(output)


def releases_for_version(markdown, version):
    selected = tuple(int(part) for part in version.split("."))
    releases = [
        release for release in parse_releases(markdown) if release.version <= selected
    ]
    if not releases:
        raise ValueError(f"No announcements available for v{version} or earlier")
    return releases


def render_announcements(markdown, version, template):
    releases = releases_for_version(markdown, version)
    outline, content = [], []
    for index, release in enumerate(releases):
        tag = escape(release.tag)
        outline.append(f'<a href="#{tag}">{tag}</a>')
        latest = '<span class="release-latest">Latest</span>' if index == 0 else ""
        content.append(
            f'<section class="release" id="{tag}" aria-labelledby="{tag}-title">'
            f'<div class="release-heading"><h2 id="{tag}-title"><a href="#{tag}">{tag}</a></h2>{latest}</div>'
            f"{render_description(release.description)}</section>"
        )
    oldest_tag = escape(releases[-1].tag)
    content.append(
        '<section class="release-history" id="older-releases">'
        f"<h2>Before {oldest_tag}</h2>"
        "<p>Changelog was not maintained for older releases — see "
        '<a href="https://github.com/toxdes/vylk/releases">releases</a>.</p></section>'
    )
    values = {"OUTLINE": "".join(outline), "RELEASES": "".join(content)}
    # One pass keeps any placeholder-looking text in descriptions literal.
    return re.sub(
        r"\{\{(OUTLINE|RELEASES)\}\}", lambda match: values[match[1]], template
    )
