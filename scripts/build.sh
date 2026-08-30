#!/usr/bin/env bash
# Builds the vault to wasm and reports the hash that should match on-chain.
set -euo pipefail
cd "$(dirname "$0")/.."

stellar contract build
WASM=target/wasm32v1-none/release/sigil_vault.wasm

echo
echo "artifact : $WASM"
echo "size     : $(wc -c < "$WASM" | tr -d ' ') bytes"
echo "sha256   : $(shasum -a 256 "$WASM" | cut -d' ' -f1)"
