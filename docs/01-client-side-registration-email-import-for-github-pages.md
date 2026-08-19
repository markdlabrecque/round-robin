# Workplan: Client-side registration email import for GitHub Pages

> System of record: **Filesystem**

## Objective

Keep the app on GitHub Pages and process saved registration-email HTML entirely in the browser. The first supported format is the Pickleball Canada/Gmail HTML represented by sample.html: a surrounding email with a registration table whose rows contain first-name and last-name cells. Imported HTML must never be inserted into the live page or sent over the network. The deployed app under docs/ is the source of truth; the stale root page should no longer imply that a backend endpoint exists.

## Action Plan

1. [x] Capture the import contract in tests and fixtures: accept .html/.htm files, locate the strongest candidate table containing direct rows with two non-empty name cells, join each row as `First Last`, decode HTML entities through the parser, normalize whitespace, preserve punctuation and multi-word names, and remove case-insensitive duplicates while preserving order.
2. [x] Add a browser-compatible registration-email parser module with a small injectable DOM parsing boundary so the same extraction logic can be tested under Node. Restrict extraction to text content and direct table cells; never execute scripts, render imported markup, follow links, or copy arbitrary HTML into the application DOM.
3. [x] Add Node tests using sample.html as the end-to-end fixture plus focused fixtures for forwarded-email wrapper tables, multi-word and hyphenated names, entities, duplicate names, malformed HTML, no matching table, and ambiguous multiple tables. Assert clear failures instead of silently importing unrelated email text.
4. [x] Restore an accessible `Import registration HTML` file control in docs/index.html and connect it directly to `File.text()` and the parser. On success, replace the current roster, select all imported players, reset the active assignment as needed, schedule the round, persist state, and report the imported count. On failure, preserve the existing roster and show a useful error.
5. [x] Add a restrictive Content Security Policy suitable for the static app, including blocking remote images, frames, objects, and connections, so parsing an email with tracking pixels or remote assets cannot contact those servers. Verify that the local logo, scheduler, roster JSON, inline app code, and import still work under the policy.
6. [x] Define state behavior explicitly in the UI and tests: importing while viewing the active round is allowed after confirmation if it would discard current assignments or history; importing while viewing a completed round is disabled; canceling the file picker changes nothing; importing more than 24 players keeps the full checklist and reports how many cannot fit.
7. [x] Make docs/ the documented GitHub Pages application source. Replace or retire the stale root index.html backend-based import flow so local use points to docs/index.html, and add an automated consistency/reference check that fails if deployed files are missing or the obsolete `/import-roster` endpoint returns.
8. [ ] Run the parser tests, scheduler tests, a local static-server smoke test, and a browser check using sample.html. Verify roster names and count, shuffle and round-history behavior, persistence after reload, useful invalid-file errors, no network requests to URLs embedded in the imported email, mobile controls, and the GitHub Pages path layout.

   Deferred: the interactive browser file-picker smoke could not run in this environment. See `docs/reports/2026-08-19-registration-email-import.md`.

## Completion Checks

- [x] Each action-plan item is complete or explicitly deferred.
- [x] Targeted validation or tests have been run and recorded.
- [x] Any remaining follow-up is linked to the system of record.
