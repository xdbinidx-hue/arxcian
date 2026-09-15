# Acceptance environment — preparation, not a production release

## Existing local preview

Working copy `/home/arxcian-codex/arxcian-release`, branch `release/acceptance-20260915`.
Loopback URL `http://localhost:3300/login` on the VPS, REST Redis on loopback 3301,
Redis itself has no TCP listener and uses a private Unix socket. No public port,
DNS change or deployment has been made. From a separate machine this address
requires SSH forwarding to this same VPS, e.g. `ssh -N -L 3300:127.0.0.1:3300
arxcian-codex@<your-existing-VPS-SSH-host>`. A verified user-accessible HTTPS URL is
still needed for the final browser acceptance service. Browser cookie behavior
has not been verified; the smoke test explicitly carries the returned cookie.

Run from the release working copy:
`env -i PATH=/usr/bin:/bin python3 -B ops/acceptance/local-preview.py`.
The current invocation log is `/home/arxcian-codex/arxcian-work/acceptance-preview.log`.

New test passwords and session/Redis/bridge keys are in
`/home/arxcian-codex/arxcian-work/acceptance-preview/browser-credentials.json`
(mode 0600). The `albin` and `arbnor` values are browser passwords. Read this file
privately on the VPS; do not paste it into chat. The launcher imports no inherited
production environment and refuses actual application `.env` files. No model
bridge, supervisor or Telegram poller is started. Never point this Redis adapter
at an existing Redis socket; the launcher always creates its own server/socket.
Redis has no persistence in this preliminary environment. Restarts lose queue/cache
state: it is not suitable for final continuity acceptance. No sample task is seeded
and missing live connections are not replaced with simulated successful results.

Tested against the actual running Next build: anonymous checklist API 401, new Albin
login 200/read 200, new Arbnor login 200/read 404, @vercel/kv HTTP roundtrip on own
Redis. Result `/home/arxcian-codex/arxcian-work/acceptance-preview-smoke.json`.
This checks the new environment; the earlier full application suite was not rerun.

## Inputs still needed for a usable acceptance service

1. Execute `bash /home/arxcian-codex/arxcian-release/ops/acceptance/export-runtime.sh`
   in the VPS root terminal. Only read-only runtime metadata and the missing static
   profiles.py module are exported to `arxcian-work/acceptance-runtime.json` (0600).
   The report explicitly leaves effective auth/dashboard access unknown; source
   review plus actual allowed/denied requests are required, not just a PID or count.
2. A dedicated Drive service identity with **viewer ACL only** on the required
   source files. Place its JSON securely, mode 0600, at
   `arxcian-work/acceptance-preview/drive-readonly.json`. A production account with
   write permissions is unsuitable even when ordinary read routes use readonly scopes.
   Do not restart/import it until its read-only scope and ACL are confirmed.
3. A separate Hermes Oracle profile/API key and sandbox whose tools cannot write to
   production Drive, Redis, SQLite or personal data. Required bridge inputs:
   isolated `HERMES_API_URL` (path `/p/oracle`), isolated `API_SERVER_KEY`, preview
   `ARXCIAN_ORIGIN`, generated preview `ORACLE_BRIDGE_SECRET`. Keep them in a private
   file, not the application repo or chat. Do not reuse the production supervisor,
   API key or Telegram poller. For the real Telegram continuity test the existing
   authenticated gateway needs a verified test routing plan into separate SQLite;
   this is not enabled by the local launcher.
4. A user-accessible HTTPS host/proxy and persistent **test-only** Redis/SQLite.
   No public hosting/account settings were available in the current working copy.

## Production capture and safe restore

Execute `bash /home/arxcian-codex/arxcian-release/ops/acceptance/capture-restore-point.sh`
in the VPS root terminal. This is a capture, not a deployment or restore. It opens
only the known existing board DB in `mode=ro`, runs integrity_check and SQLite online
backup, and creates a new private directory under
`/opt/data/private/arxcian/restore-points/` inside the container. Selected gateway,
root config/environment and supervisor sources are copied there with mode 0600.
Secret values and DB contents stay inside the container; only hashes/paths are exported
to `arxcian-work/acceptance-restore-point.json`. It refuses an absent DB or existing
backup destination. An incomplete capture is not a valid restore point: the manifest
must be reviewed against the real supervisor/profile configuration and service units.
It deliberately records runtime_settings_complete=false until that review is done.

`python3 -B ops/acceptance/rehearse-restore.py` was already run on a new temporary
SQLite database. Online backup, integrity checks, restored old revision and unchanged
newer live revision passed. Capture itself was checked on temporary fixtures for
private permissions, no source changes, overwrite refusal and no secret values in
metadata (`acceptance-capture-check.json`). No production restore occurred.

Final drill: copy the captured board into a NEW sandbox, restore gateway/bridge files
only there, start against separate test Redis and block delivery/production tool access.
Verify data/revision and owner isolation; an older SQLite revision must not overwrite
a newer Redis snapshot. Keep production untouched. After this passes, record the
capture ID, corresponding app deployment, supervisor/gateway hashes and observed
service behavior. Any eventual live rollback is a separate approved operation; do
not delete tasks/receipts or reset revision to force acceptance of an old backup.

## Real Oracle/Drive comparison — not run yet

For September 2026 and the next available month record the exact fileId, view,
source modified time, seller and snapshot/message ID. Collect source Drive values,
visible target/actual/forecast/percentage and the real Oracle answer. Use the same
snapshot/period; a later UI selection does not change an already queued prompt.
Mark every number pass/fail with missing-vs-zero interpretation. Recheck all three
views and both user access boundaries. See `docs/oracle-rjmob-validation.md`.
Do not write to the Drive source or call a model with production-writing tools.

## Browser checklist once connections are ready

- Login with the separate test Albin credentials; choose September and the next month.
- Compare targets, actuals, forecasts and percentages in all three sales views with Oracle.
- Start the same three-point task in verified test Telegram routing; continue in browser,
  close/reopen, retry after a connection break; confirm one task and visible recovery.
- Login as test Arbnor: Albin's task and Oracle message must remain inaccessible.

All-site Oracle tools and web search remain outside this release work.
