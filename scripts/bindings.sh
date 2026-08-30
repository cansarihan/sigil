#!/usr/bin/env bash
# Regenerates the TypeScript client from the deployed contract spec, so the
# web app and relayer share exactly the types the chain enforces.
set -euo pipefail
cd "$(dirname "$0")/.."

NETWORK=${1:-testnet}
CONTRACT_ID=${2:?usage: ./scripts/bindings.sh <network> <contract-id>}

rm -rf packages/sigil-vault-client
stellar contract bindings typescript \
  --network "$NETWORK" \
  --contract-id "$CONTRACT_ID" \
  --output-dir packages/sigil-vault-client \
  --overwrite

npm --prefix packages/sigil-vault-client install
npm --prefix packages/sigil-vault-client run build
