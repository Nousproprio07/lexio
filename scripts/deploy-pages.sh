#!/usr/bin/env bash
# Publie le build sur la branche gh-pages (GitHub Pages, https://<compte>.github.io/lexio/).
# Les variables VITE_SUPABASE_* sont lues dans .env.local / .env.production.local si présentes.
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
BASE_PATH=/lexio/ npm run build
cp dist/index.html dist/404.html   # routes profondes (/lexio/quiz…) servies par l'app
touch dist/.nojekyll
cd dist
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" commit -qm "Déploiement $(date '+%Y-%m-%d %H:%M')"
git push -qf "$REMOTE" gh-pages
rm -rf .git
echo "Publié sur la branche gh-pages."
