"""Field extraction + validation against hints.

A job's selector config looks like:

    {
      "fields": {
        "title": {"selector": {"tag": "h1"}, "hint": {"regex": ".+"}, "required": true},
        "price": {"selector": {"tag": "span", "class": "price"},
                  "hint": {"regex": "[0-9]"}, "required": true}
      }
    }

`hint` is what makes self-healing possible: it describes what a *valid* value
looks like, independent of the selector, so a recovered selector can be
verified objectively.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.modules.crawlers.dom import Node, select_first


@dataclass
class FieldSpec:
    name: str
    selector: dict[str, Any]
    hint: dict[str, Any]
    required: bool = True

    @classmethod
    def from_config(cls, name: str, cfg: dict[str, Any]) -> FieldSpec:
        return cls(
            name=name,
            selector=cfg.get("selector", {}),
            hint=cfg.get("hint", {}),
            required=cfg.get("required", True),
        )


def value_is_valid(value: str | None, hint: dict[str, Any]) -> bool:
    if value is None or value == "":
        return False
    if (rx := hint.get("regex")) and not re.search(rx, value):
        return False
    if (sub := hint.get("contains")) and sub.lower() not in value.lower():
        return False
    if (mn := hint.get("min_len")) and len(value) < int(mn):
        return False
    return True


def extract_field(root: Node, spec: FieldSpec) -> str | None:
    if not spec.selector:
        return None
    node = select_first(root, spec.selector)
    return node.text if node else None


def parse_fields(config: dict[str, Any]) -> list[FieldSpec]:
    fields = (config or {}).get("fields", {})
    return [FieldSpec.from_config(name, cfg) for name, cfg in fields.items()]
