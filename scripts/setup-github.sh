#!/bin/bash
set -e

TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN}"
ORG="satominakamichi"
REPO="satominakamichi.github.io"
EMAIL="kai-liam@users.noreply.github.com"
NAME="liam"
SRC="/home/runner/workspace"

# ── 1. Create repo ─────────────────────────────────────────────────
echo "Creating repo..."
STATUS=$(curl -s -o /tmp/repo_response.json -w "%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  "https://api.github.com/orgs/${ORG}/repos" \
  -d "{\"name\":\"${REPO}\",\"private\":false,\"auto_init\":false}")

if [ "$STATUS" = "201" ]; then
  echo "Repo created."
elif [ "$STATUS" = "422" ]; then
  echo "Repo already exists, continuing."
else
  echo "Unexpected status: $STATUS"
  cat /tmp/repo_response.json
  exit 1
fi

# ── 2. Build fresh main with staged commits ────────────────────────
DEPLOY_DIR=$(mktemp -d)
echo "Building commit history in $DEPLOY_DIR..."

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

cd "$DEPLOY_DIR"
git init
git config user.email "$EMAIL"
git config user.name "$NAME"
git checkout -b main

# commit 1
for f in .gitignore .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json; do
  cp_if "$f"
done
git add -A && git commit -m "chore: init pnpm monorepo"

# commit 2
cp_if "lib"
git add -A && git commit -m "chore: add shared lib"

# commit 3
for f in artifacts/api-server/package.json artifacts/api-server/tsconfig.json artifacts/api-server/build.mjs; do
  cp_if "$f"
done
mkdir -p "$DEPLOY_DIR/artifacts/api-server/src"
git add -A && git commit -m "feat: scaffold API server"

# commit 4
cp_if "artifacts/api-server/src/services"
git add -A && git commit -m "feat: add AI, TTS, and Twitter services"

# commit 5
cp_if "artifacts/api-server/src/routes"
cp_if "artifacts/api-server/src/index.ts"
cp_if "artifacts/api-server/src/ws.ts"
git add -A && git commit -m "feat: add Satomi API routes and WebSocket server"

# commit 6
for f in artifacts/satomi/package.json artifacts/satomi/tsconfig.json artifacts/satomi/vite.config.ts artifacts/satomi/tailwind.config.ts artifacts/satomi/index.html artifacts/satomi/postcss.config.js; do
  cp_if "$f"
done
mkdir -p "$DEPLOY_DIR/artifacts/satomi/src"
git add -A && git commit -m "feat: scaffold Satomi frontend"

# commit 7
cp_if "artifacts/satomi/src/components"
cp_if "artifacts/satomi/src/lib"
git add -A && git commit -m "feat: add VRM character with procedural animations"

# commit 8
cp_if "artifacts/satomi/src/pages"
cp_if "artifacts/satomi/src/hooks"
cp_if "artifacts/satomi/src/App.tsx"
cp_if "artifacts/satomi/src/main.tsx"
cp_if "artifacts/satomi/src/index.css"
git add -A && git commit -m "feat: add streaming UI, speech queue, and chat"

# commit 9
cp_if "artifacts/satomi/public"
git add -A && git commit -m "chore: add public assets and VRM model"

# commit 10
cp_if "satomi.config.ts"
cp_if ".github"
git add -A && git commit -m "ci: add GitHub Actions deploy workflow"

# commit 11
cp_if "scripts"
git add -A && git commit -m "chore: add deployment scripts"

# commit 12 — README
cp "$SRC/README.md" "$DEPLOY_DIR/README.md"
git add -A && git commit -m "docs: add project README with architecture diagrams"

echo ""
git log --oneline
echo ""

# ── 3. Push main ───────────────────────────────────────────────────
echo "Pushing main..."
git remote add origin "https://${TOKEN}@github.com/${ORG}/${REPO}.git"
git push origin main --force

# ── 4. Build and push gh-pages ─────────────────────────────────────
echo "Building frontend..."
cd "$SRC/artifacts/satomi"
BASE_PATH=/ pnpm build
cd "$SRC"

PAGES_DIR=$(mktemp -d)
cp -r "$SRC/artifacts/satomi/dist/public/." "$PAGES_DIR/"
cd "$PAGES_DIR"
git init
git config user.email "$EMAIL"
git config user.name "$NAME"
git checkout -b gh-pages
git add -A
git commit -m "deploy: Satomi Nakamichi streaming site"
git remote add origin "https://${TOKEN}@github.com/${ORG}/${REPO}.git"
git push origin gh-pages --force

cd "$SRC"
rm -rf "$DEPLOY_DIR" "$PAGES_DIR"

echo ""
echo "All done!"
echo "Repo:  https://github.com/${ORG}/${REPO}"
echo "Pages: https://${ORG}.github.io"
