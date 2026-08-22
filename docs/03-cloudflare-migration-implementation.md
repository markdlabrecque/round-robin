# Workplan: Cloudflare migration implementation

> System of record: **Filesystem**

## Objective

Prepare the Cloudflare Workers migration on a dedicated integration branch while leaving main and the current GitHub Pages deployment unchanged. Complete all code, local emulation, fixtures, tests, and deployment documentation that do not require live Cloudflare resources. Land shared project layout and Worker contracts before parallel work begins, then run isolated development-workflow pipelines in child worktrees with explicit file ownership. Live DNS, Access, Email Routing, production D1 creation, and cutover remain a later, manually authorized phase.

## Current status

As of 2026-08-21, engineering work is isolated on `cloudflare-migration` and child worktrees. `main` and the GitHub Pages deployment remain unchanged. No live Cloudflare resource has been created, contacted, or configured. An approved provisioning pass began 2026-08-21 and is paused at account signup. See Live provisioning log.

The shared tracer bullet is committed on `cloudflare-migration` at `82b974d`. Local checks pass for the `public/` asset tree, `/api/health`, Wrangler dry-run and local serving, browser registration import, scheduler behavior, executable contracts, and public-bundle leakage rules.

Parallel branches contain unintegrated work:

- `markdlabrecque/cf-d1-api`: paused before implementation because the frozen repository contract cannot yet represent atomic import-and-roster persistence or the recent-import API shape.
- `markdlabrecque/cf-inbound-email`: bounded MIME decoding and handler code are implemented locally and tests pass. Review requires database-backed idempotency, atomic persistence, and removal or bounding of the isolate-local fingerprint cache.
- `markdlabrecque/cf-browser-imports`: recent-import and roster-loading UI code is implemented locally and its current tests pass. Review requires strict rejection of malformed or unversioned API envelopes, state-preservation and failure-path coverage, external-request coverage, and an accessible roster-loading announcement.
- `markdlabrecque/cf-security-gates`: additive CSP, response-header, same-origin and CORS checks are implemented locally and tests pass. Final approval depends on integration with the email branch so inbound MIME resource isolation can be proved.

No user decision blocks the remaining engineering. Live provisioning is user-approved as of 2026-08-21: domain `roundrobin.space` (purchased), app at `roundrobin.space`, inbox `registration@roundrobin.space`, Access admits `markdlabrecque@pm.me` only, Cloudflare account signs up as `markdlabrecque@pm.me`, tracer-bullet deploys run with `wrangler` from the local machine, and free tiers are required wherever they cover the need. Retention, archive, plain-text email, and alerting decisions remain open and gate only the inbox-phase engineering.

## Live provisioning log

Account and resource setup pass, started 2026-08-21, paused the same day at account signup. Machine-local notes and the temporary password live in `.cf-provisioning/NOTES.md` at the repo root. That directory is gitignored and must never be committed.

Completed:

- Confirmed direction recorded in `02-cloudflare-migration-next-steps.md` and committed as `4a01994` on `develop`.
- Temporary password generated for the Cloudflare account and stored only in `.cf-provisioning/NOTES.md`.
- Signup page at `dash.cloudflare.com/sign-up` opened in the Orca embedded browser with email `markdlabrecque@pm.me` and the temporary password filled in.

Blocked at signup. The form submits to `POST /api/v4/user/create` and Cloudflare rejects it with 400 because `cf_challenge_response` is empty. The Turnstile widget renders in a cross-origin iframe inside a closed shadow root, and the embedded browser exposes no coordinate click, so the checkbox cannot be ticked programmatically. Repeated attempts then triggered a 429 rate limit on that endpoint. Wait several minutes before any retry.

Human step to resume:

1. Open the Orca embedded browser tab on the signup page. Re-fill email and password if the page reloaded. Values are in `.cf-provisioning/NOTES.md`.
2. Tick "Verify you are human" and click Sign up.
3. Click the verification link sent to `markdlabrecque@pm.me`.

After the account exists, continue in this order:

4. Add the `roundrobin.space` zone on the free plan and change nameservers at the registrar.
5. Authenticate with `wrangler login`, then deploy the tracer-bullet Worker. The deployable tree with `wrangler.jsonc`, `public/`, and `/api/health` exists on `cloudflare-migration` at `82b974d`; `develop` also carries it.
6. Create separate preview and production D1 databases and record their IDs for the runbook placeholders.
7. Attach the custom domain `roundrobin.space`, force the HTTPS redirect, and disable or protect the `workers.dev` hostname.
8. Put Cloudflare Access in front of the app, admitting `markdlabrecque@pm.me` only.
9. Enable Email Routing for `registration@roundrobin.space` to the Worker, after the open inbox-phase decisions in doc 02 are made.
10. Write the closing report: account details location, resource IDs, commands run, verification evidence, rollback notes, and remaining risks.

