#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = {
    cwd: process.cwd(),
    json: null,
    spanYearsWarn: 20,
    futureDaysWarn: 14,
    pastYearWarn: 1990,
    maxMissingAssetsToList: 20,
  };
  const args = [...argv];
  while (args.length) {
    const a = args.shift();
    if (a === "--cwd") out.cwd = args.shift() || out.cwd;
    else if (a === "--json") out.json = args.shift() || null;
    else if (a === "--span-years-warn") out.spanYearsWarn = Number(args.shift() || "20");
    else if (a === "--future-days-warn") out.futureDaysWarn = Number(args.shift() || "14");
    else if (a === "--past-year-warn") out.pastYearWarn = Number(args.shift() || "1990");
    else if (a === "--max-missing-assets-to-list")
      out.maxMissingAssetsToList = Number(args.shift() || "20");
  }
  if (!Number.isFinite(out.spanYearsWarn) || out.spanYearsWarn < 1) out.spanYearsWarn = 20;
  if (!Number.isFinite(out.futureDaysWarn) || out.futureDaysWarn < 0) out.futureDaysWarn = 14;
  if (!Number.isFinite(out.pastYearWarn) || out.pastYearWarn < 1800) out.pastYearWarn = 1990;
  if (!Number.isFinite(out.maxMissingAssetsToList) || out.maxMissingAssetsToList < 0)
    out.maxMissingAssetsToList = 20;
  return out;
}

function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isFiniteNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function normalizeAction(action) {
  const txt = String(action || "").trim().toLowerCase();
  if (txt === "exploring") return "exploring";
  if (txt === "making") return "making";
  if (!txt) return "missing";
  return "other";
}

function guessExt(p) {
  const ext = path.extname(String(p || "")).toLowerCase().replace(/^\./, "");
  return ext || "";
}

