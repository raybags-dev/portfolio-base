"""Agentic AI orchestration module.

Implements the observe → reason → plan → execute → validate → retry → log →
report loop as a reusable engine. Works fully offline via a deterministic stub
LLM provider; upgrades to OpenAI automatically when a key is configured.
"""
