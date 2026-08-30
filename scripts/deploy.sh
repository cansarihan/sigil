#!/usr/bin/env bash
# Deploys a Sigil vault.
#
#   ./scripts/deploy.sh <network> <source-key> <threshold> <timelock-secs> <signer>...
#
# Example (2-of-3, 1 hour timelock, 7 day proposal life):
#   ./scripts/deploy.sh testnet sigil-1 2 3600 GA... GB... GC...
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$#" -lt 5 ]; then
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
  exit 64
fi

NETWORK=$1; SOURCE=$2; THRESHOLD=$3; TIMELOCK=$4; shift 4
PROPOSAL_TTL=${PROPOSAL_TTL:-604800}

# Mainnet spends real XLM and the deploy is irreversible — make it deliberate.
if [ "$NETWORK" = "mainnet" ]; then
  echo "About to deploy to MAINNET as '$SOURCE': $THRESHOLD-of-$# with a ${TIMELOCK}s timelock."
  read -r -p "Type 'deploy mainnet' to continue: " CONFIRM
  [ "$CONFIRM" = "deploy mainnet" ] || { echo "aborted"; exit 1; }
fi

SIGNERS=$(printf '"%s",' "$@" | sed 's/,$//')

./scripts/build.sh

stellar contract deploy \
  --wasm target/wasm32v1-none/release/sigil_vault.wasm \
  --source "$SOURCE" --network "$NETWORK" \
  -- \
  --signers "[$SIGNERS]" \
  --threshold "$THRESHOLD" \
  --timelock "$TIMELOCK" \
  --proposal_ttl "$PROPOSAL_TTL"
