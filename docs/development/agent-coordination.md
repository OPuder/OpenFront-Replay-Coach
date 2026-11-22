# Agent collaboration and free tooling

This document defines specialist work roles for humans and AI assistants collaborating on the repository. These are reusable role instructions, not claims that autonomous GitHub agents have been installed or enabled.

## Cost policy

Use existing repository access, ChatGPT capabilities, GitHub pull requests and GitHub Actions first. Keep new dependencies open-source and avoid external AI API keys or paid agent subscriptions unless explicitly approved.

GitHub Actions usage is subject to the repository/account's available quota and platform limits. A workflow being present does not guarantee unlimited free execution.

## Specialist roles

### Replay engine and data integrity

Own replay ingestion, format compatibility, engine pinning, state reconstruction, event timelines and large/malformed replay handling.

Acceptance criteria:
- Existing supported replay fixtures remain compatible.
- Unsupported or incomplete data is reported rather than silently fabricated.
- State reconstruction is deterministic for a fixed engine and replay.
- Memory/time behavior is bounded for large inputs.
- Regression tests cover the failure mode.

### Coaching intelligence

Own Early/Mid/Late decision evaluation, mechanics-aware alternatives, evidence, confidence, match scoring and longitudinal player development.

Acceptance criteria:
- Each insight has decision, context, consequence, alternative and lesson.
- Scores expose their inputs and avoid biased aggregation.
- A missing metric does not become a zero or fabricated fact.
- Longitudinal comparisons use comparable cohorts and distinguish recurring patterns from isolated matches.
- Tests cover edge cases and evidence quality.

### UX and platform experience

Own dashboard, Match Coach, replay map/timeline, coaching cards, responsive layouts, accessibility and desktop/Android/browser integration. The web build remains browser-accessible; do not reintroduce a PWA service worker into native release packages.

Acceptance criteria:
- Coaching priorities are understandable within seconds.
- Map/timeline interactions remain synchronized.
- Empty, loading, partial and error states are useful.
- Desktop and mobile layouts are both checked.
- Platform-specific behavior is validated on the target workflow where possible.

### Reliability and performance

Own crash reproduction, idle lifecycle, background work, persistence, import queues, update/install behavior and resource usage.

Acceptance criteria:
- Failures have a reproducible test or captured diagnostic.
- Work can resume safely after interruption.
- Retries and waits have explicit bounds.
- Update integrity checks remain strict.
- No duplicate analysis or repeated full-history processing is introduced.

### QA and release review

Independently review changed behavior, tests, workflows, artifacts and release notes.

Acceptance criteria:
- Review the exact PR head SHA.
- Check focused tests plus relevant full regression gates.
- Inspect failed workflow logs rather than relying on status labels alone.
- Verify Windows installer, portable build and signed Android APK artifacts before release.
- Do not publish a release with missing, empty or unverified deliverables.

## Coordination protocol

1. Start from current `main`; inspect open PRs and active workflows to avoid duplicate work.
2. Split work by bounded responsibility and shared interfaces.
3. Avoid concurrent edits to the same files unless one owner coordinates the change.
4. Communicate contracts and changed file paths in the PR description.
5. Rebase or update against current `main` before final validation.
6. Require exact-head checks before merge.
7. Verify the merged commit and release artifacts afterward.

## What requires account authorization

Repository files and workflows can be prepared in code, but installing GitHub Apps, enabling Copilot features, granting organization permissions, authorizing Codex or supplying external API credentials must be done through the relevant account UI by an authorized user. Do not create workflows that pretend these permissions exist.
