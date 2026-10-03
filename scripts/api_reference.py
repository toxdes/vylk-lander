"""Render our OpenAPI contract into the lander's existing static reading layout.

This intentionally renders documentation, not a live API console. The OpenAPI
download remains available for SDK generation and other reference viewers.
The guide uses paragraphs, headings, flat lists, fenced code, links and inline code;
unsupported Markdown blocks fail the build instead of silently losing content.
"""

import json
import re
from html import escape

METHODS = {"get", "post", "patch", "delete", "put", "head", "options"}


def resolve(spec, value):
    if "$ref" not in value:
        return value
    ref = value["$ref"]
    if not ref.startswith("#/"):
        raise ValueError(f"Only local OpenAPI references are supported: {ref}")
    target = spec
    for part in ref[2:].split("/"):
        target = target[part.replace("~1", "/").replace("~0", "~")]
    return {**target, **{key: item for key, item in value.items() if key != "$ref"}}


def validate_specification(spec):
    if spec.get("openapi") != "3.1.0" or not spec.get("paths"):
        raise ValueError("Expected a nonempty OpenAPI 3.1.0 specification")
    ids = set()
    tags = {tag["name"] for tag in spec["tags"]}
    for path, item in spec["paths"].items():
        if not path.startswith("/api/"):
            raise ValueError(f"Unexpected API path: {path}")
        for method, operation in item.items():
            if method not in METHODS:
                raise ValueError(f"Unsupported path-item field: {method}")
            name = operation["operationId"]
            if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]*", name) or name in ids:
                raise ValueError(f"Invalid/duplicate operation ID: {name}")
            ids.add(name)
            if not operation.get("tags") or operation["tags"][0] not in tags:
                raise ValueError(
                    f"Operation has no declared documentation group: {name}"
                )
            if not operation.get("summary") or not operation.get("responses"):
                raise ValueError(f"Incomplete operation: {name}")

    def visit(value):
        if isinstance(value, dict):
            if "$ref" in value:
                resolve(spec, value)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(spec)


def paragraph(text):
    return f"<p>{escape(text)}</p>" if text else ""


def table(headers, rows):
    if not rows:
        return paragraph("None.")
    head = "".join(f'<th scope="col">{escape(label)}</th>' for label in headers)
    body = "".join(
        "<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>" for row in rows
    )
    return f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


def schema_label(schema):
    if "$ref" in schema:
        name = schema["$ref"].rsplit("/", 1)[1]
        return f'<a href="index.html#schema-{escape(name)}">{escape(name)}</a>'
    variants = schema.get("oneOf", schema.get("anyOf", schema.get("allOf")))
    if variants:
        joiner = " + " if "allOf" in schema else " or "
        return joiner.join(schema_label(item) for item in variants)
    kind = schema.get("type", "any")
    if kind == "array":
        return "array of " + schema_label(schema["items"])
    return escape(" / ".join(kind) if isinstance(kind, list) else kind)


def constraints(schema):
    values = [schema.get("description", "")]
    for field in (
        "enum",
        "const",
        "default",
        "format",
        "pattern",
        "minimum",
        "maximum",
        "minLength",
        "maxLength",
        "minItems",
        "maxItems",
        "maxProperties",
    ):
        if field in schema:
            values.append(f"{field}: {json.dumps(schema[field], ensure_ascii=False)}")
    return " ".join(filter(None, values))


def schema_fields(spec, schema):
    value = resolve(spec, schema)
    properties = dict(value.get("properties", {}))
    required = set(value.get("required", []))
    for part in value.get("allOf", []):
        nested, names = schema_fields(spec, part)
        properties.update(nested)
        required.update(names)
    return properties, required


def schema_content(spec, schema):
    value = resolve(spec, schema)
    content = paragraph(value.get("description", ""))
    properties, required = schema_fields(spec, value)
    if properties:
        rows = []
        for name, field in properties.items():
            resolved = resolve(spec, field)
            rows.append(
                [
                    f"<code>{escape(name)}</code>",
                    schema_label(field),
                    "Yes" if name in required else "No",
                    escape(constraints(resolved)),
                ]
            )
        content += table(["Field", "Type", "Required", "Details"], rows)
    elif any(key in value for key in ("oneOf", "anyOf", "allOf")):
        content += (
            paragraph("Variants:")
            + "<ul>"
            + "".join(
                f"<li>{schema_label(item)}</li>"
                for item in value.get(
                    "oneOf", value.get("anyOf", value.get("allOf", []))
                )
            )
            + "</ul>"
        )
    else:
        content += paragraph(constraints(value)) + f"<p>Type: {schema_label(value)}</p>"
    if (
        value.get("additionalProperties") is False
        or value.get("unevaluatedProperties") is False
    ):
        content += paragraph("Unknown fields are rejected.")
    elif isinstance(value.get("additionalProperties"), dict):
        content += (
            f"<p>Additional values: {schema_label(value['additionalProperties'])}</p>"
        )
    return content


