# Grill Session Transcript Format

Save transcripts to `docs/grill-sessions/<topic>-<date>.md`.

## Why rich transcripts matter

Grill sessions capture design decisions that shape the project for months. A terse "Decision: X" is useless when someone (including a future Claude session) needs to understand *why* X was chosen. The alternatives that were rejected and the reasoning behind the rejection are often more valuable than the decision itself — they prevent re-litigating settled questions and help identify when circumstances have changed enough to revisit a decision.

## Structure

Each question in the transcript should have three parts:

### 1. The question

State what's being decided and why it matters. Not just "URL structure?" but "Where should these pages live in the URL hierarchy, and how does that affect navigation, SEO, and future content?"

### 2. Considerations

List the alternatives that were discussed. For each one:
- Give it a label (Option A, Option B) and a short name
- Describe what it means concretely
- Note the pros and cons that came up in discussion

This section captures the thinking process, not just the outcome.

### 3. Decision

State which option was chosen and why. Connect the reasoning to the pros/cons above — "Option B because [pro] outweighs [con], and [specific concern] rules out Option A."

## Example

```markdown
## Q5: Article content authoring

**The question:** How do we actually produce the written content? Pure AI generation
from transcripts? Pure human writing? Some hybrid?

**Considerations:**
- **Option A (pure AI):** Fast but low quality. AI-generated articles from transcripts
  read like... AI-generated articles. They lack voice, miss nuance, and don't add value
  beyond the video.
- **Option B (pure human):** High quality but slow and expensive. For a solo dev +
  designer team, writing 3+ full articles is a significant time investment.
- **Option C (hybrid):** AI generates a first draft from the transcript, human
  substantially rewrites it. Gets 80% of the speed benefit while maintaining quality
  and voice.

**Decision:** Hybrid (option C). AI-generated first draft from YouTube transcript,
then substantially rewritten by human. Also fetch YouTube view counts and engagement
metrics to prioritize which videos become tutorials first.
```

## File header

Start each transcript with context about the session:

```markdown
# Grill Session: <Topic> — <Date>

Source: <where the plan/idea came from — Notion page, conversation, etc.>

<1-2 sentence summary of what we're trying to achieve and why>

---
```

## Numbering

Use sequential question numbers (`Q1`, `Q2`, ...) so decisions can be cross-referenced from plans, backlog items, and future sessions.
