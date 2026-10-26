#!/usr/bin/env sh
# Excerpt: .husky/pre-commit
# Runs on every commit, in this order. Any step failing blocks the commit.
set -eu

# 1. No secrets leave the machine. Staged diff only, output redacted.
git diff --cached --no-ext-diff --unified=0 | gitleaks stdin --config .gitleaks.toml --redact --no-banner

# 2. Fix and format what is being committed.
npx lint-staged

# 3. Format check, lint and typecheck across the WHOLE project, not just staged files.
pnpm run quality

# 4. A commit that doesn't build doesn't land.
pnpm run build
