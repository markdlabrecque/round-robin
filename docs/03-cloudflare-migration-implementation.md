# Workplan: Cloudflare migration implementation

> System of record: **Filesystem**

## Objective

Prepare the Cloudflare Workers migration on a dedicated integration branch while leaving main and the current GitHub Pages deployment unchanged. Complete all code, local emulation, fixtures, tests, and deployment documentation that do not require live Cloudflare resources. Land shared project layout and Worker contracts before parallel work begins, then run isolated development-workflow pipelines in child worktrees with explicit file ownership. Live DNS, Access, Email Routing, production D1 creation, and cutover remain a later, manually authorized phase.

## Action Plan

1. [ ] Create a dedicated `cloudflare-migration` integration branch from the current `docs/cloudflare-migration-plan` branch so it includes the completed browser import work; do not modify or deploy from `main`. Record the current clean-tree and branch-base snapshot.
2. [ ] Bootstrap the retained tracer bullet before fan-out: move the deployable app into `public/`, add `package.json`, `wrangler.jsonc`, Worker entrypoint, `/api/health`, local commands, and bundle-leak checks. Preserve the current browser behavior and keep GitHub Pages on main untouched. Require `wrangler dev` and the full existing test gate to pass.
3. [ ] Freeze shared contracts for parallel teams: Worker environment and binding types, D1 repository interface, roster/import JSON shapes, error-code vocabulary, retention and size-limit constants, email-ingestion boundary, test commands, and owned file paths. Add executable contract tests before implementation teams diverge.
4. [ ] Run a D1/API development-workflow pipeline in its own worktree. Add local migrations for imports and registrants, repository methods, same-origin read-only roster endpoints, expiry filtering, scheduled cleanup, mocked-binding tests, and disposable-local-D1 migration checks. Do not create or contact production databases.
5. [ ] Run an inbound-email development-workflow pipeline in its own worktree. Add MIME fixture decoding, strict recipient/content/attachment/size validation, shared roster extraction and validation, message-fingerprint idempotency, atomic D1 persistence through the shared repository contract, safe error codes, and tests proving raw MIME, names, and addresses are not logged or retained. Do not configure live Email Routing.
6. [ ] Run a browser integration development-workflow pipeline in its own worktree. Add authenticated-app behavior for listing recent imports and loading one roster through the same-origin API while preserving local HTML upload as a fallback. Add loading, empty, expired, and recovery states plus browser-level tests. Keep this team out of Worker, D1, and email-owned files.
7. [ ] Run a security and static-bundle development-workflow pipeline in its own worktree. Add checks for CSP and security headers, broad-CORS rejection, public-bundle allowlisting, secret and personal-data leak detection, request and field limits, and tests that imported email resources never generate external requests. This team owns checks and tests, not production feature code.
8. [ ] Run a deployment/runbook development-workflow pipeline in its own worktree after runtime contracts stabilize. Document exact local build, test, preview deploy, D1 migration, rollback, and cutover commands; define preview versus production bindings; add CI-safe dry-run validation. Use placeholders for account IDs, database IDs, hostnames, Access identities, and email routes, and never authenticate to or change Cloudflare.
9. [ ] Integrate each reviewed branch into `cloudflare-migration` one at a time. Before each merge, update it onto the latest integration branch and rerun its targeted tests and the full project gate. Resolve shared-contract changes centrally rather than allowing sibling teams to edit each other's files.
10. [ ] Run the release-candidate gates locally: parser and scheduler fixtures, Worker tests, disposable D1 migrations, static-bundle checks, browser smoke tests, inbound-email fixtures, log-redaction checks, and `wrangler dev`. Produce a readiness report listing code-complete items and the remaining live Cloudflare actions.
11. [ ] Stop before any live move. Require explicit user approval and final values for domain and hostnames, Access identities, roster visibility, retention, plain-text email support, archival forwarding, and alert recipients before creating Cloudflare resources, changing DNS, enabling Email Routing, or deploying production.
12. [ ] In the later cutover phase, use preview first, verify Access cannot be bypassed through `workers.dev`, test one representative real email without exposing registration data, attach the custom hostname, retain GitHub Pages for rollback, and record the deployed version and rollback evidence.

## Completion Checks

- [ ] Each action-plan item is complete or explicitly deferred.
- [ ] Targeted validation or tests have been run and recorded.
- [ ] Any remaining follow-up is linked to the system of record.
