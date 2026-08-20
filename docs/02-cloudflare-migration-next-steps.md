# Cloudflare migration next steps

## Goal

Move the app from GitHub Pages to Cloudflare without changing its public behavior. Keep registration-email file import in the browser first, then add an inbox without redesigning the parser or exposing registration data. Once migration starts, this document supersedes the GitHub Pages source-layout direction in `01-client-side-registration-email-import-for-github-pages.md`.

## Implementation status

The detailed system of record is `03-cloudflare-migration-implementation.md`.

Completed on the `cloudflare-migration` branch:

- Browser registration-email import and its local fallback behavior
- A single deployable asset tree under `public/`
- Wrangler and npm local commands
- A minimal Worker with versioned `/api/health`
- Initial runtime-independent API, repository, validation, limit, and email-ingestion contracts
- Public-bundle checks and local Wrangler dry-run and serving evidence

Implemented in child worktrees but not reviewed or integrated:

- Bounded inbound MIME decoding and email-handler behavior
- Browser recent-import listing and roster loading
- Additive Worker security headers, CSP, same-origin checks, and CORS removal

Remaining engineering begins with correcting the shared persistence contract. The correction must support one atomic import-and-roster write, database-backed delivery idempotency, and the recent-import API shape. D1 migrations and API implementation follow that change. Browser failure handling, email hardening, cross-branch security evidence, deployment documentation, integration, and the complete release-candidate gate remain outstanding.

Nothing has been deployed to Cloudflare. DNS, Access, Email Routing, production or preview D1, custom hostnames, and cutover have not started. `main` and GitHub Pages remain unchanged.

## Recommended target

Use Cloudflare Workers with Static Assets rather than a new Pages project. Pages can host this app, but Workers Static Assets puts the site, same-origin API, and future inbound-email handler in one deployable service.

The eventual stack is:

- Workers Static Assets for the HTML, JavaScript, logo, and other public files
- A Worker `fetch` handler for `/api/*`
- Cloudflare Email Routing and an `email` handler for forwarded messages
- D1 for parsed rosters and import metadata
- Cloudflare Access for the app and roster API
- A custom hostname such as `roundrobin.example.com`
- An inbox such as `registrations@example.com`

Static hosting, Worker requests, Email Routing, Access, and light D1 use should fit their free tiers at this scale. The domain is the expected recurring cost. Confirm Cloudflare's current quotas before provisioning.

## Architecture contracts

### Registration parser

Maintain one tested extraction contract for both upload paths:

1. A user imports an HTML file in the browser.
2. The email Worker extracts the HTML MIME part from a forwarded message.

Separate MIME decoding, HTML parsing, name extraction, and roster validation. Browser and Worker runtimes may need different HTML parsing adapters, but they must share normalization and validation rules and pass the same fixtures.

### Data handling

- Never render imported email HTML or return it from the API.
- Never load links, images, fonts, frames, or tracking pixels from an imported message.
- Store the parsed names and minimal metadata, not the raw email.
- Do not log names, message bodies, addresses, access tokens, or raw MIME content.
- Apply explicit message-size, roster-size, and field-length limits before parsing or storing.
- Reject attachments and ignore all MIME parts except the selected HTML or plain-text body.
- Delete roster records after an agreed retention period.

### Authorization

Protect the app and every roster endpoint with Cloudflare Access. Limit Access to the small set of approved users. Treat an inbound sender allowlist as spam reduction, not as the only security boundary. The Worker must also validate the recipient, content type, parsed roster, and request size.

Use same-origin API calls. Do not enable broad CORS. Keep Cloudflare credentials in deployment bindings or secrets, never in browser code or the repository.

## Migration sequence

### 1. Resolve repository layout

- Treat the deployed app as one source tree instead of maintaining divergent root and `docs/` copies.
- Move static files into a dedicated asset directory such as `public/`.
- Remove the obsolete root flow that posts to the nonexistent `/import-roster` endpoint.
- Keep `sample.html` as a sanitized test fixture outside the public asset directory.
- Add `wrangler.jsonc`, `package.json`, local-development commands, and a deployment command.
- Add a check that prevents fixtures, raw emails, secrets, or registrant data from entering the public asset bundle.

Exit check: `wrangler dev` serves the same app locally, all assets load, and no backend is required.

### 2. Finish local file import

Implement `docs/01-client-side-registration-email-import-for-github-pages.md` against the new source layout. Keep this feature available after the Cloudflare move because it is the fallback if inbound email is unavailable.

Exit check: importing `sample.html` produces the expected roster without any external network request.

### 3. Deploy a static tracer bullet

