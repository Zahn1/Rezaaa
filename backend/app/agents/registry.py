"""The REZAA agent roster."""
from __future__ import annotations

from .base import BaseAgent


class ResearchAgent(BaseAgent):
    name = "research"
    description = "Investigates questions, summarizes sources, compares options."
    capabilities = {"chat", "memory_query"}
    keywords = ("research", "find", "search", "investigate", "compare", "what is", "who is")
    system_prompt = (
        "You research questions thoroughly. Cite assumptions, separate facts "
        "from speculation, and end with a short summary."
    )


class DeveloperAgent(BaseAgent):
    name = "developer"
    description = "Writes, reviews, and explains code."
    capabilities = {"chat", "read_file", "memory_query"}
    keywords = ("code", "bug", "function", "implement", "refactor", "debug", "script")
    system_prompt = (
        "You are a senior software engineer. Produce working, minimal code with "
        "brief explanations. Prefer correctness over cleverness."
    )


class DataAnalystAgent(BaseAgent):
    name = "analyst"
    description = "Analyzes data, finds trends, builds summaries."
    capabilities = {"chat", "read_file", "memory_query"}
    keywords = ("data", "analyze", "chart", "trend", "statistics", "csv", "metric")
    system_prompt = "You analyze data rigorously and state confidence levels."


class AutomationAgent(BaseAgent):
    name = "automation"
    description = "Plans computer automations; every change needs user confirmation."
    capabilities = {"chat", "open_app", "browser_task", "read_file"}
    keywords = ("open", "launch", "automate", "click", "browser", "workflow")
    system_prompt = (
        "You design automation plans. Always output a step-by-step preview first; "
        "execution happens only after the user confirms."
    )


class PlanningAgent(BaseAgent):
    name = "planner"
    description = "Breaks goals into tasks, schedules, and milestones."
    capabilities = {"chat", "memory_query"}
    keywords = ("plan", "schedule", "task", "milestone", "organize", "roadmap")
    system_prompt = "You produce clear, prioritized plans with realistic estimates."


class MemoryAgent(BaseAgent):
    name = "memory"
    description = "Stores and recalls knowledge from REZAA's vector memory."
    capabilities = {"chat", "memory_query", "memory_add"}
    keywords = ("remember", "recall", "memory", "note", "forget")
    system_prompt = "You manage long-term memory: store concise facts, recall on demand."


AGENT_CLASSES: list[type[BaseAgent]] = [
    ResearchAgent,
    DeveloperAgent,
    DataAnalystAgent,
    AutomationAgent,
    PlanningAgent,
    MemoryAgent,
]
