#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run in VPS root terminal.' >&2; exit 1; }
release_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
container=hermes-agent-vmvu-hermes-agent-1
report_tmp=$(mktemp)
trap 'rm -f -- "$report_tmp"' EXIT
tar -C "$release_root" -cf - scripts/oracle-bridge.mjs scripts/oracle-bridge-lib.mjs scripts/hermes-checklist/bridge.py scripts/hermes-checklist/checklist.py | docker exec -i --user 10000:10000 "$container" /bin/sh -c 'set -eu; umask 077; mkdir -m 700 /opt/data/private/arxcian/release-f8ef88d-prepared; tar -xf - -C /opt/data/private/arxcian/release-f8ef88d-prepared'
docker exec -i --user 10000:10000 "$container" /opt/hermes/.venv/bin/python -B - < "$release_root/ops/acceptance/verify-service-stage.py" > "$report_tmp"
install -m 0600 -o arxcian-codex -g arxcian-codex "$report_tmp" /home/arxcian-codex/arxcian-work/acceptance-service-stage.json
echo 'Separate service package prepared and checked. Live files and services unchanged.'