def parameter_rows(spec, parameters, location):
    rows = []
    for parameter in parameters:
        value = resolve(spec, parameter)
        if value["in"] == location:
            schema = resolve(spec, value["schema"])
            rows.append(
                [
                    f"<code>{escape(value['name'])}</code>",
                    schema_label(value["schema"]),
                    "Yes" if value.get("required") else "No",
                    escape(value.get("description", "") + " " + constraints(schema)),
                ]
            )
    return rows


def media_content(spec, content, expand_references=True):
    result = ""
    for media, value in content.items():
        result += f"<p>Content-Type: <code>{escape(media)}</code></p>"
        if "schema" in value:
            result += f"<p>Schema: {schema_label(value['schema'])}</p>"
            if expand_references or "$ref" not in value["schema"]:
                result += schema_content(spec, value["schema"])
        if "example" in value:
            example = value["example"]
            text = (
                example if isinstance(example, str) else json.dumps(example, indent=2)
            )
            result += f"<pre><code>{escape(text)}</code></pre>"
    return result


def operation_content(spec, path, method, operation):
    parameters = operation.get("parameters", [])
    result = f'<section id="{operation["operationId"]}" class="api-operation"><h2>{escape(operation["summary"])}</h2><p class="api-route"><code>{method.upper()} {escape(path)}</code></p>'
    result += paragraph(operation.get("description", ""))
    result += "<h3>Request headers</h3>"
    security = operation.get("security", spec.get("security", []))
    rows = parameter_rows(spec, parameters, "header")
    if security:
        rows.insert(
            0,
            [
                "<code>Cookie</code>",
                "string",
                "Yes",
                "session=&lt;token&gt;; use a persistent cookie jar.",
            ],
        )
    if "requestBody" in operation:
        rows.append(["<code>Content-Type</code>", "string", "Yes", "application/json"])
    result += table(["Header", "Type", "Required", "Details"], rows)
    result += "<h3>Path parameters</h3>" + table(
        ["Parameter", "Type", "Required", "Details"],
        parameter_rows(spec, parameters, "path"),
    )
    result += "<h3>Query parameters</h3>" + table(
        ["Parameter", "Type", "Required", "Details"],
        parameter_rows(spec, parameters, "query"),
    )
    result += "<h3>Request body</h3>"
    result += (
        media_content(spec, operation["requestBody"]["content"])
        if "requestBody" in operation
        else paragraph("None.")
    )
    result += "<h3>Response headers</h3>" + paragraph(
        "Content-Type is shown with each response below; 204 has no body. Any authenticated response may renew the session cookie. Infrastructure may add transport/security headers."
    )
    rows = []
    for status, response in operation["responses"].items():
        for name, header in resolve(spec, response).get("headers", {}).items():
            value = resolve(spec, header)
            rows.append(
                [
                    f"<code>{escape(name)}</code>",
                    escape(status),
                    escape(
                        value.get("description", "")
                        + " "
                        + constraints(value.get("schema", {}))
                    ),
                ]
            )
    result += (
        table(["Header", "Status", "Details"], rows)
        if rows
        else paragraph("No additional documented response headers.")
    )
    result += "<h3>Responses</h3>"
    for status, response in operation["responses"].items():
        value = resolve(spec, response)
        result += f"<details><summary><code>{escape(status)}</code> {escape(value['description'])}</summary>{media_content(spec, value.get('content', {}), expand_references=False)}</details>"
    return result + "</section>"


def page(template, title, content, toc, version, preview, current="page"):
    values = {
        "TITLE": escape(title),
        "CONTENT": content,
        "TOC": toc,
        "VERSION": escape(version),
        "PREVIEW": " · Local preview" if preview else "",
        "CURRENT": current,
    }
    for key, value in values.items():
        template = template.replace("{{" + key + "}}", value)
    if re.search(r"\{\{[A-Z]+\}\}", template):
        raise ValueError("Unresolved API template placeholder")
    return template


