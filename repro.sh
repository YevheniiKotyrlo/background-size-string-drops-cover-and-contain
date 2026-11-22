#!/bin/sh
# Installs the pinned Flow type stripper and runs repro.mjs with the arguments given; a failed install exits 2.
cd "$(dirname "$0")" || exit 2
npm ci --silent --no-audit --no-fund || exit 2
exec node repro.mjs "$@"
