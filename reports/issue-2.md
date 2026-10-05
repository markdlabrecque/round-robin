# Issue 2: spread repeated relationships

The scheduler now scores previous partner and opponent meetings with squared counts. This penalizes concentrated reuse rather than treating it as equal to repeats spread across less-used pairs. Fresh partner matching still takes priority. After fresh matchings run out, partner fairness takes priority over opponent fairness.

Equal-cost sampled candidates use random replacement instead of always retaining the first one. Squared costs alone did not fix the deterministic full-session regression; randomized ties also changed the fresh-partner trajectory. Scheduling remains heuristic, with no guarantee of globally optimal arbitrary sessions.

The public repeat metrics retain their original meaning: sums of prior meetings for the selected relationships. Both scheduler copies are synchronized. Court arrangement caches pairwise team costs within each candidate to avoid repeated history lookups during dynamic programming.

## Verification

Docker command from the ticket worktree:

```sh
docker compose -f /Users/mark/Projects/round-robin/.agents/orchestration/verify.yml -p round-robin-2 run --rm tests
```

All seven tests pass, including the five original tests and both supplied regressions. No tests were weakened or changed by the implementor.

Default 24-player exhausted-history probes using seeds 7, 99, and 42 took 550.07–616.78 ms for 23 completed rounds and 525.05–544.11 ms for 253 uniformly exhausted rounds. The latter fixture makes all fallback partner costs equal, exercising court arrangement for all 4000 candidates. Each probe checked exact roster membership, capacity, and linear repeat metrics against actual selected slots. These are measured Docker timings, not a universal upper bound.

Static review found no lost-history defect in either HTML page. Completion copies slots before scheduling; assignment passes all completed rounds; persistence and restoration retain every valid completed round. No HTML edits or browser persistence tests were needed for this scheduler change.

Detailed implementation and timing evidence is in `.scratch/implementation.md`, with the reproducible probe in `.scratch/probe-runtime.js`. An attempted extra test addition was blocked by the existing test-file lock and was not applied.
