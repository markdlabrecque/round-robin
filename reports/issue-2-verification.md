# Issue 2: verification report (supersedes preliminary report)

This final report supersedes [`issue-2.md`](issue-2.md), which is a stale preliminary report describing seven tests and static-only verification. That file was not updated.

## Delivered

The scheduler scores repeated partner and opponent meetings using squared history counts, prioritizing fresh partnerships and then partner fairness. Equal-cost sampled candidates use random replacement. The scheduler copies remain synchronized. This is a heuristic; it does not guarantee globally optimal arbitrary sessions.

## Verification evidence

- Full Docker suite override: **8 tests passed, 0 failed**. Command:

  ```sh
  docker compose -f /Users/mark/Projects/round-robin/.agents/orchestration/verify.yml -p round-robin-2 run --rm tests node --test tests/*.js
  ```

- `git diff --check` passed; deployed scheduler copy is byte-identical.
- Chromium UX verification completed 30 rounds on `/docs/` and at the root. The root used a saved browser-local fixture containing the demo's actual 24 names and 24-slot assignments because root roster initialization is broken in this static harness. Reloads at rounds 8, 16, 23 and 28 preserved all saved roster/slot data; all 30 history navigation views matched snapshots, and instrumented scheduling calls received full history.
- `/docs/` additional eight-player run completed 14 rounds; reload checks passed. No partnership repeated in rounds 1–7 and every partnership occurred twice by round 14. Opponent counts were 3–5; this random session was not globally optimal.
- Capacity, roster membership, duplicates, empty/odd/full/over-capacity selection, long names, keyboard-only controls and desktop/narrow layouts were exercised. Root roster loading/import could not be tested successfully.
- Supplied exhausted-history runtime probe assertions passed: 542–585 ms for sampled runs and 518–531 ms for 253-round uniformly exhausted histories.
- Pre-existing verifier errors: missing `/registrants.js` network 404 and `net::ERR_ABORTED`; console failed-resource 404 messages and roster initialization validation error; server missing roster file; `/import-roster` network 404, server missing endpoint, and page response JSON parsing error. Expected duplicate-name validation was also observed. No ticket-caused errors were found.

Evidence files are retained under `/tmp/round-robin-2-ux.KM17mi/`. Manual binary evidence attachment remains outstanding; artifacts include the recordings, screenshots, JSON histories and raw logs described in `.scratch/verification.md`.

## Review and follow-ups

Two review rounds approved the work, with follow-ups; the work could use more review passes. Follow-ups/issues linked: [#4](https://github.com/markdlabrecque/round-robin/issues/4) (multi-seed fairness characterization), [#8](https://github.com/markdlabrecque/round-robin/issues/8) (test harness discovery), and [#9](https://github.com/markdlabrecque/round-robin/issues/9) (root roster/import integration verification). Root import flow remains unverified until its roster script and import endpoint are available. Attach the binary evidence manually at `/tmp/round-robin-2-ux.KM17mi`.
