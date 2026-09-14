#!/usr/bin/env bash
# Ajetaan VPS-hostilla. Vain rajattu lukutarkistus; ei sudoa, asennusta tai restartia.
set -euo pipefail
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ "$(id -u)" -ne 0 ]; then
  echo 'Avaa VPS:n root-terminaali; tätä lukutarkistusta ei ajeta konttikäyttäjänä.' >&2
  exit 1
fi
report_tmp=$(mktemp)
trap 'rm -f -- "$report_tmp"' EXIT
docker exec -i --user 10000:10000 hermes-agent-vmvu-hermes-agent-1 /usr/bin/python3 - < "$script_dir/../scripts/hermes-checklist/preflight.py" > "$report_tmp"
install -m 0644 -- "$report_tmp" /home/arxcian-codex/arxcian-work/checklist-preflight.json
echo 'Raportti tallennettu Codexille. Tuotantoa ei muutettu.'
