# Current operator inputs

Location report read: default and Oracle API keys exist in the known .env paths;
no separate staging/acceptance directory or Drive credential found in that bounded
search. The user confirmed Vercel access; the actual Google key is not yet imported.

Vercel `rjmob-portal` → Settings → Environment Variables → `GOOGLE_SERVICE_ACCOUNT_KEY`.
If readable, copy ONLY this value privately. Sensitive values cannot be read back;
do not replace/delete production values to work around that. Official references:
https://vercel.com/docs/environment-variables/managing-environment-variables
https://vercel.com/docs/environment-variables/sensitive-environment-variables

Root console: `python3 -B /home/arxcian-codex/arxcian-release/ops/acceptance/import-drive-key.py`.
Paste the JSON while echo is disabled, press Enter and type `LOPPU` on its own line.
Multiline input is supported. Only a new private pending `drive-candidate.json` is
written; the app does not load this file. Mode 0600, Codex ownership, overwrite
refused; no network requests. Do not send credentials into chat. The import's
fixture and actual PTY secret-exclusion/multiline/echo-restoration tests passed.

Actual GET-only transport auth check (not another metadata/backup test):
`bash /home/arxcian-codex/arxcian-release/ops/acceptance/check-api-auth.sh`.
Uses existing keys only inside the container, reports statuses for models metadata
with anonymous/invalid/own/other keys. No model runs, sessions or tasks are created.
Output acceptance-api-auth-read.json; syntax checked, real execution pending.
This does not by itself prove end-user ownership or dashboard access boundaries.

---

# Locating test access on behalf of the user

The user does not know whether the required test environment exists. Prepared a
bounded location/presence finder, not another profile/backup drill:
`bash /home/arxcian-codex/arxcian-release/ops/acceptance/find-test-access.sh` (VPS root).
It exports only credential names present, known config/source paths and safe service
origins to arxcian-work/acceptance-test-access.json. No secret values, conversations,
DB data, service changes or provisioning. Fixture secret-exclusion check passed;
actual container execution pending. Use its results to propose/prepare concrete
isolated connections rather than asking the user to guess configuration locations.

---

# All requested metadata commands completed

The corrected acceptance-profile-gates.json was received and read (15 September
2026 08:15:10 UTC). No further generic root metadata script is requested now.
Reports verify configuration facts, not effective per-user auth or dashboard access.
Captured-backup SQLite restore and isolated preview AOF durability passed previously.
See docs/acceptance-results.md for current evidence and explicit remaining blockers.
Next prerequisite: existing isolated Oracle/Drive/HTTPS test access locations, or a
user decision to provision the missing environment on this VPS. Do not paste secrets.
Instructions below are retained history; completed checks need no routine rerun.

---

# Update: capture drill passed; corrected auth summary pending

Read acceptance-final-evidence.json: captured files verified, restored SQLite integrity
passed (8 tables), temporary sandbox removed, capture unchanged, no services started.
Full-service rollback and effective profile authorization remain unverified.

The previous profile summary missed nested/current config shapes. Corrected metadata
reader is prepared. Run only:
`bash /home/arxcian-codex/arxcian-release/ops/acceptance/inspect-profile-gates.sh`.
This is read-only audit mode and does NOT repeat the passed backup restore drill.
Output: arxcian-work/acceptance-profile-gates.json. Syntax checks passed; container
execution pending. Empty platform lists in the old report must not be used as proof
that there are no adapters or no unauthorized access.

Own preview Redis AOF and restart durability now passed. No production restart.
Earlier preparation/status text below is retained as historical context.

---

# Received evidence 15 September 2026

The user ran both initial root commands. The actual JSON reports were read.
Capture exists: `/opt/data/private/arxcian/restore-points/20260915T075851Z-4754f8ce`,
SQLite integrity_check ok. Runtime hashes for run.py/authz_mixin.py/status.py match
the reviewed source package. Missing profiles.py was obtained and inspected.
Persisted runtime lists default/oracle but has an old timestamp; effective auth is
still unverified. Capture settings completeness/full service rollback remain open.

Next targeted root command:
`bash /home/arxcian-codex/arxcian-release/ops/acceptance/finish-evidence.sh`.
It summarizes only default/oracle gates and restores the captured backup into a new
private temporary sandbox, verifies hashes/integrity, then removes the sandbox.
No live replacement, PairingStore import/migration, service start or model request.
Output: `arxcian-work/acceptance-final-evidence.json`. The command has only passed
syntax/AST checks locally; its real container execution is pending.

The two initial capture/read commands below are completed; do not rerun them just
because the older preparation instructions still appear in the retained record.

---

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
Redis now uses AOF persistence only in the private preview directory. A test key
survived an actual preview/Redis restart; acceptance-preview-durability.json records
the passing check. Real Telegram task continuity still awaits test routing. No sample task is seeded
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


### Oikean Drive-lukukuvan eristetty selaintesti

`capture-drive-view.cjs` käyttää vain Google readonly-scopeja ja tallentaa yksityisen capturen erillisprosessissa. `--recompute-only` ei lue avainta tai verkkoa: se päivittää laskennat aiemmasta aineistosta säilyttäen lukuaikoja. `snapshot-preview.cjs` tarvitsee oman loopback-Nextin 3300 ja capturen; bind vain 127.0.0.1:3302, omat signed testisessiot, API-datan GET/fileId-rajaus, muu kirjoittava API estetty paitsi testikirjautuminen ja oma checklist. Oracle 503, ei live-bridgeä/Telegramia. Ei aktivoi Google-avainta Nextissä.

`check-snapshot-preview.cjs` käyttää omia testitunnuksia ja vertaa oikean React-sivun kaikki kolme näkymätunnistetta captureen. DOM-verkkopyynnöt rajataan neljään lukureittiin. Login-testit kuluttavat oman eristetyn Redisin kiintiötä; älä muuta tuotantokiintiötä. Capture ja tunnukset ovat private-tilassa, eivät Gitissä. Käyttäjän SSH-tunneli: `ssh -N -L 3302:127.0.0.1:3302 arxcian-codex@77.37.49.27`; osoite `http://localhost:3302/acceptance`. Todellinen käyttäjäselaintesti ja julkinen HTTPS-pääsy vielä avoinna.
