"""Render VYLK's OpenAPI specification as a static HTTP API reference.

Each operation gets request header, parameter, and body tables, a response
table with one row per error code, response header and body tables, and an
example request and response taken from the specification. The client protocol
guide is rendered by the shared Markdown renderer in docs_markdown.py.
"""

import json
import re
from html import escape

import docs_markdown
import docs_pages

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


BASE_URL = "http://localhost:8080"
STATUS_TEXT = {
    200: "OK", 204: "No Content", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 409: "Conflict", 423: "Locked", 426: "Upgrade Required", 429: "Too Many Requests",
    500: "Internal Server Error", 503: "Service Unavailable", 507: "Insufficient Storage",
}


def link(url):
    """Map links in spec descriptions to the published reference pages."""
    path, _, fragment = url.partition("#")
    if path == "client-protocol.md":
        return "client-protocol.html" + (f"#{fragment}" if fragment else "")
    return url


def text(value):
    return docs_markdown.inline(value, link) if value else ""


def paragraph(value):
    return f"<p>{text(value)}</p>" if value else ""


def table(headers, rows):
    head = "".join(f'<th scope="col">{escape(label)}</th>' for label in headers)
    body = "".join("<tr>" + "".join(f"<td>{cell}</td>" for cell in row) + "</tr>" for row in rows)
    return f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


def component(schema):
    ref = schema.get("$ref", "")
    return ref.rsplit("/", 1)[1] if ref.startswith("#/components/schemas/") else None


def is_object(spec, schema):
    value = resolve(spec, schema)
    return value.get("type") == "object" or any(key in value for key in ("oneOf", "anyOf", "allOf"))


def object_link(spec, name, objects):
    objects.add(name)
    title = spec["components"]["schemas"][name].get("title", name)
    return f'<a href="#object-{escape(name.lower())}">{escape(title)}</a>'


def literal(value):
    """A JSON value as a reader types it. Only the empty string keeps its quotes."""
    return value if isinstance(value, str) and value else json.dumps(value)


def type_label(spec, schema, objects):
    """Describe a field's type, linking named objects to the Objects section."""
    name = component(schema)
    if name and is_object(spec, schema):
        return object_link(spec, name, objects)
    value = resolve(spec, schema)
    if "const" in value:
        return f"<code>{escape(literal(value['const']))}</code>"
    variants = value.get("oneOf", value.get("anyOf"))
    if variants:
        return " or ".join(type_label(spec, item, objects) for item in variants)
    kind = value.get("type", "any")
    if kind == "array":
        items = value["items"]
        if not component(items) and resolve(spec, items).get("type") == "object":
            return "array of objects"
        return "array of " + type_label(spec, items, objects)
    if isinstance(kind, list):
        return " or ".join(escape(item) for item in kind)
    if value.get("format") == "date-time":
        return "string (date-time)"
    return escape(kind)


def details(spec, schema, objects):
    """Description followed by the constraints a client must respect."""
    value = resolve(spec, schema)
    parts = [text(schema.get("description") or value.get("description", ""))]
    if "enum" in value:
        parts.append("One of " + ", ".join(f"<code>{escape(literal(item))}</code>" for item in value["enum"]) + ".")
    if "default" in schema or "default" in value:
        parts.append(f"Default: <code>{escape(literal(schema.get('default', value.get('default'))))}</code>.")
    if "minimum" in value and "maximum" in value:
        parts.append(f"From {value['minimum']} to {value['maximum']}.")
    elif "minimum" in value:
        parts.append(f"At least {value['minimum']}.")
    # A component that describes its own format needs no pattern. A field that overrides the description does.
    if "pattern" in value and (not component(schema) or "description" in schema):
        parts.append(f"Pattern: <code>{escape(value['pattern'])}</code>.")
    additional = value.get("additionalProperties")
    if isinstance(additional, dict) and additional:
        parts.append("Each value is " + type_label(spec, additional, objects) + ".")
    return " ".join(part for part in parts if part)


def merged(spec, schema):
    value = resolve(spec, schema)
    properties, required = dict(value.get("properties", {})), set(value.get("required", []))
    for part in value.get("allOf", []):
        nested, names = merged(spec, part)
        properties.update(nested)
        required.update(names)
    return properties, required


def field_rows(spec, schema, objects, request, prefix=""):
    """Rows of Key, Value, Description. Inline objects are flattened with dotted keys."""
    properties, required = merged(spec, schema)
    rows = []
    for name, field in properties.items():
        key = prefix + name
        label = type_label(spec, field, objects)
        if request and name in required:
            label += ", required"
        rows.append([f"<code>{escape(key)}</code>", label, details(spec, field, objects)])
        value = resolve(spec, field) if not component(field) else {}
        if value.get("type") == "object" and value.get("properties"):
            rows += field_rows(spec, value, objects, request, key + ".")
        elif value.get("type") == "array" and not component(value["items"]) and resolve(spec, value["items"]).get("properties"):
            rows += field_rows(spec, value["items"], objects, request, key + "[].")
    return rows


def variants(spec, schema):
    value = resolve(spec, schema)
    return value.get("oneOf", value.get("anyOf", []))


