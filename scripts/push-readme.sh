#!/bin/bash
set -e

TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN}"
ORG="satominakamichi"
REPO="satominakamichi.github.io"
EMAIL="kai-liam@users.noreply.github.com"
NAME="liam"

CLONE_DIR=$(mktemp -d)
echo "Cloning repo..."
git clone "https://${TOKEN}@github.com/${ORG}/${REPO}.git" "$CLONE_DIR"

cd "$CLONE_DIR"
git config user.email "$EMAIL"
git config user.name "$NAME"

cp /home/runner/workspace/README.md "$CLONE_DIR/README.md"
# Remove old docs that don't match the project
rm -f "$CLONE_DIR/SATOMI_README.md" "$CLONE_DIR/SETUP.md"

git add -A
git commit -m "docs: add project README with architecture diagrams"

echo "Pushing..."
git push origin main

cd /home/runner/workspace
rm -rf "$CLONE_DIR"
echo "Done!"
