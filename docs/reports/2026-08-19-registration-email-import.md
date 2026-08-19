# Registration email import report

## Goal and approved contract

Import saved registration-email HTML in the client-side GitHub Pages app. The parser selects the strongest table whose direct rows have exactly two non-empty name cells, then emits normalized `First Last` names. It must not render imported HTML, execute it, or send it over the network.

## Completed work

- Added the registration-email parser and its browser/Node DOM seams in `docs/registration_email_parser.js`.
- Restored and wired the registration HTML file control in `docs/index.html` and `docs/app.js`, including readiness, persistence, cancellation, and failure preservation behavior.
- Added parser behavior, deployed-site contract, and initialization coverage in `tests/registration_email_parser_behavior.test.js`, `tests/deployed_site_contract.test.js`, `tests/registration_app_initialization.test.js`, and `tests/helpers/`.
- Updated the workplan checkboxes. Item 8 remains deferred.

The tests run `sample.html` end to end through the parser and production `app.js` through a VM DOM seam. They cover readiness, persistence, cancellation, failure preservation, and the CSP/deployed-asset contract.

## Evidence

- Initial TDD red evidence: the parser test failed with `MODULE_NOT_FOUND`, as expected before the parser module existed.
- Full gate: `node --test tests/*.js` passed, 25 passed and 0 failed.
- `git diff --check` completed cleanly.
- Local static/Chromium evidence: a static Chrome dump rendered the deployed app. A second headless parser probe timed out because of local Chrome allocator/task-policy behavior.
- Brave desktop smoke opened the app, but Orca accessibility permission blocked interaction with the file picker.

## Review

Reviewer round 1 found parser handling gaps for implied table cell and row endings and for browser entity decoding, plus an initialization-readiness gap around the import control. The Implementer added optional-end-tag handling, an injectable/browser entity decoder, and readiness gating for the control.

Reviewer round 2 approved the result with no findings.

## Follow-up and unresolved risk

No code follow-ups were deferred. Interactive browser file-picker smoke remains unverified in this environment because the available desktop accessibility path could not operate the picker. Do not treat the static Chrome render or the Brave launch as a successful interactive browser import.

No accepted deviations. No production code or tests were changed by this report, and no commit was made.
