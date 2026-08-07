---
name: deep-research
description: Deep internet research - orchestrate parallel sub-agents across partitioned questions, verify every claim against real sources, grade evidence, and synthesize one ranked, citable report. Use for competitive analysis, capability maps, frontier surveys, landscape reviews, or any question that needs breadth AND depth ("what can X do vs Y", "what is the state of the art").
stack: web
---

# Deep Research

The heavyweight research method for questions too big for one pass: competitive analysis, tool/harness capability maps, "what can X do that Y cannot" surveys, landscape reviews, and state-of-the-art deep dives. It layers parallel sub-agent orchestration on top of `web-research` (which covers single-agent search → extract → verify → cite). Use this skill when the deliverable is a multi-source, evidence-graded report, not a single answered question.

## When to Use

- "Deep research on X and Y" / "compare every Z" / "what can't we do that others can" / "state of the art in ..."
- Capability inventories, competitive gap analyses, frontier deep-dives, tool comparison matrices.
- Any task where one agent's context cannot hold all the sources and the answer needs breadth across many tools/papers/pages.
- NOT for: a single factual question (use `web-research`), pure local coding, or when the answer is already in the repo (grep first).

## Procedure

### 1. Scope and partition (the parent's job)

- Write the research objective as an explicit question with a required deliverable format (report file path, table columns, citation style).
- Partition into independent workstreams, each with an **exact brief**: input paths/URLs, the 5-8 questions to answer per item, where to write results. Partition by *subject* (per tool, per area), not by *activity*.
- Spawn sub-agents in parallel (`subagent` tool, one per workstream) with `notes` covering constraints: no fabrication, cite URLs inline, mark unverifiable items with `?`, exact output file path, do-not-touch paths.

### 2. Each sub-agent: search → extract → verify (see `web-research`)

- `web_search` first (free cascade), `web_extract` only on concrete URLs the search returned. Official docs and GitHub READMEs before blogs.
- Every claim carries a cited URL actually extracted. Snippets are not proof.
- Record every source actually read (see the `literature` tool: add with grade A-D + evidence note, dedupe by DOI/URL).

### 3. Integrate (the parent's job — never trust reports blindly)

- When each sub-agent's report lands, **verify its claims**: check it wrote the promised file, that cited URLs exist, and that `budgetExhausted` is not true (a budget-cut report is partial, say so).
- Cross-check contradictions between workstreams yourself with a targeted `web_search` before asserting either side.
- Grade evidence per claim: **A** peer-reviewed/replicated, **B** single strong source, **C** preprint/secondary, **D** unverified (mark it).

### 4. Synthesize one ranked deliverable

- Merge workstreams into a single report: comparison tables (rows = capabilities, columns = subjects, cells = Yes/Partial/No/?), a ranked gap/insight list, and a source list.
- Lead with the verdict; put evidence in tables; cite URLs inline per claim.
- For gap analyses end with a prioritized action list (impact × effort), not a bare inventory.

### 5. Redaction / honesty checklist

- No invented URLs, results, metrics, or files. Every number traces to a source you or a sub-agent actually extracted.
- Unverifiable claims labeled `unverified` or graded D, never dressed as fact.
- Report files land in a research directory and are named clearly (`<topic>-analysis.md`, `<topic>-capability-map.md`, `<topic>-gap-analysis.md`).

## Pitfalls

- **Overlapping workstreams** waste budget: make partitions mutually exclusive by subject and say so in each brief.
- **Trusting a sub-agent's summary**: always check the report file landed, the claims have real URLs, and budget wasn't exhausted.
- **Merging without reconciling**: when two workstreams disagree, re-verify yourself instead of picking the louder claim.
- **Breadth without depth**: a table of 15 tools where 3 were actually researched is worse than 6 fully researched ones; mark unknown cells `?` instead of guessing.
- **Fabricated polish**: a "citation" that looks right but was never opened destroys the whole report's credibility.

## Verification

- Every workstream report exists on disk and its cited URLs resolve.
- Each load-bearing claim is graded and traceable to an extracted page.
- The final report is one file with tables + ranked insights + sources, and no cell claims more than the evidence supports.