def render_reference(spec, template, preview=False):
    toc = '<a href="#top">Overview</a><a href="client-protocol.html">Client protocol guide</a>'
    content = '<section class="docs-hero"><h1>API reference</h1><p>Build a client for your own VYLK instance. Read the <a href="client-protocol.html">client protocol guide</a> for authentication, offline sync, and encryption.</p><p><a href="openapi.json" download>Download OpenAPI specification</a></p></section>'
    for tag in spec["tags"]:
        toc += f"<p>{escape(tag['name'])}</p>"
        for path, item in spec["paths"].items():
            for method, operation in item.items():
                if operation["tags"][0] == tag["name"]:
                    toc += f'<a href="#{operation["operationId"]}">{escape(operation["summary"])}</a>'
                    content += operation_content(spec, path, method, operation)
    toc += '<p>Schemas</p><a href="#schemas">Wire models</a>'
    content += '<section id="schemas"><h2>Wire models</h2>'
    for name, schema in spec["components"]["schemas"].items():
        content += f'<details id="schema-{escape(name)}"><summary>{escape(name)}</summary>{schema_content(spec, schema)}</details>'
    content += "</section>"
    return page(
        template, "API reference", content, toc, spec["info"]["version"], preview
    )


def inline(text):
    # Escape all source HTML; documentation links can never become script URLs.
    tokens = re.split(r"(`[^`]+`|\[[^\]]+\]\([^)]+\))", text)
    result = ""
    for token in tokens:
        if token.startswith("`") and token.endswith("`"):
            result += f"<code>{escape(token[1:-1])}</code>"
        elif match := re.fullmatch(r"\[([^\]]+)\]\(([^)]+)\)", token):
            label, url = match.groups()
            if not (
                url.startswith(("https://", "http://", "#"))
                or re.fullmatch(r"[A-Za-z0-9_./-]+", url)
            ):
                raise ValueError("Unsafe documentation link")
            result += f'<a href="{escape(url, quote=True)}">{escape(label)}</a>'
        else:
            result += escape(token)
    return result


def render_guide(guide, spec, template, preview=False):
    content, toc, paragraph_lines = [], [], []
    section_open = False
    code_lines = None
    list_kind = None
    heading_ids = set()

    def flush():
        if paragraph_lines:
            content.append("<p>" + inline(" ".join(paragraph_lines)) + "</p>")
            paragraph_lines.clear()

    def end_list():
        nonlocal list_kind
        if list_kind:
            content.append(f"</{list_kind}>")
            list_kind = None

    for line in guide.splitlines():
        if line.startswith("```"):
            flush()
            end_list()
            if code_lines is None:
                code_lines = []
            else:
                content.append(
                    "<pre><code>" + escape("\n".join(code_lines)) + "</code></pre>"
                )
                code_lines = None
        elif code_lines is not None:
            code_lines.append(line)
        elif line.startswith("# "):
            flush()
            end_list()
            content.append(
                '<section class="docs-hero"><h1>' + inline(line[2:]) + "</h1>"
            )
            section_open = True
        elif match := re.match(r"^(#{2,4}) (.+)$", line):
            flush()
            end_list()
            level, text = len(match[1]), match[2]
            anchor = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
            if anchor in heading_ids:
                raise ValueError("Duplicate guide heading")
            heading_ids.add(anchor)
            if level == 2:
                if section_open:
                    content.append("</section>")
                content.append(f'<section id="{anchor}">')
                section_open = True
                toc.append(f'<a href="#{anchor}">{escape(text)}</a>')
            content.append(f"<h{level}>{inline(text)}</h{level}>")
        elif not line.strip():
            flush()
            end_list()
        elif match := re.match(r"^([-*]|[0-9]+\.) (.+)$", line):
            flush()
            kind = "ul" if match[1] in ("-", "*") else "ol"
            if kind != list_kind:
                end_list()
                content.append(f"<{kind}>")
                list_kind = kind
            content.append("<li>" + inline(match[2]) + "</li>")
        elif re.match(r"^(\s{4}|>|\|)", line):
            raise ValueError(
                "Guide uses an unsupported Markdown block; extend and test the renderer before publishing"
            )
        else:
            end_list()
            paragraph_lines.append(line.strip())
    flush()
    end_list()
    if code_lines is not None or not section_open:
        raise ValueError("Incomplete Markdown guide")
    content.append("</section>")
    return page(
        template,
        "Client protocol guide",
        "".join(content),
        '<a href="index.html">API reference</a>' + "".join(toc),
        spec["info"]["version"],
        preview,
        current="location",
    )
