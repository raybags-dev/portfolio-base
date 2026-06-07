"""The self-healing crawl, expressed as an agent workflow.

observe (fetch + parse) → reason → plan → execute (extract; heal broken
selectors; re-extract) → validate → report. Reuses the agent orchestrator so
crawling gets retries, staged logging, and reporting for free.
"""

from __future__ import annotations

import copy
from typing import Any

from app.core.logging import get_logger
from app.modules.agents.base import AgentWorkflow, StepResult, WorkflowContext
from app.modules.agents.registry import register_workflow
from app.modules.crawlers.dom import parse_html
from app.modules.crawlers.extract import extract_field, parse_fields, value_is_valid
from app.modules.crawlers.fetch import Fetcher, HttpxFetcher
from app.modules.crawlers.healing import heal_field

log = get_logger("crawlers.workflow")


@register_workflow("crawl")
class CrawlWorkflow(AgentWorkflow):
    name = "Self-Healing Crawl"
    max_attempts = 2  # extract, then one healed retry

    async def observe(self, ctx: WorkflowContext) -> None:
        url = ctx.input["url"]
        fetcher: Fetcher = ctx.input.get("_fetcher") or HttpxFetcher()
        html = await fetcher.fetch(url)
        ctx.observations["root"] = parse_html(html)
        ctx.observations["config"] = copy.deepcopy(ctx.input.get("config", {}))
        ctx.observations["healing_events"] = []

    async def reason(self, ctx: WorkflowContext) -> None:
        fields = parse_fields(ctx.observations["config"])
        ctx.reasoning = f"Extract {len(fields)} field(s); heal any broken selectors."

    async def plan(self, ctx: WorkflowContext) -> None:
        ctx.plan = ["extract", "heal", "verify"]

    async def execute(self, ctx: WorkflowContext) -> None:
        root = ctx.observations["root"]
        config = ctx.observations["config"]
        fields = parse_fields(config)
        record: dict[str, Any] = {}
        ctx.results = []

        for spec in fields:
            value = extract_field(root, spec)
            healed = False

            if not value_is_valid(value, spec.hint):
                result = await heal_field(root, spec, provider=self.provider)
                if result is not None:
                    # Apply the recovered selector to the live config.
                    config["fields"][spec.name]["selector"] = result.new_selector
                    value = result.value
                    healed = True
                    event = {
                        "field": result.field,
                        "old_selector": result.old_selector,
                        "new_selector": result.new_selector,
                        "strategy": result.strategy,
                        "candidates_considered": result.candidates_considered,
                    }
                    ctx.observations["healing_events"].append(event)
                    ctx.log("execute", f"healed selector for '{spec.name}'", healing_event=event)
                    log.info("crawler.healed", field=spec.name, strategy=result.strategy)

            ok = value_is_valid(value, spec.hint) or (not spec.required and value is None)
            record[spec.name] = value
            ctx.results.append(
                StepResult(name=spec.name, ok=ok, output={"value": value, "healed": healed})
            )

        ctx.outputs["record"] = record
        ctx.outputs["healing_events"] = ctx.observations["healing_events"]
        ctx.outputs["updated_config"] = config

    async def validate(self, ctx: WorkflowContext) -> bool:
        return bool(ctx.results) and all(r.ok for r in ctx.results)

    async def report(self, ctx: WorkflowContext) -> dict[str, Any]:
        base = await super().report(ctx)
        base.update(
            {
                "record": ctx.outputs.get("record", {}),
                "healing_events": ctx.outputs.get("healing_events", []),
                "healed": bool(ctx.outputs.get("healing_events")),
                "updated_config": ctx.outputs.get("updated_config", {}),
            }
        )
        return base
