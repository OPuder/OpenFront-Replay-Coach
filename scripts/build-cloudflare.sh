#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Checking out the pinned OpenFront engine"
git submodule sync -- vendor/OpenFrontIO
git submodule update --init --depth 1 vendor/OpenFrontIO

echo "==> Installing pinned OpenFront dependencies"
npm --prefix vendor/OpenFrontIO ci --ignore-scripts

echo "==> Installing Replay Coach dependencies"
npm ci

echo "==> Building shared browser app and replay workers"
npm run build:web

echo "==> Validating PWA and same-origin proxy output"
node scripts/smoke-test-web.mjs

echo "==> Cloudflare Pages build is ready in dist/"
