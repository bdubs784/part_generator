#!/usr/bin/env bash
# Builds engine/dist/bearing_engine.{mjs,wasm} with Emscripten.
# Needs emsdk (EMSDK points at it, default ../../tools/emsdk) and cmake +
# ninja on PATH. The first run downloads Manifold and Clipper2.
set -euo pipefail
cd "$(dirname "$0")"

EMSDK="${EMSDK:-$(cd ../../tools/emsdk && pwd)}"
export EM_CONFIG="$EMSDK/.emscripten"
export PATH="$EMSDK/upstream/emscripten:$PATH"

emcmake cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build
mkdir -p dist
cp build/bearing_engine.mjs build/bearing_engine.wasm dist/
ls -la dist