def schema_content(spec, schema, objects, request):
    """Tables for a body schema. Variants get one labeled table each."""
    options = variants(spec, schema) if "allOf" not in resolve(spec, schema) else []
    if options:
        result = ""
        for option in options:
            value = resolve(spec, option)
            title = value.get("title", component(option) or "Variant")
            result += f'<p class="api-variant"><strong>{escape(title)}.</strong> {text(value.get("description", ""))}</p>'
            result += schema_content(spec, option, objects, request)
        return result
    value = resolve(spec, schema)
    if value.get("type") == "array":
        items = value["items"]
        if component(items) or not resolve(spec, items).get("properties"):
            return f"<p>An array of {type_label(spec, items, objects)}.</p>"
        return "<p>An array of objects.</p>" + table(["Key", "Value", "Description"], field_rows(spec, items, objects, request, "[]."))
    if isinstance(value.get("type"), list):
        return f"<p>{type_label(spec, value, objects)}.</p>"
    rows = field_rows(spec, value, objects, request)
    if not rows:
        return f"<p>{type_label(spec, value, objects)}.</p>"
    return table(["Key", "Value", "Description"], rows)


def parameter_rows(spec, parameters, location, objects):
    rows = []
    for parameter in parameters:
        value = resolve(spec, parameter)
        if value["in"] != location:
            continue
        schema = resolve(spec, value["schema"])
        label = type_label(spec, value["schema"], objects)
        if value.get("required"):
            label += ", required"
        rows.append([f"<code>{escape(value['name'])}</code>", label, details(spec, {**value["schema"], "description": value.get("description", "")}, objects)])
    return rows


def success(operation):
    return next((status, value) for status, value in operation["responses"].items() if status.startswith("2"))


def authenticated(spec, operation):
    return bool(operation.get("security", spec.get("security", [])))


def json_text(value):
    return json.dumps(value, indent=2, ensure_ascii=False)


def example_request(spec, path, method, operation):
    parameters = [resolve(spec, item) for item in operation.get("parameters", [])]
    for parameter in parameters:
        if parameter["in"] == "path":
            path = path.replace("{" + parameter["name"] + "}", str(parameter["example"]))
    query = "&".join(f"{item['name']}={item['example']}" for item in parameters if item["in"] == "query" and "example" in item)
    url = BASE_URL + path + (f"?{query}" if query else "")
    lines = [f"curl -X {method.upper()} '{url}'" if method != "get" else f"curl '{url}'"]
    if operation["operationId"] == "login":
        lines.append("-c cookies.txt")
    elif authenticated(spec, operation):
        lines.append("-b cookies.txt -c cookies.txt")
    for item in parameters:
        if item["in"] == "header" and "example" in item:
            lines.append(f"-H '{item['name']}: {item['example']}'")
    if "requestBody" in operation:
        example = operation["requestBody"]["content"]["application/json"]["example"]
        lines.append("-H 'Content-Type: application/json'")
        lines.append("-d '" + json_text(example).replace("'", "'\\''") + "'")
    return " \\\n\t".join(lines)


def example_response(spec, operation):
    status, response = success(operation)
    lines = [f"HTTP/1.1 {status} {STATUS_TEXT[int(status)]}"]
    content = response.get("content", {})
    for media in content:
        lines.append(f"Content-Type: {media}" + ("; charset=utf-8" if media == "application/json" else ""))
    for name, header in response.get("headers", {}).items():
        values = resolve(spec, header).get("example")
        for item in values if isinstance(values, list) else [values]:
            if item is not None:
                lines.append(f"{name}: {item}")
    result = "\n".join(lines)
    for value in content.values():
        example = value["example"]
        result += "\n\n" + (example if isinstance(example, str) else json_text(example))
    return result


def response_rows(spec, operation):
    rows = []
    for status, response in sorted(operation["responses"].items()):
        value = resolve(spec, response)
        examples = {}
        for media in value.get("content", {}).values():
            examples.update(media.get("examples", {}))
        if not examples:
            rows.append([f"<code>{escape(status)}</code>", "", text(value["description"])])
        for name, example in examples.items():
            code = example["value"].get("code", "")
            rows.append([f"<code>{escape(status)}</code>", f"<code>{escape(code)}</code>" if code else "", text(example["summary"])])
    return rows


def response_header_rows(spec, operation, objects):
    rows = []
    status, response = success(operation)
    for media in response.get("content", {}):
        rows.append(["<code>Content-Type</code>", f"<code>{escape(media)}</code>", "Media type of the body."])
    if authenticated(spec, operation):
        renewal = spec["components"]["headers"]["SetSession"]
        rows.append(["<code>Set-Cookie</code>", "string", text(renewal["description"])])
    for code, value in operation["responses"].items():
        for name, header in resolve(spec, value).get("headers", {}).items():
            header = resolve(spec, header)
            note = f"Sent with status {code}. " if code != status else ""
            rows.append([f"<code>{escape(name)}</code>", type_label(spec, header.get("schema", {}), objects), note + text(header.get("description", ""))])
    return rows


