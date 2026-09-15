#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run in VPS root terminal.' >&2; exit 1; }
acceptance_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
report_tmp=$(mktemp)
trap 'rm -f -- "$report_tmp"' EXIT
docker exec -i --user 10000:10000 --env ARXCIAN_AUDIT_ONLY=1 hermes-agent-vmvu-hermes-agent-1 /opt/hermes/.venv/bin/python -B - < "$acceptance_dir/finish-evidence.py" > "$report_tmp"
python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["production_modified"] is False' "$report_tmp"
install -m 0600 -o arxcian-codex -g arxcian-codex "$report_tmp" /home/arxcian-codex/arxcian-work/acceptance-profile-gates.json
echo 'Corrected config gate metadata saved; read-only, no backup drill repeated.'
