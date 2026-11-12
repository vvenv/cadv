"""
Turn a firmware README into the web flasher's program page.

Covers what fw/*/README.md uses: headings, paragraphs, tables, lists,
`code`, **bold**, [links](…) and bare URLs. Left out of the web page:

    ```fenced blocks```            developer commands
    <!-- dev --> … <!-- /dev -->   anything else for developers (no close: to the end)
    the first # heading            the page title comes from fw/<id>/label

<!-- summary: … --> sets the one-line description in the program grid;
otherwise it is the first sentence of the first paragraph.
"""

import html
import re

REPO_BLOB = "https://github.com/vvenv/cadv/blob/main/"


def _strip(md: str) -> tuple[str, str | None]:
	# Markers count only on a line of their own, so docs can mention them in `code`.
	summary = None
	m = re.search(r"^[ \t]*<!--\s*summary:\s*(.*?)\s*-->[ \t]*$", md, re.M)
	if m:
		summary = m.group(1)
	md = re.sub(r"^[ \t]*<!--\s*summary:.*?-->[ \t]*\n?", "", md, flags=re.M)
	md = re.sub(r"^[ \t]*<!--\s*dev\s*-->[ \t]*$.*?(^[ \t]*<!--\s*/dev\s*-->[ \t]*$|\Z)", "", md, flags=re.S | re.M)
	md = re.sub(r"^```.*?^```[ \t]*$\n?", "", md, flags=re.S | re.M)
	md = re.sub(r"\A\s*# [^\n]*\n", "", md)
	return md, summary


def _inline(text: str, base: str) -> str:
	codes: list[str] = []

	def keep(s: str) -> str:
		codes.append(s)
		return f"\x00{len(codes) - 1}\x00"

	text = re.sub(r"(`+)\s?(.+?)\s?\1", lambda m: keep(f"<code>{html.escape(m.group(2))}</code>"), text)
	text = html.escape(text, quote=False)

	def link(m):
		label, href = m.group(1), html.unescape(m.group(2))
		if not re.match(r"[a-z]+:|#", href):
			href = REPO_BLOB + base + href
		return keep(f'<a href="{html.escape(href)}">{label}</a>')

	text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", link, text)
	text = re.sub(r"https?://[^\s<)）]+", lambda m: keep(f'<a href="{m.group(0)}">{m.group(0)}</a>'), text)
	text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
	return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], text)


def _cells(line: str) -> list[str]:
	line = line.strip()
	if line.startswith("|"):
		line = line[1:]
	if line.endswith("|"):
		line = line[:-1]
	# split on | that is not inside `code`
	out, cur, tick = [], "", False
	for ch in line:
		if ch == "`":
			tick = not tick
		if ch == "|" and not tick:
			out.append(cur.strip())
			cur = ""
		else:
			cur += ch
	out.append(cur.strip())
	return out


def _plain(text: str) -> str:
	text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
	return re.sub(r"\*\*|`", "", text).strip()


def render(md: str, base: str) -> tuple[str, str]:
	"""(summary text, body HTML). base is the README's directory in the repo, e.g. 'fw/clock/'."""
	md, summary = _strip(md)
	lines = md.splitlines()
	out: list[str] = []
	first_para = None
	i = 0
	while i < len(lines):
		line = lines[i]
		if not line.strip():
			i += 1
			continue
		h = re.match(r"(#{1,6})\s+(.*)", line)
		if h:
			level = min(len(h.group(1)) + 0, 4)
			level = max(level, 2)
			out.append(f"<h{level}>{_inline(h.group(2), base)}</h{level}>")
			i += 1
			continue
		if line.lstrip().startswith("|") and i + 1 < len(lines) and re.match(r"\s*\|?\s*:?-{2,}", lines[i + 1]):
			head = _cells(line)
			rows = []
			i += 2
			while i < len(lines) and lines[i].lstrip().startswith("|"):
				rows.append(_cells(lines[i]))
				i += 1
			t = ["<table><thead><tr>"]
			t += [f"<th>{_inline(c, base)}</th>" for c in head]
			t.append("</tr></thead><tbody>")
			for r in rows:
				t.append("<tr>" + "".join(f"<td>{_inline(c, base)}</td>" for c in r) + "</tr>")
			t.append("</tbody></table>")
			out.append("".join(t))
			continue
		lm = re.match(r"\s*([-*]|\d+\.)\s+", line)
		if lm:
			tag = "ol" if lm.group(1)[0].isdigit() else "ul"
			items: list[str] = []
			while i < len(lines) and lines[i].strip():
				m = re.match(r"\s*([-*]|\d+\.)\s+(.*)", lines[i])
				if m:
					items.append(m.group(2))
				elif items:
					items[-1] += "\n" + lines[i].strip()
				i += 1
			out.append(f"<{tag}>" + "".join(f"<li>{_inline(x.rstrip(), base)}</li>" for x in items) + f"</{tag}>")
			continue
		para = []
		while i < len(lines) and lines[i].strip() and not re.match(r"#{1,6}\s|\s*\|", lines[i]):
			para.append(lines[i])
			i += 1
		text = "\n".join(para)
		if first_para is None:
			first_para = text
		body = "<br>".join(_inline(p.rstrip(), base) for p in re.split(r" {2,}\n", text))
		out.append(f"<p>{body}</p>")
	if summary is None and first_para:
		plain = _plain(first_para).replace("\n", "")
		summary = re.split(r"(?<=[。！？])", plain, maxsplit=1)[0].rstrip("。")
	return summary or "", "\n".join(out)
