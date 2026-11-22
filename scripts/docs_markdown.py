"""Render the Markdown subset used by VYLK's docs/ into the lander's reading layout.

Supported: headings, paragraphs, flat lists, tables, fenced code, bold, inline
code, and links. Other blocks fail the build instead of losing content.
"""

import re
from dataclasses import dataclass
from html import escape

SAFE_RELATIVE_LINK = re.compile(r"[A-Za-z0-9_./-]+(#[a-z0-9-]+)?")
INLINE_TOKEN = re.compile(r"(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)")


@dataclass
class Document:
    title: str
    content: str
    toc: list


def anchor(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def inline(text, link=lambda url: url):
    # Escape all source HTML; documentation links can never become script URLs.
    result = ""
    for token in INLINE_TOKEN.split(text):
        if token.startswith("`") and token.endswith("`") and len(token) > 1:
            result += f"<code>{escape(token[1:-1])}</code>"
        elif token.startswith("**") and token.endswith("**") and len(token) > 4:
            result += f"<strong>{inline(token[2:-2], link)}</strong>"
        elif match := re.fullmatch(r"\[([^\]]+)\]\(([^)]+)\)", token):
            label, url = match.groups()
            if not (
                url.startswith(("https://", "http://", "#"))
                or SAFE_RELATIVE_LINK.fullmatch(url)
            ):
                raise ValueError(f"Unsafe documentation link: {url}")
            href = escape(link(url), quote=True)
            result += f'<a href="{href}">{inline(label, link)}</a>'
        else:
            result += escape(token)
    return result


def table_cells(line):
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def render(text, link=lambda url: url):
    """Return a Document. `link` maps a source URL to its published URL."""
    content, toc, paragraph_lines, table_lines = [], [], [], []
    title = None
    section_open = False
    code_lines = None
    list_kind = None
    ids = set()

    def flush_paragraph():
        if paragraph_lines:
            content.append("<p>" + inline(" ".join(paragraph_lines), link) + "</p>")
            paragraph_lines.clear()

    def end_list():
        nonlocal list_kind
        if list_kind:
            content.append(f"</{list_kind}>")
            list_kind = None

    def flush_table():
        if not table_lines:
            return
        if len(table_lines) < 2 or not re.fullmatch(r"\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*\|?", table_lines[1]):
            raise ValueError("Markdown table needs a header and a separator row")
        header = table_cells(table_lines[0])
        rows = [table_cells(line) for line in table_lines[2:]]
        if any(len(row) != len(header) for row in rows):
            raise ValueError("Markdown table rows must match the header")
        head = "".join(f"<th>{inline(cell, link)}</th>" for cell in header)
        body = "".join(
            "<tr>" + "".join(f"<td>{inline(cell, link)}</td>" for cell in row) + "</tr>"
            for row in rows
        )
        content.append(
            f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'
        )
        table_lines.clear()

    def end_blocks():
        flush_paragraph()
        end_list()
        flush_table()

    for line in text.splitlines():
        if code_lines is not None:
            if line.startswith("```"):
                content.append("<pre><code>" + escape("\n".join(code_lines)) + "</code></pre>")
                code_lines = None
            else:
                code_lines.append(line)
        elif line.startswith("```"):
            end_blocks()
            code_lines = []
        elif line.startswith("# "):
            if title is not None:
                raise ValueError("Markdown page has more than one h1")
            end_blocks()
            title = line[2:].strip()
            content.append('<section class="docs-hero"><h1>' + inline(title, link) + "</h1>")
            section_open = True
        elif match := re.match(r"^(#{2,4}) (.+)$", line):
            end_blocks()
            level, heading = len(match[1]), match[2].strip()
            heading_id = anchor(heading)
            if heading_id in ids:
                raise ValueError(f"Duplicate heading anchor: {heading_id}")
            ids.add(heading_id)
            if level == 2:
                if section_open:
                    content.append("</section>")
                content.append(f'<section id="{heading_id}">')
                section_open = True
                toc.append((heading_id, heading))
                content.append(f"<h2>{inline(heading, link)}</h2>")
            else:
                content.append(f'<h{level} id="{heading_id}">{inline(heading, link)}</h{level}>')
        elif line.startswith("|"):
            flush_paragraph()
            end_list()
            table_lines.append(line)
        elif not line.strip():
            end_blocks()
        elif match := re.match(r"^([-*]|([0-9]+)\.) (.+)$", line):
            flush_paragraph()
            flush_table()
            kind = "ol" if match[2] else "ul"
            if kind != list_kind:
                end_list()
                start = int(match[2]) if match[2] else 1
                content.append(f'<ol start="{start}">' if kind == "ol" and start != 1 else f"<{kind}>")
                list_kind = kind
            content.append("<li>" + inline(match[3], link) + "</li>")
        elif re.match(r"^(\s+\S|>)", line):
            raise ValueError(
                "Markdown uses an unsupported block; extend and test the renderer before publishing"
            )
        else:
            end_list()
            flush_table()
            paragraph_lines.append(line.strip())
    end_blocks()
    if code_lines is not None or title is None:
        raise ValueError("Incomplete Markdown page")
    content.append("</section>")
    return Document(title, "".join(content), toc)
