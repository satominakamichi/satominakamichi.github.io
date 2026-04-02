#!/bin/bash
set -e

TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN}"
ORG="satominakamichi"
REPO="satominakamichi.github.io"
SRC="/home/runner/workspace"
EMAIL="kai-liam@users.noreply.github.com"
NAME="liam"

if [ -z "$TOKEN" ]; then
  echo "ERROR: GITHUB_PERSONAL_ACCESS_TOKEN not set"
  exit 1
fi

DEPLOY_DIR=$(mktemp -d)
echo "Working in $DEPLOY_DIR"

cd "$DEPLOY_DIR"
git init
git config user.email "$EMAIL"
git config user.name "$NAME"
git checkout -b main

cp_if() {
  local src="$SRC/$1"
  local dst="$DEPLOY_DIR/$1"
  if [ -e "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    if [ -d "$src" ]; then
      cp -r "$src" "$(dirname "$dst")/"
    else
      cp "$src" "$dst"
    fi
  fi
}

# ── commit 1: monorepo init ────────────────────────────────────────
for f in .gitignore .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml \
          tsconfig.base.json tsconfig.json; do
  cp_if "$f"
done
git add -A && git commit -m "chore: init pnpm monorepo"

# ── commit 2: shared lib ──────────────────────────────────────────
cp_if "lib"
git add -A && git commit -m "chore: add shared lib and tsconfig"

# ── commit 3: API server scaffold ────────────────────────────────
for f in artifacts/api-server/package.json artifacts/api-server/tsconfig.json \
          artifacts/api-server/build.mjs artifacts/api-server/.env.example; do
  cp_if "$f"
done
mkdir -p "$DEPLOY_DIR/artifacts/api-server/src"
git add -A && git commit -m "feat: scaffold API server"

# ── commit 4: AI + TTS + Twitter services ────────────────────────
cp_if "artifacts/api-server/src/services"
git add -A && git commit -m "feat: add AI, TTS, and Twitter chat services"

# ── commit 5: API routes ──────────────────────────────────────────
cp_if "artifacts/api-server/src/routes"
cp_if "artifacts/api-server/src/index.ts"
cp_if "artifacts/api-server/src/ws.ts"
git add -A && git commit -m "feat: add Satomi API routes and WebSocket"

# ── commit 6: frontend scaffold ───────────────────────────────────
for f in artifacts/satomi/package.json artifacts/satomi/tsconfig.json \
          artifacts/satomi/vite.config.ts artifacts/satomi/tailwind.config.ts \
          artifacts/satomi/index.html artifacts/satomi/postcss.config.js; do
  cp_if "$f"
done
mkdir -p "$DEPLOY_DIR/artifacts/satomi/src"
git add -A && git commit -m "feat: scaffold Satomi frontend with Vite + React"

# ── commit 7: VRM character + animations ─────────────────────────
cp_if "artifacts/satomi/src/components"
cp_if "artifacts/satomi/src/lib"
git add -A && git commit -m "feat: add VRM 3D character with procedural animations"

# ── commit 8: streaming UI + hooks ───────────────────────────────
cp_if "artifacts/satomi/src/pages"
cp_if "artifacts/satomi/src/hooks"
cp_if "artifacts/satomi/src/App.tsx"
cp_if "artifacts/satomi/src/main.tsx"
cp_if "artifacts/satomi/src/index.css"
git add -A && git commit -m "feat: add streaming UI, speech, and chat hooks"

# ── commit 9: public assets ───────────────────────────────────────
cp_if "artifacts/satomi/public"
git add -A && git commit -m "chore: add public assets and VRM model"

# ── commit 10: satomi.config ──────────────────────────────────────
cp_if "satomi.config.ts"
git add -A && git commit -m "chore: add Satomi project config"

# ── commit 11: CI / GitHub Actions ───────────────────────────────
cp_if ".github"
git add -A && git commit -m "ci: add GitHub Actions deploy workflow"

# ── commit 12: scripts ────────────────────────────────────────────
cp_if "scripts"
git add -A && git commit -m "chore: add deployment and utility scripts"

# ── commit 13: docs ───────────────────────────────────────────────
for f in SATOMI_README.md SETUP.md; do
  cp_if "$f"
done
git add -A && git commit -m "docs: add project documentation"

echo ""
git log --oneline
echo ""
echo "Pushing to GitHub..."
git remote add origin "https://${TOKEN}@github.com/${ORG}/${REPO}.git"
git push origin main --force

cd /home/runner/workspace
rm -rf "$DEPLOY_DIR"
echo ""
echo "Done! https://github.com/${ORG}/${REPO}"
