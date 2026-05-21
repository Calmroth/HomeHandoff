---
name: gsd:settings
description: Configure GSD workflow toggles and model profile
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
requires: [quick]
---

<objective>
Interactive configuration of GSD workflow agents and model profile via multi-question prompt.

Routes to the settings workflow which handles:
- Config existence ensuring
- Current settings reading and parsing
- Interactive 5-question prompt (model, research, plan_check, verifier, branching)
- Config merging and writing
- Confirmation display with quick command references
</objective>

<execution_context>
@C:/Users/chris_mm9nopi/OneDrive - IDfuel AB/PersonalProjects/design_handoff_home_control/.claude/get-shit-done/workflows/settings.md
</execution_context>

<process>
Execute end-to-end.
</process>
