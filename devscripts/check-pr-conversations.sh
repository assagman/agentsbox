#!/usr/bin/env bash
# check-pr-conversations.sh - Check GitHub PR review conversation status
# Usage: ./check-pr-conversations.sh <pr-number>

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -ne 1 ]; then
    echo "Usage: $0 <pr-number>"
    echo "Example: $0 123"
    exit 1
fi

PR_NUMBER="$1"

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: 'gh' CLI not found. Install it first.${NC}"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: 'jq' not found. Install it first.${NC}"
    exit 1
fi

echo -e "${BLUE}Fetching PR #${PR_NUMBER} review conversations...${NC}\n"

# Get repository info
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Fetch review comments using GraphQL API (paginated)
QUERY=$(cat <<'EOF'
query($owner: String!, $repo: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 50, after: $endCursor) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          comments(first: 10) {
            nodes {
              id
              body
              author {
                login
              }
              createdAt
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
EOF
)

# Parse owner and repo
OWNER=$(echo "$REPO" | cut -d'/' -f1)
REPO_NAME=$(echo "$REPO" | cut -d'/' -f2)

# Execute paginated GraphQL query and merge thread nodes across pages
THREADS=$(
  gh api graphql --paginate \
    -f query="$QUERY" \
    -f owner="$OWNER" \
    -f repo="$REPO_NAME" \
    -F number="$PR_NUMBER" \
    -F endCursor=null \
  | jq -s '[.[].data.repository.pullRequest.reviewThreads.nodes[]]'
)

# Count totals
TOTAL=$(echo "$THREADS" | jq 'length')
RESOLVED=$(echo "$THREADS" | jq '[.[] | select(.isResolved == true)] | length')
UNRESOLVED=$(echo "$THREADS" | jq '[.[] | select(.isResolved == false)] | length')
OUTDATED=$(echo "$THREADS" | jq '[.[] | select(.isOutdated == true)] | length')

# Display summary
echo "══════════════════════════════════════════════════════════"
echo -e "${BLUE}PR #${PR_NUMBER} Review Conversation Status${NC}"
echo -e "${CYAN}Repository: ${REPO}${NC}"
echo "══════════════════════════════════════════════════════════"
printf "%-30s %s\n" "Total conversations:" "${BLUE}${TOTAL}${NC}"
printf "%-30s %s\n" "✓ Resolved:" "${GREEN}${RESOLVED}${NC}"
printf "%-30s %s\n" "⚠ Unresolved:" "${YELLOW}${UNRESOLVED}${NC}"
printf "%-30s %s\n" "⌛ Outdated:" "${CYAN}${OUTDATED}${NC}"
echo "══════════════════════════════════════════════════════════"
echo ""

# Calculate percentage
if [ "$TOTAL" -gt 0 ]; then
    PERCENT=$((RESOLVED * 100 / TOTAL))
    echo -e "Progress: ${GREEN}${RESOLVED}/${TOTAL}${NC} (${PERCENT}%)"
    
    # Progress bar
    FILLED=$((PERCENT / 5))
    EMPTY=$((20 - FILLED))
    printf "["
    printf "%${FILLED}s" | tr ' ' '█'
    printf "%${EMPTY}s" | tr ' ' '░'
    printf "] ${PERCENT}%%\n\n"
fi

# If no unresolved threads, exit
if [ "$UNRESOLVED" -eq 0 ]; then
    echo -e "${GREEN}✓ All conversations resolved!${NC}"
    exit 0
fi

# Display unresolved threads
echo -e "${YELLOW}═══ Unresolved Conversations ═══${NC}\n"

COUNTER=1
echo "$THREADS" | jq -c '.[] | select(.isResolved == false)' | while IFS= read -r thread; do
    THREAD_ID=$(echo "$thread" | jq -r '.id')
    FILE=$(echo "$thread" | jq -r '.path // "unknown"')
    LINE=$(echo "$thread" | jq -r '.line // "N/A"')
    OUTDATED_FLAG=$(echo "$thread" | jq -r '.isOutdated')
    FIRST_COMMENT=$(echo "$thread" | jq -r '.comments.nodes[0].body // "N/A"' | head -c 100)
    AUTHOR=$(echo "$thread" | jq -r '.comments.nodes[0].author.login // "unknown"')
    COMMENT_COUNT=$(echo "$thread" | jq '.comments.nodes | length')
    
    echo -e "${COUNTER}. ${YELLOW}${FILE}:${LINE}${NC}"
    echo -e "   ${CYAN}Thread ID:${NC} ${THREAD_ID}"
    echo -e "   ${CYAN}Author:${NC} ${AUTHOR}"
    echo -e "   ${CYAN}Comments:${NC} ${COMMENT_COUNT}"
    if [ "$OUTDATED_FLAG" = "true" ]; then
        echo -e "   ${CYAN}Status:${NC} ⌛ Outdated"
    fi
    echo -e "   ${CYAN}Preview:${NC} ${FIRST_COMMENT}..."
    echo ""
    COUNTER=$((COUNTER + 1))
done

# Summary actions
echo -e "${BLUE}═══ Suggested Actions ═══${NC}"
echo ""
echo "To resolve outdated/invalid threads, use:"
echo -e "  ${CYAN}gh pr review ${PR_NUMBER} --comment --body 'Resolving as outdated/fixed'${NC}"
echo ""
echo "Or resolve individual threads via GitHub UI:"
echo -e "  ${CYAN}https://github.com/${REPO}/pull/${PR_NUMBER}/files${NC}"

exit 0