function validateProject(projectDir, projectName, opts) {
  const file = path.join(projectDir, "project.json");
  const out = {
    project: projectName,
    file,
    ok: true,
    version: null,
    counts: {
      nodes: 0,
      edges: 0,
      actions: { exploring: 0, making: 0, other: 0, missing: 0 },
    },
    dates: {
      invalid: 0,
      missing: 0,
      min: "",
      max: "",
      spanDays: null,
      outOfRange: 0,
      future: 0,
    },
    schema: {
      nodesNotArray: false,
      edgesNotArray: false,
      nodeIdMissing: 0,
      nodeIdDuplicates: 0,
      edgeMissingRefs: 0,
      edgeSelfLoops: 0,
      edgeDuplicates: 0,
      nodeGeometryInvalid: 0,
      areasNotArray: 0,
      filesNotArray: 0,
      legacyMainAreasFields: 0,
      actionWeirdCase: 0,
    },
    assets: {
      fileEntries: 0,
      missing: 0,
      missingExamples: [],
      typeExtMismatch: 0,
      typeExtMismatchExamples: [],
      pathNotAssetsPrefix: 0,
    },
  };

  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    out.ok = false;
    out.error = `JSON parse failed: ${String(e && e.message ? e.message : e)}`;
    return out;
  }

  out.version = json && typeof json.version === "number" ? json.version : null;
  const nodes = Array.isArray(json.nodes) ? json.nodes : null;
  const edges = Array.isArray(json.edges) ? json.edges : null;
  if (!nodes) out.schema.nodesNotArray = true;
  if (!edges) out.schema.edgesNotArray = true;
  if (!nodes || !edges) {
    out.ok = false;
    out.counts.nodes = nodes ? nodes.length : 0;
    out.counts.edges = edges ? edges.length : 0;
    return out;
  }

  out.counts.nodes = nodes.length;
  out.counts.edges = edges.length;

  const idSet = new Set();
  const dupIds = new Set();

  const now = new Date();
  const futureCutoff = new Date(now.getTime() + opts.futureDaysWarn * 86400000);

  let minDate = null;
  let maxDate = null;

  for (const n of nodes) {
    const id = n && typeof n.id === "string" ? n.id : "";
    if (!id) out.schema.nodeIdMissing += 1;
    else if (idSet.has(id)) dupIds.add(id);
    else idSet.add(id);

    if (!isFiniteNum(n?.x) || !isFiniteNum(n?.y) || !isFiniteNum(n?.w) || !isFiniteNum(n?.h)) {
      out.schema.nodeGeometryInvalid += 1;
    }

    const data = n?.data || {};

    if (data && (Object.hasOwn(data, "mainAreas") || Object.hasOwn(data, "mainArea") || Object.hasOwn(data, "mainarea"))) {
      out.schema.legacyMainAreasFields += 1;
    }

    const actionRaw = data?.action;
    if (typeof actionRaw === "string" && actionRaw !== actionRaw.toLowerCase()) out.schema.actionWeirdCase += 1;
    const action = normalizeAction(actionRaw);
    out.counts.actions[action] = (out.counts.actions[action] || 0) + 1;

    const dateStr = data?.date;
    if (!dateStr) {
      out.dates.missing += 1;
    } else {
      const d = parseDate(dateStr);
      if (!d) {
        out.dates.invalid += 1;
      } else {
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
        if (d.getFullYear() < opts.pastYearWarn) out.dates.outOfRange += 1;
        if (d > futureCutoff) out.dates.future += 1;
      }
    }

    const areas = data?.areas;
    if (areas != null && !Array.isArray(areas)) out.schema.areasNotArray += 1;

    const files = data?.files;
    if (files != null && !Array.isArray(files)) {
      out.schema.filesNotArray += 1;
    } else if (Array.isArray(files)) {
      for (const f of files) {
        out.assets.fileEntries += 1;
        const p = f?.path;
        if (!p || typeof p !== "string") continue;

        if (!p.startsWith("assets/")) out.assets.pathNotAssetsPrefix += 1;
        const abs = path.join(projectDir, p);
        if (!fs.existsSync(abs)) {
          out.assets.missing += 1;
          if (out.assets.missingExamples.length < opts.maxMissingAssetsToList) {
            out.assets.missingExamples.push(`${projectName}/${p}`);
          }
        }

        // Loose mismatch checks: type says png but file is jpg, etc.
        const type = String(f?.type || "");
        const ext = guessExt(p);
        if (type.includes("image/") && ext) {
          const subtype = type.split("image/")[1] || "";
          const normSubtype = subtype.split(";")[0].trim().toLowerCase();
          if (normSubtype && !normSubtype.includes(ext) && !(normSubtype === "jpeg" && ext === "jpg")) {
            out.assets.typeExtMismatch += 1;
            if (out.assets.typeExtMismatchExamples.length < 10) {
              out.assets.typeExtMismatchExamples.push(`${projectName}/${p} (type=${type})`);
            }
          }
        }
      }
    }
  }

  out.schema.nodeIdDuplicates = dupIds.size;

  if (minDate && maxDate) {
    out.dates.min = minDate.toISOString().slice(0, 10);
    out.dates.max = maxDate.toISOString().slice(0, 10);
    out.dates.spanDays = (maxDate.getTime() - minDate.getTime()) / 86400000;
    const spanYears = out.dates.spanDays / 365;
    if (Number.isFinite(spanYears) && spanYears > opts.spanYearsWarn) out.ok = false;
  }

  // Edge validation
  const edgeKeySet = new Set();
  for (const e of edges) {
    const s = e && typeof e.s === "string" ? e.s : "";
    const t = e && typeof e.t === "string" ? e.t : "";
    if (!s || !t || !idSet.has(s) || !idSet.has(t)) out.schema.edgeMissingRefs += 1;
    if (s && t && s === t) out.schema.edgeSelfLoops += 1;
    const k = `${s}→${t}${e?.dashed ? "|d" : ""}`;
    if (edgeKeySet.has(k)) out.schema.edgeDuplicates += 1;
    else edgeKeySet.add(k);
  }

  // Mark as not-ok if structural issues exist.
  if (
    out.schema.nodesNotArray ||
    out.schema.edgesNotArray ||
    out.schema.nodeIdMissing ||
    out.schema.nodeGeometryInvalid ||
    out.schema.edgeMissingRefs
  ) {
    out.ok = false;
  }

  return out;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cwd = path.resolve(opts.cwd);

  const projectDirs = fs
    .readdirSync(cwd, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+_/.test(d.name))
    .map((d) => ({ name: d.name, dir: path.join(cwd, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));

  if (!projectDirs.length) {
    console.error("No numbered project folders found.");
    process.exit(1);
  }

  const results = projectDirs.map((p) => validateProject(p.dir, p.name, opts));

  const totals = {
    projects: results.length,
    ok: results.filter((r) => r.ok).length,
    notOk: results.filter((r) => !r.ok).length,
    nodes: results.reduce((a, r) => a + (r.counts?.nodes || 0), 0),
    edges: results.reduce((a, r) => a + (r.counts?.edges || 0), 0),
    invalidDates: results.reduce((a, r) => a + (r.dates?.invalid || 0), 0),
    missingDates: results.reduce((a, r) => a + (r.dates?.missing || 0), 0),
    missingAssets: results.reduce((a, r) => a + (r.assets?.missing || 0), 0),
    edgeMissingRefs: results.reduce((a, r) => a + (r.schema?.edgeMissingRefs || 0), 0),
    dupNodeIds: results.reduce((a, r) => a + (r.schema?.nodeIdDuplicates || 0), 0),
  };

  console.log(`Projects: ${totals.projects} (ok=${totals.ok}, flagged=${totals.notOk})`);
  console.log(`Total nodes: ${totals.nodes} · Total edges: ${totals.edges}`);
  console.log(
    `Dates: missing=${totals.missingDates} · invalid=${totals.invalidDates} · future>${opts.futureDaysWarn}d=${results.reduce(
      (a, r) => a + (r.dates?.future || 0),
      0
    )}`
  );
  console.log(
    `Edges: missingRefs=${totals.edgeMissingRefs} · selfLoops=${results.reduce(
      (a, r) => a + (r.schema?.edgeSelfLoops || 0),
      0
    )} · duplicates=${results.reduce((a, r) => a + (r.schema?.edgeDuplicates || 0), 0)}`
  );
  console.log(
    `Assets: fileEntries=${results.reduce((a, r) => a + (r.assets?.fileEntries || 0), 0)} · missing=${totals.missingAssets} · type/ext mismatches=${results.reduce(
      (a, r) => a + (r.assets?.typeExtMismatch || 0),
      0
    )}`
  );
  console.log(
    `Nodes: dupIds(total unique per project)=${totals.dupNodeIds} · missingId=${results.reduce(
      (a, r) => a + (r.schema?.nodeIdMissing || 0),
      0
    )} · geometryInvalid=${results.reduce((a, r) => a + (r.schema?.nodeGeometryInvalid || 0), 0)}`
  );

  const interesting = results.filter(
    (r) =>
      !r.ok ||
      (r.dates?.spanDays != null && r.dates.spanDays / 365 > opts.spanYearsWarn) ||
      r.schema.edgeMissingRefs ||
      r.assets.missing
  );
  if (interesting.length) {
    console.log("\nFlagged per-project (non-zero issues):");
    for (const r of interesting) {
      const span = r.dates?.spanDays != null ? `${Math.round(r.dates.spanDays / 365)}y` : "-";
      const parts = [];
      if (r.schema.edgeMissingRefs) parts.push(`edgeMissingRefs=${r.schema.edgeMissingRefs}`);
      if (r.schema.edgeSelfLoops) parts.push(`selfLoops=${r.schema.edgeSelfLoops}`);
      if (r.schema.edgeDuplicates) parts.push(`edgeDup=${r.schema.edgeDuplicates}`);
      if (r.schema.nodeIdDuplicates) parts.push(`dupNodeIds=${r.schema.nodeIdDuplicates}`);
      if (r.schema.nodeIdMissing) parts.push(`missingNodeId=${r.schema.nodeIdMissing}`);
      if (r.schema.nodeGeometryInvalid) parts.push(`badGeom=${r.schema.nodeGeometryInvalid}`);
      if (r.dates.invalid) parts.push(`invalidDates=${r.dates.invalid}`);
      if (r.dates.future) parts.push(`futureDates=${r.dates.future}`);
      if (r.assets.missing) parts.push(`missingAssets=${r.assets.missing}`);
      if (r.assets.typeExtMismatch) parts.push(`typeExtMismatch=${r.assets.typeExtMismatch}`);
      if (r.schema.legacyMainAreasFields) parts.push(`legacyMainAreas=${r.schema.legacyMainAreasFields}`);
      if (r.schema.actionWeirdCase) parts.push(`actionCase=${r.schema.actionWeirdCase}`);
      console.log(`- ${r.project}: span=${span}${parts.length ? " · " + parts.join(" · ") : ""}`);
      if (r.assets.missingExamples.length) {
        console.log(`  missing examples: ${r.assets.missingExamples.slice(0, 5).join(", ")}${r.assets.missingExamples.length > 5 ? ", ..." : ""}`);
      }
      if (r.assets.typeExtMismatchExamples.length) {
        console.log(`  type/ext mismatch examples: ${r.assets.typeExtMismatchExamples.slice(0, 3).join(", ")}${r.assets.typeExtMismatchExamples.length > 3 ? ", ..." : ""}`);
      }
    }
  }

  if (opts.json) {
    const outPath = path.resolve(cwd, opts.json);
    fs.writeFileSync(outPath, JSON.stringify({ opts, totals, results }, null, 2), "utf8");
    console.log(`\nWrote: ${outPath}`);
  }
}

main();

