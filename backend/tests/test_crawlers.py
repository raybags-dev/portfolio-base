"""Self-healing crawler tests — fully offline (stdlib DOM + static fetcher)."""

import pytest

from app.modules.crawlers.dom import parse_html, select_first
from app.modules.crawlers.extract import FieldSpec, extract_field, value_is_valid
from app.modules.crawlers.fetch import StaticFetcher
from app.modules.crawlers.healing import heal_field
from app.modules.crawlers.service import run_adhoc

# Original page the crawler was configured against.
HTML_V1 = """
<html><body>
  <h1 class="title">Cool Product</h1>
  <div class="box"><span class="price">€ 19,99</span></div>
</body></html>
"""

# Site changed: price class renamed price -> amount, wrapper changed.
HTML_V2 = """
<html><body>
  <header><h1 class="title">Cool Product</h1></header>
  <section><div><span class="amount" id="pp">€ 24,50</span></div></section>
</body></html>
"""

CONFIG = {
    "fields": {
        "title": {"selector": {"tag": "h1"}, "hint": {"regex": ".+"}, "required": True},
        "price": {
            "selector": {"tag": "span", "class": "price"},
            "hint": {"regex": "[0-9]"},
            "required": True,
        },
    }
}


def test_dom_parse_and_select():
    root = parse_html(HTML_V1)
    node = select_first(root, {"tag": "span", "class": "price"})
    assert node is not None
    assert "19,99" in node.text


def test_extract_and_validate():
    root = parse_html(HTML_V1)
    spec = FieldSpec.from_config("price", CONFIG["fields"]["price"])
    value = extract_field(root, spec)
    assert value_is_valid(value, spec.hint)


async def test_heal_finds_new_selector_when_html_changes():
    root = parse_html(HTML_V2)
    spec = FieldSpec.from_config("price", CONFIG["fields"]["price"])
    # old selector no longer matches
    assert extract_field(root, spec) is None

    result = await heal_field(root, spec)
    assert result is not None
    assert "24,50" in result.value
    # recovered a selector that actually re-extracts a valid value
    healed_node = select_first(root, result.new_selector)
    assert healed_node is not None and value_is_valid(healed_node.text, spec.hint)


async def test_adhoc_crawl_self_heals_end_to_end():
    fetcher = StaticFetcher({"http://shop/p1": HTML_V2})
    report = await run_adhoc("http://shop/p1", CONFIG, fetcher=fetcher)
    assert report["validated"] is True
    assert report["healed"] is True
    assert "24,50" in report["record"]["price"]
    assert report["record"]["title"] == "Cool Product"
    # the crawler rewrote its own price selector
    assert report["updated_config"]["fields"]["price"]["selector"] != \
        CONFIG["fields"]["price"]["selector"]


async def test_no_heal_needed_when_selectors_match():
    fetcher = StaticFetcher({"http://shop/p1": HTML_V1})
    report = await run_adhoc("http://shop/p1", CONFIG, fetcher=fetcher)
    assert report["validated"] is True
    assert report["healed"] is False


@pytest.mark.parametrize(
    "value,hint,expected",
    [
        ("€ 19,99", {"regex": "[0-9]"}, True),
        ("no digits", {"regex": "[0-9]"}, False),
        ("", {"regex": ".+"}, False),
        (None, {}, False),
        ("hello world", {"contains": "WORLD"}, True),
    ],
)
def test_value_is_valid(value, hint, expected):
    assert value_is_valid(value, hint) is expected
