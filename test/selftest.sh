#!/usr/bin/env bash
# End-to-end self test: scaffold a throwaway repo and exercise every command.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
step() { printf '\n> %s\n' "$*"; }

cd "$WORK"
git init -q
git config user.email "test@example.com"
git config user.name "docs-system selftest"
mkdir -p src/core
printf 'export const a = 1;\n' > src/core/a.ts
printf '{"name":"fixture","scripts":{"test":"echo ok"}}\n' > package.json
git add -A && git commit -qm "init"

step "init"
node "$ROOT/scripts/docs-tool.mjs" init --root . --name fixture --owner "@acme/docs" --test "npm test" > /dev/null
test -f AGENTS.md || fail "AGENTS.md not generated"
test -f scripts/docs-tool.mjs || fail "tool not copied"
test -f .github/workflows/docs.yml || fail "workflow not generated"

step "check (fresh scaffold)"
node scripts/docs-tool.mjs check > /dev/null || fail "check failed on fresh scaffold"

step "audit"
node scripts/docs-tool.mjs audit > /dev/null || fail "audit failed"

step "init is idempotent"
node "$ROOT/scripts/docs-tool.mjs" init --root . > /dev/null
grep -q "docs-tool" AGENTS.md || fail "AGENTS.md was clobbered"

step "index coverage is enforced"
cat > docs/product/extra.md <<'EOF'
---
id: product/extra
title: Extra
owner: "@acme/docs"
status: active
tier: 3
last_reviewed: 2026-01-01
review_interval_days: 180
---
# Extra
EOF
if node scripts/docs-tool.mjs check > /dev/null 2>&1; then fail "unindexed doc was accepted"; fi
printf -- '- [Extra](product/extra.md)\n' >> docs/index.md
node scripts/docs-tool.mjs check > /dev/null || fail "indexed doc still rejected"

step "drift blocks untouched docs"
cat >> docs.map.yaml <<'EOF'

- docs: ["docs/architecture/modules/README.md"]
  sources: ["src/core/**"]
EOF
git add -A && git commit -qm "map"
printf '// change\n' >> src/core/a.ts
git add -A && git commit -qm "source only"
if node scripts/docs-tool.mjs drift --base HEAD~1 > /dev/null 2>&1; then fail "drift did not fail"; fi
node scripts/docs-tool.mjs drift --base HEAD~1 --labels docs-not-needed > /dev/null \
  || fail "docs-not-needed label was not honored"

step "archived docs are read-only"
mkdir -p docs/archive/2026
cat > docs/archive/2026/old.md <<'EOF'
---
id: archive/2026/old
title: Old
owner: "@acme/docs"
status: archived
tier: 1
archived_at: 2026-01-05
archived_reason: superseded
superseded_by: docs/runbooks/deploy.md
---
# Old
EOF
git add -A && git commit -qm "archive"
printf 'tamper\n' >> docs/archive/2026/old.md
git add -A && git commit -qm "tamper"
if node scripts/docs-tool.mjs drift --base HEAD~1 > /dev/null 2>&1; then fail "archive edit was allowed"; fi

printf '\nAll checks passed.\n'
