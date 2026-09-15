#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run in VPS root terminal.' >&2; exit 1; }
acceptance_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
report_tmp=$(mktemp)
trap 'rm -f -- "$report_tmp"' EXIT
if ! docker exec -i --user 10000:10000 hermes-agent-vmvu-hermes-agent-1 /opt/hermes/.venv/bin/python -B - < "$acceptance_dir/install-oracle-service.py" > "$report_tmp"; then
  if [ -s "$report_tmp" ]; then install -m 0600 -o arxcian-codex -g arxcian-codex "$report_tmp" /home/arxcian-codex/arxcian-work/production-oracle-service-failure.json; fi
  echo 'Update failed; stop retries and read recovery diagnostic.' >&2
  exit 1
fi
python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["bridge_updated"] is True' "$report_tmp"
install -m 0600 -o arxcian-codex -g arxcian-codex "$report_tmp" /home/arxcian-codex/arxcian-work/production-oracle-service-release.json
echo 'Oracle bridge updated with private rollback copy. Gateway and checklist untouched.'
