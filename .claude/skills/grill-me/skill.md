---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

## Pacing

Ask exactly ONE question per message. Never batch multiple questions together — each question deserves a focused answer before moving to the next. Wait for the user's response before asking the next question.

If a question can be answered by exploring the codebase, explore the codebase instead.

## Saving the grill session transcript

When saving the grill session to `docs/grill-sessions/`, write a rich transcript — not just terse decisions. Each question must include the question itself, the alternatives considered with pros/cons, and the decision with reasoning.

Read `references/transcript-format.md` for the full format, structure, and examples before writing the transcript.
