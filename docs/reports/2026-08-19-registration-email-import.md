# Registration email import report

## Goal and approved contract

Import saved registration-email HTML in the client-side GitHub Pages app. The parser selects the strongest table whose direct rows have exactly two non-empty name cells, then emits normalized `First Last` names. It must not render imported HTML, execute it, or send it over the network.

## Completed work

- Added the registration-email parser and its browser/Node DOM seams in `docs/registration_email_parser.js`.
- Restored and wired the registration HTML file control in `docs/index.html` and `docs/app.js`, including readiness, persistence, cancellation, and failure preservation behavior.
- Added parser behavior, deployed-site contract, and initialization coverage in `tests/registration_email_parser_behavior.test.js`, `tests/deployed_site_contract.test.js`, `tests/registration_app_initialization.test.js`, and `tests/helpers/`.
- Updated the workplan checkboxes. All items are complete.

The tests run `sample.html` end to end through the parser and production `app.js` through a VM DOM seam. They cover readiness, persistence, cancellation, failure preservation, and the CSP/deployed-asset contract.

## Evidence

- Initial TDD red evidence: the parser test failed with `MODULE_NOT_FOUND`, as expected before the parser module existed.
- Full gate: `node --test tests/*.js` passed, 25 passed and 0 failed.
- `git diff --check` completed cleanly.
- Local static/Chromium evidence: a static Chrome dump rendered the deployed app. A second headless parser probe timed out because of local Chrome allocator/task-policy behavior.
- Chromium desktop smoke imported `sample.html` through the visible file picker and confirmation dialog. The app reported 24 imported players and assigned all 24 to courts.
- Reloading preserved the imported roster and court assignments. Completing the round created Round 2, and viewing the completed Round 1 disabled the import control and locked its roster.

## Review

Reviewer round 1 found parser handling gaps for implied table cell and row endings and for browser entity decoding, plus an initialization-readiness gap around the import control. The Implementer added optional-end-tag handling, an injectable/browser entity decoder, and readiness gating for the control.

Reviewer round 2 approved the result with no findings.

## Follow-up and unresolved risk

No code follow-ups or unresolved risks remain. The interactive Chromium file-picker smoke passed after desktop accessibility permission was granted.

No accepted deviations. No production code or tests were changed by this report.
