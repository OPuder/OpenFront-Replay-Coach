# OpenFront Replay Coach — VS Code project instructions

Read `AGENTS.md`, `PROJECT_RULES.md`, and `PROJECT_CONTEXT.md` before making architectural changes. Use `docs/development/quality-gates.md` for the validation matrix.

## Product invariants
- Build an evidence-based gameplay coach, not a generic replay viewer or statistics dashboard.
- Every important coaching insight must identify the player's decision, situation, consequence, better alternative, and reusable lesson.
- Cover Early, Mid, and Late game. Prioritize the strongest 1–3 findings and state uncertainty honestly.
- Preserve exact historical engine matching, deterministic replay hashes, real simulation, player identity correctness, import idempotence, resumability, and failure isolation.
- Do not infer missing replay data or fabricate player, action, territory, or timing evidence.

## Engineering and performance
- Preserve existing working behavior and platform support. Prefer focused changes over rewrites.
- Profile before optimizing. Avoid repeated full-history scans, repeated decoding/simulation, unnecessary React state payloads, unbounded worker pools, and per-action allocations in hot loops.
- Cache only immutable, verifiable work. Cache keys must include every correctness-relevant input (replay content, exact engine revision, schema/mechanics version, and relevant analysis configuration).
- Keep analysis bounded and cancellable. Desktop parallelism must respect CPU and memory; mobile work must remain conservative.
- Never trade replay correctness, hash verification, persistence safety, update integrity, or evidence quality for speed.

## Delivery
- Read existing tests and callers before changing contracts.
- Add focused regression tests for behavior and edge cases.
- Run the relevant project test/build commands when the environment permits. If not run, state that explicitly.
- Review the full diff and relevant GitHub Actions results for the exact commit SHA.
- Never claim a test, build, release, agent invocation, or performance improvement succeeded without evidence.
- Keep secrets, private replay archives, signing keys, and user data out of commits and logs.
