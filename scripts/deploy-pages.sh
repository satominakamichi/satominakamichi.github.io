#!/bin/bash
set -e

TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN}"
ORG="satominakamichi"
REPO="satominakamichi.github.io"

if [ -z "$TOKEN" ]; then
  echo "ERROR: GITHUB_PERSONAL_ACCESS_TOKEN not set"
  exit 1
fi

echo "Building Satomi frontend..."
cd /home/runner/workspace/artifacts/satomi
BASE_PATH=/ pnpm build
cd /home/runner/workspace

echo "Preparing gh-pages branch..."
DIST_DIR="artifacts/satomi/dist/public"

# Setup temp deploy dir
DEPLOY_DIR=$(mktemp -d)
cp -r "$DIST_DIR/." "$DEPLOY_DIR/"

# Init git in deploy dir
cd "$DEPLOY_DIR"
git init
git config user.email "kai-liam@users.noreply.github.com"
git config user.name "liam"
git checkout -b gh-pages
git add -A
git commit -m "deploy: satomi frontend"

echo "Pushing gh-pages branch..."
git remote add origin "https://${TOKEN}@github.com/${ORG}/${REPO}.git"
git push origin gh-pages --force

cd /home/runner/workspace
rm -rf "$DEPLOY_DIR"

echo ""
echo "Done! gh-pages branch pushed."
echo "Go to: https://github.com/${ORG}/${REPO}/settings/pages"
echo "Set Branch to: gh-pages"
