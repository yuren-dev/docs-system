#!/usr/bin/env node
/**
 * docs-tool.mjs — zero-dependency documentation system tool.
 *
 * Commands
 *   init   Scaffold the docs system into a repo (run from the skill bundle).
 *   check  Validate front-matter, index coverage, links, code-path references.
 *   drift  Fail a PR when mapped source files changed without their docs.
 *   audit  Report documents whose review interval has elapsed.
 *
 * Design constraints: Node >= 18, no npm dependencies, never mutates a doc
 * except in `init`. Exit codes: 0 ok, 1 findings, 2 usage or internal error.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATUSES = ['draft', 'active', 'stale', 'deprecated', 'archived'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', 'target', '.venv', 'venv', '__pycache__']);

const C = process.stdout.isTTY
  ? { red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m', dim: '\x1b[2m', bold: '\x1b[1m', off: '\x1b[0m' }
  : { red: '', yellow: '', green: '', dim: '', bold: '', off: '' };

// ---------------------------------------------------------------- arg parsing

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq !== -1) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[a.slice(2)] = next; i++; }
    else out[a.slice(2)] = true;
  }
  return out;
}

// ---------------------------------------------------------------- yaml subset

function unquote(v) {
  const s = String(v).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}

function parseValue(raw) {
  const s = String(raw).trim();
  if (s.startsWith('[') && s.endsWith(']')) {
    return s.slice(1, -1).split(',').map((x) => unquote(x)).filter((x) => x !== '');
  }
  const u = unquote(s);
  if (u === 'true') return true;
  if (u === 'false') return false;
  if (u === 'null' || u === '~' || u === '') return null;
  if (/^-?\d+$/.test(u)) return Number(u);
  return u;
}

/** Front-matter only needs top-level scalars and one-level lists. */
function parseFrontMatter(text) {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!src.startsWith('---')) return { data: {}, body: src, found: false };
  const close = src.indexOf('\n---', 3);
  if (close === -1) return null;
  const raw = src.slice(src.indexOf('\n', 3) + 1, close);
  const data = {};
  let listKey = null;
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (top) {
      const [, key, value] = top;
      if (value.trim() === '') { data[key] = []; listKey = key; }
      else { data[key] = parseValue(value); listKey = null; }
      continue;
    }
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey && Array.isArray(data[listKey])) data[listKey].push(parseValue(item[1]));
  }
  const bodyStart = src.indexOf('\n', close + 4);
  return { data, body: bodyStart === -1 ? '' : src.slice(bodyStart + 1), found: true };
}

/** docs.map.yaml is a flat list of {docs, sources, note}; JSON is also accepted. */
function loadDocMap(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.json')) return JSON.parse(text);
  const items = [];
  let cur = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const start = line.match(/^\s*-\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (start) {
      cur = {};
      items.push(cur);
      cur[start[1]] = parseValue(start[2]);
      continue;
    }
    const kv = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv && cur) cur[kv[1]] = parseValue(kv[2]);
  }
  return items
    .map((it) => ({ docs: asArray(it.docs), sources: asArray(it.sources), note: it.note ?? '' }))
    .filter((m) => m.docs.length && m.sources.length);
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null || v === '') return [];
  return [v];
}

// ---------------------------------------------------------------- fs helpers

const toPosix = (p) => p.split(path.sep).join('/');

function walk(dir, opts = {}) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (opts.skipUnderscore && entry.name.startsWith('_')) continue;
        stack.push(full);
      } else if (entry.isFile()) {
        if (!opts.ext || opts.ext.some((e) => entry.name.endsWith(e))) out.push(full);
      }
    }
  }
  return out;
}

function globToRegExp(glob) {
  const g = glob.replace(/^\/+/, '');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('\\^$+.|()[]{}'.includes(c)) re += `\\${c}`;
    else re += c;
  }
  return new RegExp(`^${re}$`);
}

const matchesGlob = (glob, file) => globToRegExp(glob).test(file);

