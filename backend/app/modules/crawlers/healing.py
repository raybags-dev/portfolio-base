"""Self-healing selector recovery.

When a field's selector stops matching (site HTML changed), we don't fail —
we search the new DOM for nodes whose *text* satisfies the field's hint
(which describes a valid value, not its location), derive a fresh, stable
selector for the best candidate, and verify it re-extracts a valid value.

An LLM (when available) ranks ambiguous candidates; otherwise a deterministic
heuristic does — so healing works fully offline.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.logging import get_logger
from app.modules.agents.llm import LLMProvider, StubProvider
from app.modules.crawlers.dom import Node, select_first
from app.modules.crawlers.extract import FieldSpec, value_is_valid

log = get_logger("crawlers.healing")


@dataclass
class HealResult:
    field: str
    old_selector: dict[str, Any]
    new_selector: dict[str, Any]
    value: str
    candidates_considered: int
    strategy: str  # "id" | "tag.class" | "tag" | "llm"


def _derive_selector(node: Node) -> tuple[dict[str, Any], str]:
    """Most-stable selector we can build for a node."""
    if node.node_id:
        return {"tag": node.tag, "id": node.node_id}, "id"
    if node.classes:
        return {"tag": node.tag, "class": node.classes[0]}, "tag.class"
    return {"tag": node.tag}, "tag"


def _candidate_nodes(root: Node, hint: dict[str, Any]) -> list[Node]:
    """Nodes whose own text validly matches the hint, most specific first.

    We prefer the *shortest* matching text so we pick the actual value element
    rather than a wrapping container (e.g. <span class=price> over <body>); and
    among equal-length texts we prefer the most-specific, leaf-most node (one
    with an id, then a class, then the fewest descendants) so we emit a stable
    selector rather than a bare wrapper tag.
    """

    def score(n: Node) -> tuple:
        return (
            len(n.text),
            0 if n.node_id else 1,
            0 if n.classes else 1,
            sum(1 for _ in n.walk()),  # leaf-most last
        )

    matches = [n for n in root.walk() if value_is_valid(n.text, hint)]
    matches.sort(key=score)
    return matches


async def heal_field(
    root: Node,
    spec: FieldSpec,
    *,
    provider: LLMProvider | None = None,
) -> HealResult | None:
    provider = provider or StubProvider()
    candidates = _candidate_nodes(root, spec.hint)
    if not candidates:
        log.info("heal.no_candidates", field=spec.name)
        return None

    # Build verified selector proposals from the top candidates.
    proposals: list[tuple[dict[str, Any], str, str]] = []  # (selector, strategy, value)
    for node in candidates[:8]:
        selector, strategy = _derive_selector(node)
        found = select_first(root, selector)
        if found is not None and value_is_valid(found.text, spec.hint):
            proposals.append((selector, strategy, found.text))

    if not proposals:
        return None

    chosen = proposals[0]  # heuristic best: shortest valid text, stable selector
    strategy = chosen[1]

    # Optional: let an LLM pick among proposals (falls back to the heuristic).
    if not isinstance(provider, StubProvider) and len(proposals) > 1:
        decision = await provider.propose_json(
            system="You repair web-scraper selectors. Pick the most robust one.",
            prompt=(
                f"Field '{spec.name}'. Candidate selectors and the values they "
                f"extract: {[(p[0], p[2]) for p in proposals]}. "
                "Return JSON {\"index\": <int>} choosing the best candidate."
            ),
            fallback={"index": 0},
        )
        idx = decision.get("index", 0)
        if isinstance(idx, int) and 0 <= idx < len(proposals):
            chosen = proposals[idx]
            strategy = "llm"

    return HealResult(
        field=spec.name,
        old_selector=spec.selector,
        new_selector=chosen[0],
        value=chosen[2],
        candidates_considered=len(candidates),
        strategy=strategy,
    )