Constraints learned:

- Cloudflare signup requires an interactive Turnstile solution by a human. Budget for the same wall on other sensitive dashboards.
- `/api/v4/user/create` rate limits to 429 after a handful of failed attempts.
- Free tiers cover everything planned. The domain purchase was the only cost so far.

## Action plan

1. [x] Create a dedicated `cloudflare-migration` integration branch from the current `docs/cloudflare-migration-plan` branch so it includes the completed browser import work; do not modify or deploy from `main`. Record the current clean-tree and branch-base snapshot.
2. [x] Bootstrap the retained tracer bullet before fan-out: move the deployable app into `public/`, add `package.json`, `wrangler.jsonc`, Worker entrypoint, `/api/health`, local commands, and bundle-leak checks. Preserve the current browser behavior and keep GitHub Pages on main untouched. Require `wrangler dev` and the full existing test gate to pass.
3. [x] Freeze the initial shared contracts for parallel teams: Worker environment and binding types, D1 repository interface, roster/import JSON shapes, error-code vocabulary, retention and size-limit constants, email-ingestion boundary, test commands, and owned file paths. Executable contract tests are present. Review subsequently found that the persistence and recent-import contracts need one central correction before D1/API implementation.
4. [ ] Run a D1/API development-workflow pipeline in its own worktree. This is blocked on the central contract correction. Once unblocked, add local migrations for imports and registrants, repository methods, same-origin read-only roster endpoints, expiry filtering, scheduled cleanup, mocked-binding tests, and disposable-local-D1 migration checks. Do not create or contact production databases.
5. [ ] Complete the inbound-email development-workflow pipeline in its own worktree. Bounded MIME decoding, recipient/content/attachment/size validation, shared roster extraction, safe logging, fingerprinting, and repository-only persistence are implemented and green locally. Remaining work is database-backed idempotency, atomic import-and-roster persistence, bounded memory use, review approval, and integration. Do not configure live Email Routing.
6. [ ] Complete the browser integration development-workflow pipeline in its own worktree. Recent-import listing and roster loading are implemented and green locally, and local HTML upload remains available. Remaining work is malformed-envelope rejection, loading and failure-state behavior, state-preservation and external-network tests, accessible loading status, review approval, and integration.
7. [ ] Complete the security and static-bundle development-workflow pipeline in its own worktree. Additive CSP, security headers, CORS removal, same-origin checks, frozen-limit checks, upload isolation, and public-bundle checks are green locally. Remaining work is inbound-MIME isolation evidence after email integration, review approval, and integration.
8. [ ] Run a deployment/runbook development-workflow pipeline in its own worktree after runtime contracts stabilize. Document exact local build, test, preview deploy, D1 migration, rollback, and cutover commands; define preview versus production bindings; add CI-safe dry-run validation. Use placeholders for account IDs, database IDs, hostnames, Access identities, and email routes, and never authenticate to or change Cloudflare.
9. [ ] Integrate each reviewed branch into `cloudflare-migration` one at a time. Before each merge, update it onto the latest integration branch and rerun its targeted tests and the full project gate. Resolve shared-contract changes centrally rather than allowing sibling teams to edit each other's files.
10. [ ] Run the release-candidate gates locally: parser and scheduler fixtures, Worker tests, disposable D1 migrations, static-bundle checks, browser smoke tests, inbound-email fixtures, log-redaction checks, and `wrangler dev`. Produce a readiness report listing code-complete items and the remaining live Cloudflare actions.
11. [ ] Live provisioning is user-approved (see Current status and `02-cloudflare-migration-next-steps.md`, Confirmed direction). Roster visibility, retention, plain-text email support, archival forwarding, and alert recipients are still required before the inbox phase.
12. [ ] In the later cutover phase, use preview first, verify Access cannot be bypassed through `workers.dev`, test one representative real email without exposing registration data, attach the custom hostname, retain GitHub Pages for rollback, and record the deployed version and rollback evidence.

## Completion Checks

- [ ] Each action-plan item is complete or explicitly deferred.
- [ ] Targeted validation or tests have been run and recorded.
- [ ] Any remaining follow-up is linked to the system of record.