def operation_content(spec, path, method, operation, objects):
    parameters = operation.get("parameters", [])
    result = f'<section id="{escape(operation["operationId"])}" class="api-operation"><h3>{escape(operation["summary"])}</h3>'
    result += f'<p class="api-route"><code>{method.upper()} {escape(path)}</code></p>' + paragraph(operation.get("description", ""))
    headers = []
    if authenticated(spec, operation):
        headers.append(["<code>Cookie</code>", "string, required", "The <code>session</code> cookie from <code>POST /api/login</code>."])
    if "requestBody" in operation:
        headers.append(["<code>Content-Type</code>", "<code>application/json</code>, required", "Media type of the body."])
    headers += parameter_rows(spec, parameters, "header", objects)
    columns = ["Key", "Value", "Description"]
    if headers:
        result += "<h4>Request headers</h4>" + table(columns, headers)
    for location, title in (("path", "Path parameters"), ("query", "Query parameters")):
        rows = parameter_rows(spec, parameters, location, objects)
        if rows:
            result += f"<h4>{title}</h4>" + table(columns, rows)
    if "requestBody" in operation:
        result += "<h4>Request body</h4>" + schema_content(spec, operation["requestBody"]["content"]["application/json"]["schema"], objects, True)
    result += "<h4>Responses</h4>" + table(["Status", "Code", "Description"], response_rows(spec, operation))
    rows = response_header_rows(spec, operation, objects)
    if rows:
        result += "<h4>Response headers</h4>" + table(columns, rows)
    _, response = success(operation)
    content = response.get("content", {})
    if "application/json" in content:
        result += "<h4>Response body</h4>" + schema_content(spec, content["application/json"]["schema"], objects, False)
    result += f"<h4>Example request</h4><pre><code>{escape(example_request(spec, path, method, operation))}</code></pre>"
    result += f"<h4>Example response</h4><pre><code>{escape(example_response(spec, operation))}</code></pre>"
    return result + "</section>"


def objects_content(spec, objects):
    """Document every named object that a table links to, including objects those objects link to."""
    rendered, result = set(), ""
    while objects - rendered:
        for name in sorted(objects - rendered):
            rendered.add(name)
            schema = spec["components"]["schemas"][name]
            body = schema_content(spec, {"$ref": f"#/components/schemas/{name}"}, objects, False)
            result += f'<section id="object-{escape(name.lower())}" class="api-object"><h3>{escape(schema.get("title", name))}</h3>{paragraph(schema.get("description", ""))}{body}</section>'
    return result


def overview(spec, objects):
    scheme = spec["components"]["securitySchemes"]["session"]
    protocol = resolve(spec, spec["components"]["parameters"]["VaultProtocol"])
    error = spec["components"]["schemas"]["Error"]
    return (
        '<section id="overview"><h2>Overview</h2>'
        + paragraph(spec["info"]["description"])
        + "<h3>Authentication</h3>" + paragraph(scheme["description"])
        + "<h3>Encrypted vaults</h3>" + paragraph(f"Routes that read or write notes take the `{protocol['name']}` header. " + protocol["description"])
        + "<h3>Errors</h3>" + paragraph(error["description"])
        + table(["Key", "Value", "Description"], field_rows(spec, error, objects, False))
        + "</section>"
    )


def render_reference(spec, template, nav, preview=False):
    objects = set()
    sections = [("overview", "Overview", 1)]
    content = (
        f'<section class="docs-hero"><h1>{escape(docs_pages.API_REFERENCE_TITLE)}</h1>'
        f'<p>Every route of the vylk server, with its headers, parameters, body, responses, and an example. Read the <a href="client-protocol.html">client protocol guide</a> before you build offline sync or encryption.</p>'
        '<p><a href="openapi.json" download>Download the OpenAPI specification</a></p></section>'
    )
    content += overview(spec, objects)
    for tag in spec["tags"]:
        anchor = "group-" + docs_markdown.anchor(tag["name"])
        sections.append((anchor, tag["name"], 1))
        content += f'<section id="{anchor}" class="api-group"><h2>{escape(tag["name"])}</h2>{paragraph(tag.get("description", ""))}</section>'
        for path, item in spec["paths"].items():
            for method, operation in item.items():
                if operation["tags"][0] == tag["name"]:
                    sections.append((operation["operationId"], operation["summary"], 2))
                    content += operation_content(spec, path, method, operation, objects)
    body = objects_content(spec, objects)
    sections.append(("objects", "Objects", 1))
    content += '<section id="objects" class="api-group"><h2>Objects</h2><p>Objects that appear in the request and response tables above.</p></section>' + body
    toc = docs_pages.sidebar(nav, "api/index.html", sections)
    return page(template, docs_pages.API_REFERENCE_TITLE, content, toc, spec["info"]["version"], preview)


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


def render_guide(guide, spec, template, nav, preview=False):
    document = docs_markdown.render(guide)
    sections = [(anchor, text, 1) for anchor, text in document.toc]
    return page(
        template,
        document.title,
        document.content,
        docs_pages.sidebar(nav, "api/client-protocol.html", sections),
        spec["info"]["version"],
        preview,
        current="location",
    )
