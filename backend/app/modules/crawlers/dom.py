"""A tiny dependency-free DOM for selector matching.

Not a full CSS engine — it supports the selector spec the crawler uses:
``{"tag": "span", "class": "price", "id": "x", "attrs": {"data-test": "v"}}``.
Enough to extract fields and to drive self-healing, with zero third-party deps
so it runs anywhere (tests, CI, restricted hosts). Production can swap in
BeautifulSoup behind the same Extractor interface.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser

VOID_ELEMENTS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}


@dataclass
class Node:
    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    children: list[Node] = field(default_factory=list)
    parent: Node | None = None
    text_parts: list[str] = field(default_factory=list)

    @property
    def classes(self) -> list[str]:
        return (self.attrs.get("class") or "").split()

    @property
    def node_id(self) -> str | None:
        return self.attrs.get("id")

    @property
    def text(self) -> str:
        """Whitespace-collapsed text of this node and descendants."""
        parts: list[str] = []
        self._collect_text(parts)
        return " ".join(" ".join(parts).split())

    def _collect_text(self, acc: list[str]) -> None:
        for t in self.text_parts:
            if t.strip():
                acc.append(t.strip())
        for c in self.children:
            c._collect_text(acc)

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()


class _TreeBuilder(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = Node(tag="#root")
        self._stack: list[Node] = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag=tag, attrs={k: (v or "") for k, v in attrs})
        parent = self._stack[-1]
        node.parent = parent
        parent.children.append(node)
        if tag not in VOID_ELEMENTS:
            self._stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag=tag, attrs={k: (v or "") for k, v in attrs})
        node.parent = self._stack[-1]
        self._stack[-1].children.append(node)

    def handle_endtag(self, tag: str) -> None:
        # Pop back to the matching open tag (tolerant of unclosed tags).
        for i in range(len(self._stack) - 1, 0, -1):
            if self._stack[i].tag == tag:
                del self._stack[i:]
                return

    def handle_data(self, data: str) -> None:
        self._stack[-1].text_parts.append(data)


def parse_html(html: str) -> Node:
    builder = _TreeBuilder()
    builder.feed(html)
    return builder.root


def matches(node: Node, spec: dict) -> bool:
    if node.tag == "#root":
        return False
    if (tag := spec.get("tag")) and node.tag != tag:
        return False
    if (cls := spec.get("class")) and cls not in node.classes:
        return False
    if (nid := spec.get("id")) and node.node_id != nid:
        return False
    for k, v in (spec.get("attrs") or {}).items():
        if node.attrs.get(k) != v:
            return False
    return True


def select_first(root: Node, spec: dict) -> Node | None:
    for node in root.walk():
        if matches(node, spec):
            return node
    return None


def select_all(root: Node, spec: dict) -> list[Node]:
    return [n for n in root.walk() if matches(n, spec)]
