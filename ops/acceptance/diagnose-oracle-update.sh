#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run in VPS root terminal.' >&2; exit 1; }
acceptance_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
report_tmp=$(mktemp)
trap 'rm -f -- "$report_tmp"' EXIT
docker exec -i --user 10000:10000 hermes-agent-vmvu-hermes-agent-1 /opt/hermes/.venv/bin/python -B - < "$acceptance_dir/diagnose-oracle-update.py" > "$report_tmp"
python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["credentials_exported"] is False' "$report_tmp"
install -m 0600 -o arxcian-codex -g arxcian-codex "$report_tmp" /home/arxcian-codex/arxcian-work/acceptance-oracle-update-diagnostic.json
echo 'Update diagnostic saved. No keys, logs, restart or production writes.'
