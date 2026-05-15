#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

git pull --ff-only
npm ci
npm run build
pm2 reload ecosystem.config.js --update-env
