#!/bin/bash
set -e

TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN}"
ORG="satominakamichi"
REPO="satominakamichi.github.io"

if [ -z "$TOKEN" ]; then
  echo "ERROR: GITHUB_PERSONAL_ACCESS_TOKEN not set"
  exit 1
fi

echo "Creating clean repo snapshot..."
DEPLOY_DIR=$(mktemp -d)

# Copy workspace files, excluding Replit/attached/build artifacts
cp -r /home/runner/workspace/. "$DEPLOY_DIR/"
rm -rf "$DEPLOY_DIR/.git" \
       "$DEPLOY_DIR/.replit" \
       "$DEPLOY_DIR/.replitignore" \
       "$DEPLOY_DIR/replit.md" \
       "$DEPLOY_DIR/.agents" \
       "$DEPLOY_DIR/.cache" \
       "$DEPLOY_DIR/.config" \
       "$DEPLOY_DIR/.local" \
       "$DEPLOY_DIR/attached_assets" \
       "$DEPLOY_DIR/node_modules"
find "$DEPLOY_DIR" -name 'node_modules' -type d -prune -exec rm -rf {} +
find "$DEPLOY_DIR" -path '*/dist/public' -type d -prune -exec rm -rf {} +

cd "$DEPLOY_DIR"
git init
git config user.email "kai-liam@users.noreply.github.com"
git config user.name "liam"
git checkout -b main
git add -A
git commit -m "feat: Satomi Nakamichi AI streaming site"

echo "Pushing to GitHub..."
git remote add origin "https://${TOKEN}@github.com/${ORG}/${REPO}.git"
git push origin main --force

cd /home/runner/workspace
rm -rf "$DEPLOY_DIR"

echo ""
echo "Done! Check: https://github.com/${ORG}/${REPO}"
