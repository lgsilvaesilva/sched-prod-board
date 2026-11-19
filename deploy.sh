#!/usr/bin/env bash
# One-time: create the public repo, push main, publish dist/ (with the session key) to gh-pages, turn on Pages.
# Re-run later to redeploy (repo create and Pages enable are skipped if they already exist).
set -euo pipefail
cd "$(dirname "$0")"
REPO=lgsilvaesilva/sched-prod-board

git branch -M main
if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public --source . --remote origin --push
else
  git push -u origin main
fi

./build.sh
D=$(mktemp -d)
cp -R dist/. "$D"/ && touch "$D/.nojekyll"
[ -d proof ] && cp -R proof "$D"/   # recordings, served next to the board
( cd "$D" && git init -q -b gh-pages && git add -A \
  && git -c user.name=lgsilvaesilva -c user.email=noreply@users.noreply.github.com commit -qm "deploy $(git -C "$OLDPWD" rev-parse HEAD)" \
  && git push -q -f "https://github.com/$REPO.git" gh-pages )

gh api "repos/$REPO/pages" >/dev/null 2>&1 \
  || gh api -X POST "repos/$REPO/pages" -f 'source[branch]=gh-pages' -f 'source[path]=/' >/dev/null
echo "Pages: https://lgsilvaesilva.github.io/sched-prod-board/"
