#!/bin/bash
set -e

TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN}"
ORG="satominakamichi"
REPO="satominakamichi.github.io"

echo "Fetching workflow runs..."
RUNS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/${ORG}/${REPO}/actions/runs?per_page=100" \
  | grep '"id"' | grep -o '[0-9]\{8,\}')

COUNT=0
for RUN_ID in $RUNS; do
  curl -s -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "https://api.github.com/repos/${ORG}/${REPO}/actions/runs/${RUN_ID}" \
    > /dev/null
  echo "Deleted run: $RUN_ID"
  COUNT=$((COUNT + 1))
done

echo ""
echo "Deleted $COUNT workflow runs."
