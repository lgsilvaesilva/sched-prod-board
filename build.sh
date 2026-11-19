#!/usr/bin/env bash
# Build dist/ from app/: real config from the session file (never committed), build sha in meta + footer (R6).
set -euo pipefail
cd "$(dirname "$0")"
SESSION_FILE="${SESSION_FILE:-../../session.secret.txt}"
SHA="$(git rev-parse HEAD)"
[ -z "$(git status --porcelain -- app)" ] || { echo "app/ has uncommitted changes; commit first so the sha is honest" >&2; exit 1; }
rm -rf dist && cp -R app dist
cat > dist/config.js <<CFG
export const API = 'https://hq.mega.dev/challenges/show-me-when/api';
export const SESSION = '$(cat "$SESSION_FILE")';
CFG
sed -i '' "s|<meta name=\"build\" content=\"dev\" />|<meta name=\"build\" content=\"$SHA\" />|" dist/index.html
sed -i "" "s|<code data-testid=\"build-sha\">dev</code>|<code data-testid=\"build-sha\">$SHA</code>|" dist/index.html
echo "built dist/ at $SHA"
