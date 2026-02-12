#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = {
    cwd: process.cwd(),
    apply: false,
    file: null,
    // Only fix these exact years (micro-fix, intentional).
    years: new Set(["0025", "0026"]),
  };
  const args = [...argv];
  while (args.length) {
    const a = args.shift();
    if (a === "--cwd") out.cwd = args.shift() || out.cwd;
    else if (a === "--apply") out.apply = true;
    else if (a === "--file") out.file = args.shift() || null;
  }
  return out;
}

function fixDateString(dateStr, years) {
  const s = String(dateStr || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const year = s.slice(0, 4);
  if (!years.has(year)) return null;
  return `20${s.slice(2)}`; // 0025-.. -> 2025-..
}

function listProjectFiles(cwd) {
  return fs
    .readdirSync(cwd, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+_/.test(d.name))
    .map((d) => ({ name: d.name, file: path.join(cwd, d.name, "project.json") }))
    .filter((x) => fs.existsSync(x.file))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

function applyFixToFile(projectFile, years, apply) {
  const abs = path.resolve(projectFile);
  const raw = fs.readFileSync(abs, "utf8");
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { file: abs, error: `JSON parse failed: ${String(e && e.message ? e.message : e)}` };
  }

  const changes = [];
  for (const n of json.nodes || []) {
    const d = n?.data?.date;
    const fixed = fixDateString(d, years);
    if (fixed) {
      changes.push({
        id: n?.id || "",
        old: d,
        next: fixed,
        title: n?.data?.title || "",
      });
    }
  }

  if (!changes.length) return { file: abs, changes: [] };

  // Apply as pure text replacement to avoid reformatting the JSON.
  let nextRaw = raw;
  const uniq = new Map();
  for (const c of changes) uniq.set(c.old, c.next);
  for (const [oldDate, newDate] of uniq.entries()) {
    // Match the exact serialized field pattern used across project.json files.
    nextRaw = nextRaw.replaceAll(`"date": "${oldDate}"`, `"date": "${newDate}"`);
  }

  const stillBad = [...years].some((y) => nextRaw.includes(`"date": "${y}-`));
  if (stillBad) {
    return {
      file: abs,
      changes,
      error:
        "Refused to write: some target years still present after replacement (unexpected formatting).",
    };
  }

  if (apply) fs.writeFileSync(abs, nextRaw, "utf8");
  return { file: abs, changes };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cwd = path.resolve(opts.cwd);

  const files = opts.file
    ? [{ name: path.basename(path.dirname(opts.file)), file: path.resolve(opts.file) }]
    : listProjectFiles(cwd);

  if (!files.length) {
    console.error("No project.json found.");
    process.exit(1);
  }

  const results = [];
  for (const f of files) {
    const res = applyFixToFile(f.file, opts.years, opts.apply);
    results.push(res);
  }

  const changed = results.filter((r) => r.changes && r.changes.length);
  const errs = results.filter((r) => r.error);

  console.log(`Mode: ${opts.apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`Files scanned: ${results.length} · Files changed: ${changed.length}`);
  if (changed.length) {
    for (const r of changed) {
      console.log(`- ${path.relative(cwd, r.file) || r.file}: ${r.changes.length} date fixes`);
      // Show a few examples for clarity.
      r.changes.slice(0, 8).forEach((c) => {
        const t = c.title ? ` · ${c.title}` : "";
        console.log(`  ${c.id}: ${c.old} -> ${c.next}${t}`);
      });
      if (r.changes.length > 8) console.log("  ...");
    }
  }
  if (errs.length) {
    console.log("\nErrors:");
    for (const r of errs) console.log(`- ${r.file}: ${r.error}`);
    process.exit(1);
  }
}

main();