- Create the Cloudflare Worker and use Cloudflare Workers Builds for GitHub deployments unless an existing CI requirement makes a dedicated workflow necessary.
- Deploy the static assets with a minimal Worker handler.
- Add `/api/health` and return a small versioned JSON response.
- Configure preview deployments separately from production.
- Record the exact build, test, and deploy commands in the README.

Exit check: the Cloudflare preview URL serves the app, `/api/health` responds, and browser smoke tests pass.

### 4. Attach the custom hostname

- Add the domain to Cloudflare DNS or delegate the required hostname.
- Attach `roundrobin.example.com` to the Worker.
- Enable HTTPS and redirect HTTP to HTTPS.
- Add Cloudflare Access before any roster API exists.
- Restrict production access to approved email identities.
- Disable or protect the production `workers.dev` hostname so it cannot bypass the custom-domain Access policy.

Exit check: an approved user can sign in and use the app; an unapproved or signed-out browser cannot load it.

### 5. Add D1 behind a narrow roster API

Start with a minimal schema:

- `imports`: identifier, status, source, player count, created time, expiry time, and non-sensitive error code
- `registrants`: import identifier, display order, and normalized name

Add same-origin endpoints for listing recent imports and retrieving one parsed roster. Do not add mutation endpoints that the browser does not need. Bind separate preview and production databases and apply migrations explicitly.

Exit check: an authenticated browser can retrieve a seeded roster; unauthenticated requests fail; expired records are unavailable and removable by a scheduled cleanup.

### 6. Prove inbound email with one real vertical slice

- Enable Email Routing for the custom domain.
- Route only the dedicated registration address to the Worker.
- Add the Worker's `email` handler.
- Enforce recipient and message-size limits before reading the body.
- Decode MIME with a Worker-compatible, pinned library.
- Select the HTML part, falling back to plain text only if a tested format exists.
- Run the shared roster extraction and validation rules.
- Store the parsed roster in D1 and discard the raw message.
- Make the new import visible to authenticated users in the app.

Do not begin with automated replies or arbitrary outbound email. The app's authenticated recent-import list is the first notification mechanism.

Exit check: forwarding a representative registration email creates one correct roster, malformed email creates no partial roster, and logs contain no message body or player names.

### 7. Harden failure handling

Cover these cases with tests and useful status codes:

- duplicate delivery of the same message
- forwarded-message wrappers and multiple candidate tables
- absent HTML body
- malformed MIME or HTML
- unsupported registration format
- duplicate or empty names
- more players than court capacity
- oversized messages or fields
- D1 timeout or unavailable storage
- replayed API requests

Use a message fingerprint for idempotency without retaining raw content. Keep parser errors as short internal codes and show users plain recovery instructions, including local file import.

### 8. Cut over and retain rollback

- Lower DNS TTL before cutover if the current hostname is already in use.
- Run parser, scheduler, API, Access, and browser gates against the production candidate.
- Point the custom hostname at Cloudflare.
- Leave GitHub Pages unchanged until the Cloudflare hostname has passed a real-use check.
- Remove the GitHub Pages custom-domain record only after the rollback window.
- Keep a documented command or DNS change that restores the static site.

Exit check: the custom domain works on desktop and mobile, local upload still works, one forwarded email imports successfully, and rollback has been tested without touching production data.

## Decisions needed before the inbox phase

- The custom domain and final app and inbox hostnames
- Which identities Cloudflare Access should admit
- Whether every approved user sees every imported roster
- How long parsed rosters should remain available
- Whether plain-text-only emails need support
- Whether the original message should be forwarded to a human archive before the Worker discards it
- Who receives operational alerts when parsing repeatedly fails

## Verification gates

Before each production deployment, run:

1. Parser fixtures, including the representative forwarded email
2. Scheduler tests
3. Worker unit and integration tests with mocked bindings
4. D1 migration checks against a disposable local database
5. Static asset and Content Security Policy checks
6. Browser smoke tests for upload, roster selection, shuffle, completed rounds, persistence, and Access login
7. A preview email test that proves no external resource in the message was requested

After cutover, record the deployed version, commands and results, DNS configuration, Access policy, D1 migration version, email route, rollback procedure, and any unresolved risk.

## Primary Cloudflare references

- Workers Static Assets: <https://developers.cloudflare.com/workers/static-assets/>
- Workers custom domains: <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>
- Email Routing and Email Workers: <https://developers.cloudflare.com/email-routing/email-workers/>
- D1: <https://developers.cloudflare.com/d1/>
- Cloudflare Access: <https://developers.cloudflare.com/cloudflare-one/access-controls/>
- Wrangler configuration: <https://developers.cloudflare.com/workers/wrangler/configuration/>
- Workers limits: <https://developers.cloudflare.com/workers/platform/limits/>