function todayISO() { return new Date().toISOString().slice(0, 10); }

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function isValidISO(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

// ---------------------------------------------------------------- doc model

function resolvePaths(opt) {
  const root = path.resolve(opt.root ?? process.cwd());
  const docsRel = toPosix(opt.docs ?? 'docs').replace(/^\.\//, '').replace(/\/$/, '');
  const docsDir = path.join(root, docsRel);
  return { root, docsDir, docsRel };
}

function loadDocs(root, docsDir) {
  return walk(docsDir, { ext: ['.md'], skipUnderscore: true }).map((file) => {
    const rel = toPosix(path.relative(root, file));
    const text = fs.readFileSync(file, 'utf8');
    const fm = parseFrontMatter(text);
    return { file, rel, text, fm };
  });
}

function isUnderArchive(rel) {
  return /(^|\/)archive\//.test(rel);
}

// ---------------------------------------------------------------- check

function cmdCheck(opt) {
  const { root, docsDir, docsRel } = resolvePaths(opt);
  const errors = [];
  const warnings = [];
  const add = (level, file, message) => (level === 'error' ? errors : warnings).push({ file, message });

  if (!fs.existsSync(docsDir)) {
    console.error(`${C.red}docs directory not found:${C.off} ${docsDir}`);
    return 2;
  }

  const docs = loadDocs(root, docsDir);
  if (!docs.length) add('error', docsRel, 'no markdown documents found');

  // A single walk of the repo supports source_of_truth glob checks.
  const repoFiles = walk(root, { ext: [''] }).map((f) => toPosix(path.relative(root, f)));

  const seenIds = new Map();

  for (const doc of docs) {
    const { rel, fm } = doc;
    if (fm === null) { add('error', rel, 'front-matter is not closed with ---'); continue; }
    if (!fm.found) { add('error', rel, 'missing front-matter block'); continue; }
    const d = fm.data;

    if (!d.id) add('error', rel, 'front-matter: missing `id`');
    if (!d.title) add('error', rel, 'front-matter: missing `title`');
    if (!d.owner) add('error', rel, 'front-matter: missing `owner`');
    if (!d.status) add('error', rel, 'front-matter: missing `status`');
    if (d.status && !STATUSES.includes(d.status)) add('error', rel, `front-matter: invalid status "${d.status}" (allowed: ${STATUSES.join(', ')})`);
    if (d.tier === undefined || d.tier === null) add('error', rel, 'front-matter: missing `tier` (1-4)');
    else if (![1, 2, 3, 4].includes(Number(d.tier))) add('error', rel, `front-matter: tier must be 1-4, got "${d.tier}"`);

    if (d.id) {
      if (seenIds.has(d.id)) add('error', rel, `duplicate id "${d.id}" (also in ${seenIds.get(d.id)})`);
      else seenIds.set(d.id, rel);
    }

    const archived = d.status === 'archived';
    if (archived) {
      if (!isValidISO(d.archived_at)) add('error', rel, 'archived doc requires `archived_at: YYYY-MM-DD`');
      if (!d.superseded_by && !d.archived_reason) add('error', rel, 'archived doc requires `superseded_by` or `archived_reason`');
      if (!isUnderArchive(rel)) add('error', rel, 'status is archived but the file is not under archive/');
    } else if (isUnderArchive(rel) && !/archive\/README\.md$/.test(rel)) {
      add('error', rel, 'file lives under archive/ but status is not archived');
    }

    if (['active', 'stale', 'deprecated'].includes(d.status)) {
      if (!isValidISO(d.last_reviewed)) add('error', rel, 'requires `last_reviewed: YYYY-MM-DD`');
      const interval = d.review_interval_days ?? 180;
      if (!Number.isFinite(Number(interval)) || Number(interval) < 1) add('error', rel, '`review_interval_days` must be a positive integer');
    }

    for (const glob of asArray(d.source_of_truth)) {
      if (typeof glob !== 'string' || !glob.trim()) { add('error', rel, '`source_of_truth` entries must be repo-relative paths'); continue; }
      if (glob.startsWith('/') || glob.includes('..')) add('error', rel, `\`source_of_truth\` must be repo-relative without "..": ${glob}`);
      const hit = repoFiles.some((f) => matchesGlob(glob, f));
      if (!hit) add('error', rel, `\`source_of_truth\` matches no file: ${glob}`);
    }

    // Internal markdown links must resolve.
    for (const m of doc.text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1].trim();
      if (/^(https?:|mailto:|tel:|#)/.test(target)) continue;
      if (target.includes('{{')) continue;
      const clean = decodeURIComponent(target.split('#')[0]);
      if (!clean) continue;
      const base = clean.startsWith('/') ? root : path.dirname(doc.file);
      const resolved = path.resolve(base, clean.replace(/^\//, ''));
      if (fs.existsSync(resolved)) continue;
      if (!path.extname(resolved) && fs.existsSync(`${resolved}.md`)) continue;
      add('error', rel, `broken link: ${target}`);
    }
  }

  // Index coverage: every maintained doc must be reachable from docs/index.md.
  const indexPath = path.join(docsDir, 'index.md');
  if (!fs.existsSync(indexPath)) {
    add('error', `${docsRel}/index.md`, 'missing index.md (the single navigation source)');
  } else {
    const indexText = fs.readFileSync(indexPath, 'utf8');
    for (const doc of docs) {
      const d = doc.fm?.data ?? {};
      if (doc.rel === `${docsRel}/index.md`) continue;
      if (d.index === false || d.status === 'archived') continue;
      const relFromDocs = doc.rel.slice(docsRel.length + 1);
      const normalizedIndex = indexText.replace(/^\.\//gm, '');
      if (!normalizedIndex.includes(doc.rel) && !normalizedIndex.includes(relFromDocs)) {
        add('error', doc.rel, `not listed in ${docsRel}/index.md`);
      }
    }
  }

  // Optional docs.map.yaml sanity: referenced docs must exist.
  const mapPath = path.join(root, opt.map ?? 'docs.map.yaml');
  if (fs.existsSync(mapPath)) {
    for (const entry of loadDocMap(mapPath)) {
      for (const docPath of entry.docs) {
        if (!fs.existsSync(path.join(root, docPath))) add('error', toPosix(path.relative(root, mapPath)), `maps to a missing doc: ${docPath}`);
      }
    }
  }

  report(opt, { errors, warnings, docs, root });
  return errors.length ? 1 : 0;
}

// ---------------------------------------------------------------- drift

function gitChanged(root, base) {
  const run = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    return run(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]).split('\n').filter(Boolean);
  } catch {
    try {
      return run(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']).split('\n').filter(Boolean);
    } catch (err) {
      throw new Error(`cannot read git diff for base "${base}": ${err.message}`);
    }
  }
}

function cmdDrift(opt) {
  const { root, docsDir } = resolvePaths(opt);
  const base = opt.base ?? process.env.DOCS_BASE ?? 'origin/main';
  const labels = String(opt.labels ?? process.env.DOCS_LABELS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const skipLabel = opt.skipLabel ?? 'docs-not-needed';
  const skip = labels.includes(skipLabel);
  const errors = [];
  const warnings = [];

  let changed;
  try { changed = gitChanged(root, base); }
  catch (err) { console.error(`${C.red}${err.message}${C.off}`); return 2; }

  if (!changed.length) {
    console.log(`${C.dim}no changed files against ${base}${C.off}`);
    return 0;
  }

  const changedSet = new Set(changed.map(toPosix));
  const mapPath = path.join(root, opt.map ?? 'docs.map.yaml');

  if (fs.existsSync(mapPath)) {
    for (const entry of loadDocMap(mapPath)) {
      const touchedSources = changed.filter((f) => entry.sources.some((g) => matchesGlob(g, f)));
      if (!touchedSources.length) continue;
      const touchedDocs = entry.docs.filter((d) => changedSet.has(d));
      const docsExist = entry.docs.every((d) => fs.existsSync(path.join(root, d)));
      if (!docsExist) {
        errors.push({ file: toPosix(path.relative(root, mapPath)), message: `maps to a missing doc: ${entry.docs.filter((d) => !fs.existsSync(path.join(root, d))).join(', ')}` });
        continue;
      }
      if (touchedDocs.length) continue;
      const message = `source changed without updating ${entry.docs.join(', ')} (touched: ${touchedSources.slice(0, 3).join(', ')}${touchedSources.length > 3 ? ', …' : ''})`;
      if (skip) warnings.push({ file: toPosix(path.relative(root, mapPath)), message: `${message} [skipped via ${skipLabel}]` });
      else errors.push({ file: toPosix(path.relative(root, mapPath)), message });
    }
  } else {
    warnings.push({ file: 'docs.map.yaml', message: 'no docs.map.yaml; drift checks are inactive' });
  }

  // Archived documents are frozen except for their tombstone metadata.
  if (!opt.allowArchiveChanges) {
    for (const rel of changed) {
      if (!rel.endsWith('.md')) continue;
      const abs = path.join(root, rel);
      if (!fs.existsSync(abs)) continue;
      const fm = parseFrontMatter(fs.readFileSync(abs, 'utf8'));
      if (fm?.data?.status === 'archived') errors.push({ file: rel, message: 'archived document was modified; archive entries are read-only' });
    }
  }

  report(opt, { errors, warnings, docs: [], root });
  return errors.length ? 1 : 0;
}

// ---------------------------------------------------------------- audit

function cmdAudit(opt) {
  const { root, docsDir, docsRel } = resolvePaths(opt);
  const docs = loadDocs(root, docsDir);
  const today = new Date();
  const rows = [];

  for (const doc of docs) {
    const d = doc.fm?.data ?? {};
    if (!['active', 'stale', 'deprecated'].includes(d.status)) continue;
    if (!isValidISO(d.last_reviewed)) continue;
    const interval = Number(d.review_interval_days ?? 180);
    const due = addDays(d.last_reviewed, interval);
    const overdueDays = Math.floor((today - due) / 86400000);
    if (overdueDays <= 0) continue;
    rows.push({ file: doc.rel, owner: d.owner ?? 'unowned', tier: Number(d.tier ?? 4), due: due.toISOString().slice(0, 10), overdueDays, verified_by: d.verified_by ?? '' });
  }

  rows.sort((a, b) => a.tier - b.tier || b.overdueDays - a.overdueDays);

  if (opt.json) {
    console.log(JSON.stringify({ generated_at: today.toISOString(), overdue: rows }, null, 2));
  } else {
    console.log(`${C.bold}docs audit${C.off} — ${todayISO()} — ${rows.length} overdue of ${docs.length} documents`);
    if (rows.length) {
      console.log('');
      console.log('| doc | tier | owner | due | overdue | verify |');
      console.log('|---|---|---|---|---|---|');
      for (const r of rows) console.log(`| \`${r.file}\` | T${r.tier} | ${r.owner} | ${r.due} | ${r.overdueDays}d | ${r.verified_by} |`);
    }
  }

  if (opt.write) {
    const target = path.resolve(root, opt.write === true ? `${docsRel}/_meta/audit.md` : opt.write);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const lines = [
      '# Documentation audit',
      '',
      `Generated: ${todayISO()} — ${rows.length} overdue.`,
      '',
      '| doc | tier | owner | due | overdue | verify |',
      '|---|---|---|---|---|---|',
      ...rows.map((r) => `| \`${r.file}\` | T${r.tier} | ${r.owner} | ${r.due} | ${r.overdueDays}d | ${r.verified_by} |`),
      '',
      'Review each entry, then choose: confirm (bump `last_reviewed`), update, or archive.',
    ];
    fs.writeFileSync(target, `${lines.join('\n')}\n`);
    console.log(`${C.dim}wrote ${toPosix(path.relative(root, target))}${C.off}`);
  }

  if (opt.strict) {
    const blocking = rows.filter((r) => r.tier <= 2);
    if (blocking.length) {
      console.error(`${C.red}${blocking.length} tier-1/2 document(s) overdue${C.off}`);
      return 1;
    }
  }
  return 0;
}

// ---------------------------------------------------------------- init

const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

function render(text, ctx) {
  return text.replace(PLACEHOLDER, (all, key) => (key in ctx ? ctx[key] : all));
}

function cmdInit(opt) {
  const root = path.resolve(opt.root ?? process.cwd());
  const docsRel = toPosix(opt.docs ?? 'docs');
  const templateRoot = path.resolve(opt.templates ?? path.join(TOOL_DIR, '..', 'templates'));
  if (!fs.existsSync(templateRoot)) {
    console.error(`${C.red}templates not found:${C.off} ${templateRoot}\nRun \`init\` from the skill bundle (scripts/docs-tool.mjs), or pass --templates <dir>.`);
    return 2;
  }

  const ctx = {
    PROJECT_NAME: opt.name ?? path.basename(root),
    OWNER: opt.owner ?? '@your-team',
    DATE: todayISO(),
    DOCS_DIR: docsRel,
    TEST_CMD: opt.test ?? 'npm test',
    INSTALL_CMD: opt.install ?? 'npm install',
    REPO: opt.repo ?? '',
  };

  const dry = Boolean(opt['dry-run']);
  const force = Boolean(opt.force);
  const actions = [];

  const writeFile = (rel, content, mode) => {
    const target = path.join(root, rel);
    if (fs.existsSync(target) && !force) { actions.push(['skip', rel, 'already exists']); return; }
    actions.push(['write', rel, '']);
    if (dry) return;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    if (mode) fs.chmodSync(target, mode);
  };

  const copyTree = (srcDir, dstRel, { transform = true } = {}) => {
    for (const file of walk(srcDir, { ext: [''] })) {
      const rel = toPosix(path.relative(srcDir, file));
      const targetRel = `${dstRel}/${rel}`;
      const raw = fs.readFileSync(file, 'utf8');
      writeFile(targetRel, transform ? render(raw, ctx) : raw);
    }
  };

  copyTree(path.join(templateRoot, 'docs'), docsRel);

  const agentsTarget = path.join(root, 'AGENTS.md');
  if (fs.existsSync(agentsTarget) && !force) {
    const snippet = render(fs.readFileSync(path.join(templateRoot, 'AGENTS.template.md'), 'utf8'), ctx);
    writeFile(`${docsRel}/_meta/AGENTS.snippet.md`, snippet);
    actions.push(['merge', 'AGENTS.md', 'exists; snippet written to docs/_meta/AGENTS.snippet.md']);
  } else {
    writeFile('AGENTS.md', render(fs.readFileSync(path.join(templateRoot, 'AGENTS.template.md'), 'utf8'), ctx));
  }

  writeFile('docs.map.yaml', render(fs.readFileSync(path.join(templateRoot, 'docs.map.yaml'), 'utf8'), ctx));
  writeFile('.github/PULL_REQUEST_TEMPLATE.md', render(fs.readFileSync(path.join(templateRoot, 'PULL_REQUEST_TEMPLATE.md'), 'utf8'), ctx));

  const workflow = render(fs.readFileSync(path.join(templateRoot, 'docs.workflow.yml'), 'utf8'), ctx);
  writeFile('.github/workflows/docs.yml', workflow);

  if (!fs.existsSync(path.join(root, '.github/CODEOWNERS'))) {
    writeFile('.github/CODEOWNERS', `# Documentation ownership\n/${docsRel}/ ${ctx.OWNER}\n/${docsRel}/runbooks/ ${ctx.OWNER}\n`);
  }

  const selfPath = path.join(TOOL_DIR, 'docs-tool.mjs');
  const toolTarget = path.join(root, 'scripts/docs-tool.mjs');
  if (path.resolve(selfPath) === path.resolve(toolTarget)) {
    actions.push(['keep', 'scripts/docs-tool.mjs', 'already in place']);
  } else if (fs.existsSync(toolTarget) && !force) {
    actions.push(['skip', 'scripts/docs-tool.mjs', 'already exists']);
  } else {
    actions.push(['write', 'scripts/docs-tool.mjs', '']);
    if (!dry) {
      fs.mkdirSync(path.dirname(toolTarget), { recursive: true });
      fs.copyFileSync(selfPath, toolTarget);
      fs.chmodSync(toolTarget, 0o755);
    }
  }

  const width = Math.max(...actions.map((a) => a[0].length));
  for (const [verb, rel, note] of actions) {
    const color = verb === 'write' ? C.green : verb === 'skip' ? C.dim : C.yellow;
    console.log(`${color}${verb.padEnd(width)}${C.off}  ${rel}${note ? `  ${C.dim}${note}${C.off}` : ''}`);
  }
  if (dry) console.log(`\n${C.yellow}dry run — nothing written${C.off}`);
  console.log(`\n${C.bold}Next${C.off}
  1. Fill the placeholders in AGENTS.md, ${docsRel}/index.md, ${docsRel}/_meta/CONVENTIONS.md.
  2. Add 5-10 mappings to docs.map.yaml (source paths -> docs that must change with them).
  3. Run: node scripts/docs-tool.mjs check
  4. Run: node scripts/docs-tool.mjs audit --strict`);
  return 0;
}

// ---------------------------------------------------------------- reporting

function report(opt, { errors, warnings, docs, root }) {
  if (opt.json) {
    console.log(JSON.stringify({ errors, warnings, documents: docs.length }, null, 2));
  } else {
    for (const w of warnings) console.log(`${C.yellow}warn${C.off}  ${w.file}: ${w.message}`);
    for (const e of errors) console.log(`${C.red}error${C.off} ${e.file}: ${e.message}`);
    const total = docs.length;
    if (errors.length || warnings.length) console.log('');
    const summary = `${total} doc${total === 1 ? '' : 's'}, ${errors.length} error${errors.length === 1 ? '' : 's'}, ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`;
    console.log(errors.length ? `${C.red}✗ ${summary}${C.off}` : `${C.green}✓ ${summary}${C.off}`);
  }
  if (opt.strict && warnings.length && !errors.length) process.exitCode = 1;
}

// ---------------------------------------------------------------- main

function usage() {
  console.log(`docs-tool — documentation system tool

Usage:
  node scripts/docs-tool.mjs check   [--root .] [--docs docs] [--json] [--strict]
  node scripts/docs-tool.mjs drift   [--base origin/main] [--labels a,b] [--skip-label docs-not-needed]
  node scripts/docs-tool.mjs audit   [--strict] [--json] [--write [path]]
  node scripts/docs-tool.mjs init    [--root .] [--name X] [--owner @team] [--test "npm test"] [--dry-run] [--force]

Exit codes: 0 ok, 1 findings, 2 usage/internal error.`);
}

const argv = process.argv.slice(2);
const command = argv[0];
const opt = parseArgs(argv.slice(1));

try {
  switch (command) {
    case 'init': process.exitCode = cmdInit(opt); break;
    case 'check': process.exitCode = cmdCheck(opt); break;
    case 'drift': process.exitCode = cmdDrift(opt); break;
    case 'audit': process.exitCode = cmdAudit(opt); break;
    case 'help': case '--help': case '-h': case undefined: usage(); break;
    default:
      console.error(`unknown command: ${command}`);
      usage();
      process.exitCode = 2;
  }
} catch (err) {
  console.error(`${C.red}${err.stack ?? err.message}${C.off}`);
  process.exitCode = 2;
}
