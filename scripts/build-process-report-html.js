#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseArgs(argv) {
  const out = {
    output: null,
    hubThreshold: 4,
    maxWeeks: 200,
    title: "Threadscape Process Analysis Report",
  };
  const args = [...argv];
  while (args.length) {
    const a = args.shift();
    if (a === "--output") out.output = args.shift() || null;
    else if (a === "--hub-threshold") out.hubThreshold = Number(args.shift() || "4");
    else if (a === "--max-weeks") out.maxWeeks = Number(args.shift() || "200");
    else if (a === "--title") out.title = args.shift() || out.title;
  }
  if (!Number.isFinite(out.hubThreshold) || out.hubThreshold < 1) out.hubThreshold = 4;
  if (!Number.isFinite(out.maxWeeks) || out.maxWeeks < 4) out.maxWeeks = 200;
  return out;
}

function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function canonicalAreaName(value) {
  const txt = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!txt) return "";
  const low = txt.toLowerCase();
  if (low === "speculative" || low === "speculative design") return "Speculative Design";
  if (low === "communication" || low === "communication design") return "Communication Design";
  if (low === "interaction" || low === "interaction design") return "Interaction Design";
  return txt;
}

function normalizeAreaList(areas, legacyMainAreas) {
  const seen = new Set();
  const out = [];
  const push = (raw) => {
    const mapped = canonicalAreaName(raw);
    if (!mapped) return;
    const key = mapped
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(mapped);
  };

  const apply = (val) => {
    if (!val) return;
    if (Array.isArray(val)) val.forEach(push);
    else push(val);
  };
  apply(areas);
  apply(legacyMainAreas);
  return out;
}

function macroFromAreas(areas) {
  const scores = { speculative: 0, communication: 0, interaction: 0 };
  const list = Array.isArray(areas) ? areas : [];
  for (const a of list) {
    const txt = String(a || "").toLowerCase();
    if (!txt) continue;
    if (txt.includes("specul")) scores.speculative += 1;
    if (txt.includes("comunic") || txt.includes("communicat")) scores.communication += 1;
    if (txt.includes("inter")) scores.interaction += 1;
  }
  const entries = Object.entries(scores).sort((x, y) => y[1] - x[1]);
  if (!entries.length || entries[0][1] <= 0) return "unknown";
  const top = entries[0][1];
  const tied = entries.filter((e) => e[1] === top).map((e) => e[0]);
  if (tied.length > 1) return "mixed";
  return tied[0];
}

function median(values) {
  const list = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  if (list.length % 2) return list[mid];
  return (list[mid - 1] + list[mid]) / 2;
}

function mean(values) {
  const list = values.filter((v) => Number.isFinite(v));
  if (!list.length) return null;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

function minmax(values) {
  const list = values.filter((v) => Number.isFinite(v));
  if (!list.length) return { min: null, max: null };
  let mn = list[0];
  let mx = list[0];
  for (const v of list) {
    mn = Math.min(mn, v);
    mx = Math.max(mx, v);
  }
  return { min: mn, max: mx };
}

function computeBuckets(nodes, minDate) {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const buckets = new Map();
  for (const n of nodes) {
    if (!n.date) continue;
    const w = Math.max(0, Math.floor((n.date.getTime() - minDate.getTime()) / weekMs));
    const cur = buckets.get(w) || { exploring: 0, making: 0, total: 0 };
    if (n.action === "exploring") cur.exploring += 1;
    else if (n.action === "making") cur.making += 1;
    cur.total += 1;
    buckets.set(w, cur);
  }
  return buckets;
}

function computeInterlacing(buckets) {
  const active = [...buckets.values()].filter((b) => b.total > 0);
  const overlap = active.filter((b) => b.exploring > 0 && b.making > 0);
  const interlacingIndex = active.length ? (overlap.length / active.length) * 100 : 0;
  let intensity = 0;
  if (overlap.length) {
    for (const b of overlap) {
      intensity += Math.min(b.exploring, b.making) / Math.max(b.exploring, b.making);
    }
    intensity = (intensity / overlap.length) * 100;
  }
  return {
    activeBuckets: active.length,
    overlapBuckets: overlap.length,
    interlacingIndex,
    overlapIntensity: intensity,
  };
}

function computeScc(nodes, edges, idToIndex) {
  const ids = nodes.map((n) => n.id);
  const adjacency = new Map(ids.map((id) => [id, []]));
  for (const e of edges) {
    const a = idToIndex.get(e.s);
    const b = idToIndex.get(e.t);
    if (a == null || b == null || e.s === e.t) continue;
    adjacency.get(e.s).push(e.t);
  }

  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indexMap = new Map();
  const lowMap = new Map();
  const components = [];

  function strongConnect(v) {
    indexMap.set(v, index);
    lowMap.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adjacency.get(v) || []) {
      if (!indexMap.has(w)) {
        strongConnect(w);
        lowMap.set(v, Math.min(lowMap.get(v), lowMap.get(w)));
      } else if (onStack.has(w)) {
        lowMap.set(v, Math.min(lowMap.get(v), indexMap.get(w)));
      }
    }

    if (lowMap.get(v) === indexMap.get(v)) {
      const comp = [];
      while (stack.length) {
        const w = stack.pop();
        onStack.delete(w);
        comp.push(w);
        if (w === v) break;
      }
      components.push(comp);
    }
  }

  for (const id of ids) {
    if (!indexMap.has(id)) strongConnect(id);
  }

  const cyclic = components.filter((c) => c.length > 1);
  const cyclicSet = new Set(cyclic.flat());
  const largest = cyclic.reduce((m, c) => Math.max(m, c.length), 0);
  return { sccCount: cyclic.length, cyclicNodes: cyclicSet, largestScc: largest };
}

function computeMetricsForProject(projectName, json, opts) {
  const rawNodes = Array.isArray(json.nodes) ? json.nodes : [];
  const rawEdges = Array.isArray(json.edges) ? json.edges : [];

  const nodes = rawNodes.map((n) => {
    const data = n?.data || {};
    const legacy = [
      ...(Array.isArray(data.mainAreas) ? data.mainAreas : []),
      data.mainArea,
      data.mainarea,
    ];
    const areas = normalizeAreaList(data.areas, legacy);
    const action = String(data.action || "").toLowerCase().trim();
    const date = parseDate(data.date || "");
    const type = String(data.type || "").trim();
    return {
      id: String(n?.id || ""),
      action: action === "exploring" ? "exploring" : action === "making" ? "making" : "other",
      date,
      areas,
      macro: macroFromAreas(areas),
      type,
    };
  });

  const idToIndex = new Map();
  nodes.forEach((n, i) => idToIndex.set(n.id, i));

  const edges = rawEdges
    .map((e) => ({ s: String(e?.s || ""), t: String(e?.t || ""), dashed: !!e?.dashed }))
    .filter((e) => e.s && e.t && e.s !== e.t && idToIndex.has(e.s) && idToIndex.has(e.t));

  const nCount = nodes.length;
  const eCount = edges.length;

  const inDeg = new Map(nodes.map((n) => [n.id, 0]));
  const outDeg = new Map(nodes.map((n) => [n.id, 0]));

  for (const e of edges) {
    outDeg.set(e.s, (outDeg.get(e.s) || 0) + 1);
    inDeg.set(e.t, (inDeg.get(e.t) || 0) + 1);
  }

  const exploringNodes = nodes.filter((n) => n.action === "exploring");
  const makingNodes = nodes.filter((n) => n.action === "making");
  const otherNodes = nodes.filter((n) => n.action === "other");

  const multiArea = nodes.filter((n) => (n.areas || []).length > 1).length;
  const avgAreas = nCount
    ? nodes.reduce((acc, n) => acc + (n.areas ? n.areas.length : 0), 0) / nCount
    : 0;

  const hubThreshold = Math.max(1, Number(opts.hubThreshold) || 4);
  const convergent = nodes.filter((n) => (inDeg.get(n.id) || 0) >= hubThreshold).length;
  const divergent = nodes.filter((n) => (outDeg.get(n.id) || 0) >= hubThreshold).length;
  const sources = nodes.filter((n) => (inDeg.get(n.id) || 0) === 0).length;
  const sinks = nodes.filter((n) => (outDeg.get(n.id) || 0) === 0).length;

  const density = nCount > 1 ? eCount / (nCount * (nCount - 1)) : 0;

  const edgePairs = new Set(edges.map((e) => `${e.s}→${e.t}`));
  let reciprocalPairs = 0;
  for (const key of edgePairs) {
    const [from, to] = key.split("→");
    const rev = `${to}→${from}`;
    if (edgePairs.has(rev) && from < to) reciprocalPairs += 1;
  }

  const macroOk = (m) => m === "speculative" || m === "communication" || m === "interaction";
  let crossMacroEdges = 0;
  let macroEdgesConsidered = 0;
  for (const e of edges) {
    const a = nodes[idToIndex.get(e.s)];
    const b = nodes[idToIndex.get(e.t)];
    if (!a || !b) continue;
    if (!macroOk(a.macro) || !macroOk(b.macro)) continue;
    macroEdgesConsidered += 1;
    if (a.macro !== b.macro) crossMacroEdges += 1;
  }
  const crossMacroShare = macroEdgesConsidered ? (crossMacroEdges / macroEdgesConsidered) * 100 : 0;
  const macroEdgeCoverage = eCount ? (macroEdgesConsidered / eCount) * 100 : 0;

  const interlacingEdges = [];
  const eToMLatencyDays = [];
  const exploringWithMakingOut = new Set();
  let eToM = 0;
  let mToE = 0;
  let crossInterlacingEdges = 0;
  let interlacingEdgesMacroConsidered = 0;

  for (const e of edges) {
    const a = nodes[idToIndex.get(e.s)];
    const b = nodes[idToIndex.get(e.t)];
    if (!a || !b) continue;
    const actA = a.action;
    const actB = b.action;
    const isEtoM = actA === "exploring" && actB === "making";
    const isMtoE = actA === "making" && actB === "exploring";
    if (!isEtoM && !isMtoE) continue;

    interlacingEdges.push(e);
    if (isEtoM) {
      eToM += 1;
      exploringWithMakingOut.add(a.id);
      if (a.date && b.date) {
        const diff = (b.date.getTime() - a.date.getTime()) / 86400000;
        if (Number.isFinite(diff) && diff >= 0) eToMLatencyDays.push(diff);
      }
    }
    if (isMtoE) mToE += 1;

    if (macroOk(a.macro) && macroOk(b.macro)) {
      interlacingEdgesMacroConsidered += 1;
      if (a.macro !== b.macro) crossInterlacingEdges += 1;
    }
  }

  const conversionRate = exploringNodes.length
    ? (exploringWithMakingOut.size / exploringNodes.length) * 100
    : 0;
  const feedbackRatio = eToM ? (mToE / eToM) * 100 : 0;
  const leadtimeMedian = median(eToMLatencyDays);
  const crossInterlacingShare = interlacingEdgesMacroConsidered
    ? (crossInterlacingEdges / interlacingEdgesMacroConsidered) * 100
    : 0;
  const interlacingMacroCoverage = interlacingEdges.length
    ? (interlacingEdgesMacroConsidered / interlacingEdges.length) * 100
    : 0;

  const dated = nodes.filter((n) => n.date);
  let minDate = null;
  let maxDate = null;
  for (const n of dated) {
    if (!minDate || n.date < minDate) minDate = n.date;
    if (!maxDate || n.date > maxDate) maxDate = n.date;
  }
  const spanDays = minDate && maxDate ? (maxDate.getTime() - minDate.getTime()) / 86400000 : null;

  // Back-in-time edges can indicate revisiting earlier artifacts, but can also be caused by missing/rough dates.
  let temporalEdges = 0;
  let temporalBackEdges = 0;
  for (const e of edges) {
    const a = nodes[idToIndex.get(e.s)];
    const b = nodes[idToIndex.get(e.t)];
    if (!a?.date || !b?.date) continue;
    temporalEdges += 1;
    if (b.date.getTime() < a.date.getTime()) temporalBackEdges += 1;
  }
  const temporalBackShare = temporalEdges ? (temporalBackEdges / temporalEdges) * 100 : 0;

  const buckets = minDate ? computeBuckets(nodes.filter((n) => n.action !== "other"), minDate) : new Map();
  const interlacing = computeInterlacing(buckets);

  const scc = computeScc(nodes, edges, idToIndex);
  const cycleParticipation = nCount ? (scc.cyclicNodes.size / nCount) * 100 : 0;

  const types = new Map();
  for (const n of nodes) {
    const key = String(n.type || "").trim() || "(none)";
    types.set(key, (types.get(key) || 0) + 1);
  }
  const typeCounts = [...types.entries()].sort((a, b) => b[1] - a[1]);

  const areaCountsMap = new Map();
  for (const n of nodes) {
    for (const a of n.areas || []) areaCountsMap.set(a, (areaCountsMap.get(a) || 0) + 1);
  }
  const areaCounts = [...areaCountsMap.entries()].sort((a, b) => b[1] - a[1]);

  const macroCountsMap = new Map();
  for (const n of nodes) macroCountsMap.set(n.macro, (macroCountsMap.get(n.macro) || 0) + 1);
  const macroCounts = [...macroCountsMap.entries()].sort((a, b) => b[1] - a[1]);

  return {
    project: projectName,
    nodes: nCount,
    edges: eCount,
    exploring: exploringNodes.length,
    making: makingNodes.length,
    other: otherNodes.length,
    sources,
    sinks,
    interlacingIndex: interlacing.interlacingIndex,
    overlapIntensity: interlacing.overlapIntensity,
    activeBuckets: interlacing.activeBuckets,
    overlapBuckets: interlacing.overlapBuckets,
    sccCount: scc.sccCount,
    largestScc: scc.largestScc,
    cycleParticipation,
    conversionRate,
    feedbackRatio,
    leadtimeMedianDays: leadtimeMedian,
    eToMEdges: eToM,
    mToEEdges: mToE,
    interlacingEdges: interlacingEdges.length,
    crossMacroShare,
    macroEdgeCoverage,
    crossInterlacingShare,
    interlacingMacroCoverage,
    multiAreaShare: nCount ? (multiArea / nCount) * 100 : 0,
    avgAreas,
    convergent,
    divergent,
    reciprocityPairs: reciprocalPairs,
    density: density * 100,
    temporalBackShare,
    minDate: minDate ? minDate.toISOString().slice(0, 10) : "",
    maxDate: maxDate ? maxDate.toISOString().slice(0, 10) : "",
    spanDays,
    typeCounts,
    areaCounts,
    macroCounts,
  };
}

function fmt(v, digits = 1) {
  if (v == null) return "-";
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(digits);
  }
  return String(v);
}

function buildAverageTimeline(metricsByProject, opts) {
  const maxWeeks = Math.max(4, Number(opts.maxWeeks) || 200);
  const ex = Array(maxWeeks).fill(0);
  const mk = Array(maxWeeks).fill(0);
  const tot = Array(maxWeeks).fill(0);
  let projectsUsed = 0;

  for (const m of metricsByProject) {
    const tl = m.__timeline;
    if (!tl || !tl.length) continue;
    projectsUsed += 1;
    for (let i = 0; i < Math.min(maxWeeks, tl.length); i++) {
      ex[i] += tl[i].ex;
      mk[i] += tl[i].mk;
      tot[i] += tl[i].ex + tl[i].mk;
    }
  }

  projectsUsed = Math.max(1, projectsUsed);
  const weeks = [];
  for (let i = 0; i < maxWeeks; i++) {
    weeks.push({
      week: i + 1,
      ex: ex[i] / projectsUsed,
      mk: mk[i] / projectsUsed,
      total: tot[i] / projectsUsed,
    });
  }
  let last = weeks.length - 1;
  while (last > 0 && weeks[last].total === 0) last -= 1;
  return { projectsUsed, weeks: weeks.slice(0, last + 1) };
}

function computePerProjectTimelines(projectFiles, metrics, opts) {
  const maxWeeks = Math.max(4, Number(opts.maxWeeks) || 200);
  const byName = new Map(metrics.map((m) => [m.project, m]));
  for (const pf of projectFiles) {
    const json = JSON.parse(fs.readFileSync(pf.file, "utf8"));
    const nodes = (json.nodes || []).map((n) => ({
      action: String(n?.data?.action || "").toLowerCase().trim(),
      date: parseDate(n?.data?.date || ""),
    }));
    const em = nodes.filter((n) => n.date && (n.action === "exploring" || n.action === "making"));
    if (!em.length) continue;
    const min = new Date(Math.min(...em.map((n) => n.date.getTime())));
    min.setHours(0, 0, 0, 0);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const tl = Array(maxWeeks)
      .fill(null)
      .map(() => ({ ex: 0, mk: 0 }));
    for (const n of em) {
      const w = Math.max(0, Math.floor((n.date.getTime() - min.getTime()) / weekMs));
      if (w >= tl.length) continue;
      if (n.action === "exploring") tl[w].ex += 1;
      if (n.action === "making") tl[w].mk += 1;
    }
    const m = byName.get(pf.name);
    if (m) m.__timeline = tl;
  }
}

function svgBarChart(title, items, { width = 860, height = 280, valueMax = null, fmtValue = null } = {}) {
  const margin = { l: 110, r: 20, t: 42, b: 40 };
  const w = width;
  const h = height;
  const plotW = w - margin.l - margin.r;
  const plotH = h - margin.t - margin.b;
  const values = items.map((d) => d.value).filter((v) => Number.isFinite(v));
  const vmax = valueMax != null ? valueMax : Math.max(1, ...values);
  const bars = items.length;
  const band = bars ? plotW / bars : plotW;
  const barW = Math.max(2, Math.min(22, band * 0.55));

  const grid = [];
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const t = i / ticks;
    const y = margin.t + plotH * (1 - t);
    grid.push(
      `<line x1="${margin.l}" y1="${y.toFixed(2)}" x2="${(w - margin.r).toFixed(2)}" y2="${y.toFixed(2)}" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>`
    );
    const v = vmax * t;
    grid.push(
      `<text x="${(margin.l - 8).toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="end" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="12" fill="#666">${escapeHtml(
        fmtValue ? fmtValue(v) : v.toFixed(0)
      )}</text>`
    );
  }

  const barsXml = items
    .map((d, i) => {
      const xCenter = margin.l + band * i + band / 2;
      const x = xCenter - barW / 2;
      const v = Number.isFinite(d.value) ? d.value : 0;
      const frac = Math.max(0, Math.min(1, v / vmax));
      const bh = plotH * frac;
      const y = margin.t + (plotH - bh);
      return `
        <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(
        2
      )}" height="${bh.toFixed(2)}" fill="#111" opacity="0.8"/>
        <text x="${xCenter.toFixed(2)}" y="${(h - 20).toFixed(
        2
      )}" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="11" fill="#666">${escapeHtml(
        d.label
      )}</text>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${margin.l}" y="26" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="18" fill="#111">${escapeHtml(
    title
  )}</text>
  ${grid.join("\n")}
  ${barsXml}
</svg>`;
}

function toCsv(metrics) {
  const header = [
    "project",
    "nodes",
    "edges",
    "exploring",
    "making",
    "interlacingIndex",
    "overlapIntensity",
    "cycleParticipation",
    "crossInterlacingShare",
    "conversionRate",
    "feedbackRatio",
    "leadtimeMedianDays",
    "crossMacroShare",
    "multiAreaShare",
    "temporalBackShare",
    "sources",
    "sinks",
  ];
  const lines = [header.join(",")];
  for (const m of metrics) {
    const row = header.map((k) => {
      const v = m[k];
      if (v == null) return "";
      if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
      return String(v).replaceAll('"', '""');
    });
    lines.push(row.map((s) => `"${s}"`).join(","));
  }
  return lines.join("\n");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const outHtml = opts.output || path.join(cwd, "threadscape_process_report.html");

  const projectFiles = fs
    .readdirSync(cwd, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d+_/.test(d.name))
    .map((d) => ({ name: d.name, file: path.join(cwd, d.name, "project.json") }))
    .filter((x) => fs.existsSync(x.file))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));

  if (!projectFiles.length) {
    console.error("No project.json found in numbered folders.");
    process.exit(1);
  }

  const metrics = [];
  let totalNodes = 0;
  let totalEdges = 0;
  let totalExploring = 0;
  let totalMaking = 0;
  const flagged = [];

  for (const pf of projectFiles) {
    const json = JSON.parse(fs.readFileSync(pf.file, "utf8"));
    const m = computeMetricsForProject(pf.name, json, opts);
    if (m.spanDays != null && m.spanDays > 365 * 20) flagged.push(`${pf.name} (span ~${Math.round(m.spanDays / 365)}y)`);
    metrics.push(m);
    totalNodes += m.nodes;
    totalEdges += m.edges;
    totalExploring += m.exploring;
    totalMaking += m.making;
  }

  computePerProjectTimelines(projectFiles, metrics, opts);
  const timeline = buildAverageTimeline(metrics, opts);

  const numericKeys = [
    "interlacingIndex",
    "overlapIntensity",
    "cycleParticipation",
    "crossInterlacingShare",
    "conversionRate",
    "feedbackRatio",
    "leadtimeMedianDays",
    "crossMacroShare",
    "multiAreaShare",
    "temporalBackShare",
  ];
  const agg = {};
  for (const key of numericKeys) {
    const vals = metrics.map((m) => m[key]).filter((v) => Number.isFinite(v));
    const mm = minmax(vals);
    agg[key] = {
      mean: mean(vals),
      median: median(vals),
      min: mm.min,
      max: mm.max,
    };
  }

  const summary = {
    projectCount: metrics.length,
    totalNodes,
    totalEdges,
    totalExploring,
    totalMaking,
    flaggedProjects: flagged,
    agg,
  };

  // Aggregate “what is documented” across the dataset: node types + areas.
  const typeCountsAll = new Map();
  const areaCountsAll = new Map();
  const macroCountsAll = new Map();
  for (const m of metrics) {
    for (const [k, c] of m.typeCounts || []) typeCountsAll.set(k, (typeCountsAll.get(k) || 0) + c);
    for (const [k, c] of m.areaCounts || []) areaCountsAll.set(k, (areaCountsAll.get(k) || 0) + c);
    for (const [k, c] of m.macroCounts || []) macroCountsAll.set(k, (macroCountsAll.get(k) || 0) + c);
  }
  const topTypesAll = [...typeCountsAll.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const topAreasAll = [...areaCountsAll.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const macroAll = [...macroCountsAll.entries()].sort((a, b) => b[1] - a[1]);
  const totalAreaMentions = [...areaCountsAll.values()].reduce((a, b) => a + b, 0);

  // Sort for stable tables.
  metrics.sort((a, b) => a.project.localeCompare(b.project, "en"));

  const svgPath = path.join(cwd, "mk_ex_media_all_projects.svg");
  const timelineSvg = fs.existsSync(svgPath) ? fs.readFileSync(svgPath, "utf8") : "";

  // Simple distribution charts (bar charts, ordered by project name).
  const exMkMixSvg = svgBarChart(
    "Interlacing index (%) per progetto",
    metrics.map((m) => ({ label: m.project.replace(/^\d+_/, ""), value: m.interlacingIndex })),
    { fmtValue: (v) => v.toFixed(0) }
  );
  const cyclesSvg = svgBarChart(
    "Cycle participation (%) per progetto",
    metrics.map((m) => ({ label: m.project.replace(/^\d+_/, ""), value: m.cycleParticipation })),
    { fmtValue: (v) => v.toFixed(0) }
  );
  const crossSvg = svgBarChart(
    "Cross-area interlacing (%) per progetto",
    metrics.map((m) => ({ label: m.project.replace(/^\d+_/, ""), value: m.crossInterlacingShare })),
    { fmtValue: (v) => v.toFixed(0) }
  );

  const csv = toCsv(metrics);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(opts.title)}</title>
  <style>
    :root{
      --bg:#ffffff;
      --panel:#ffffff;
      --text:#111;
      --muted:#666;
      --border:#e6e6e6;
      --border2:#d4d4d4;
      --chip:#f3f3f3;
      --cyan:#00bcd4;
      --brown:#643719;
    }
    html,body{height:100%;}
    body{
      margin:0;
      background:var(--bg);
      color:var(--text);
      font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
      line-height:1.35;
    }
    .wrap{max-width:1120px;margin:0 auto;padding:28px 18px 60px;}
    h1{font-size:28px;margin:0 0 6px;}
    h2{font-size:18px;margin:28px 0 10px;}
    h3{font-size:14px;margin:18px 0 8px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em;}
    p{margin:10px 0;}
    .meta{color:var(--muted);font-size:13px}
    .note{color:var(--muted);font-size:13px}
    .chips{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 6px;}
    .chip{background:var(--chip);border:1px solid var(--border);border-radius:999px;padding:6px 10px;font-size:12px;color:var(--muted);}
    .chip b{color:var(--text);}
    .grid{display:grid;grid-template-columns:1fr;gap:14px;}
    .panel{
      border:1px solid var(--border);
      border-radius:12px;
      background:var(--panel);
      padding:14px 14px;
      overflow:hidden;
    }
    table{width:100%;border-collapse:collapse;font-size:12.5px;}
    th,td{border:1px solid var(--border2);padding:6px 8px;vertical-align:top;}
    th{background:#f7f7f7;text-align:left;font-weight:600;}
    .small td,.small th{font-size:12px;padding:5px 7px;}
    .kpi{display:flex;gap:10px;flex-wrap:wrap}
    .kpi .chip{background:#fff;}
    details{border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:#fff;}
    details+details{margin-top:10px;}
    summary{cursor:pointer;font-weight:600}
    summary span{font-weight:500;color:var(--muted);}
    .btns{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 0;}
    button{
      font:inherit;
      font-size:12.5px;
      border:1px solid var(--border2);
      background:#fff;
      color:var(--text);
      border-radius:10px;
      padding:7px 10px;
      cursor:pointer;
    }
    button:hover{background:#f6f6f6;}
    .svgbox{border:1px solid var(--border);border-radius:12px;padding:10px;background:#fff;overflow:auto;}
    .svgbox svg{max-width:100%;height:auto;display:block;}
    .warning{color:#8a3b00}
    @media (min-width: 980px){
      .grid{grid-template-columns:1fr 1fr;}
    }
    @media print{
      button{display:none !important;}
      details{break-inside:avoid;}
      .panel{break-inside:avoid;}
      .svgbox{break-inside:avoid;}
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(opts.title)}</h1>
    <div class="meta">Generato: ${escapeHtml(dateStr)} · Progetti: ${summary.projectCount} · Nodi: ${summary.totalNodes} · Archi: ${summary.totalEdges}</div>
    <div class="chips kpi">
      <div class="chip"><b>Exploring</b>: ${summary.totalExploring}</div>
      <div class="chip"><b>Making</b>: ${summary.totalMaking}</div>
      <div class="chip"><b>Hub threshold</b>: ${escapeHtml(opts.hubThreshold)}</div>
      <div class="chip"><b>Finestra timeline</b>: prime ${escapeHtml(opts.maxWeeks)} settimane</div>
    </div>

    <h2>Metodo e limiti (perche le medie aiutano, ma non bastano)</h2>
    <div class="panel">
      <p>Questo report descrive processi progettuali come <b>grafo diretto</b> (nodi + archi) basato su cio che e stato <b>documentato e codificato</b> (date, collegamenti, aree, tipi, tag).</p>
      <p class="note">Le metriche non misurano il “processo reale” completo: misurano il processo cosi come e stato <b>pensato, verbalizzato e registrato</b>, con approssimazioni e rumore.</p>
      <p class="note">Le medie hanno senso per evidenziare <b>pattern macro</b> (interlacing, cicli, orizzontalita disciplinare), ma rischiano di cancellare <b>eterogeneita</b> (brief diversi, intensita di documentazione diversa, outlier temporali). Per questo qui trovi sia aggregati sia tabelle per-progetto e confronti.</p>
      ${
        summary.flaggedProjects.length
          ? `<p class="note warning"><b>Attenzione (outlier temporali)</b>: ${escapeHtml(
              summary.flaggedProjects.join(", ")
            )}. Le timeline medie sono “robuste” (finestra limitata) per non essere distorte.</p>`
          : ""
      }
    </div>

    <h2>Cosa viene documentato (tipi e aree)</h2>
    <div class="grid">
      <div class="panel">
        <h3>Tipi di nodo (top 20)</h3>
        <table class="small">
          <thead><tr><th>Tipo</th><th>Count</th><th>Share</th></tr></thead>
          <tbody>
            ${topTypesAll
              .map(([k, c]) => `<tr><td>${escapeHtml(k)}</td><td>${c}</td><td>${(
                (c / Math.max(1, summary.totalNodes)) *
                100
              ).toFixed(1)}%</td></tr>`)
              .join("\n")}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <h3>Aree (top 20)</h3>
        <table class="small">
          <thead><tr><th>Area</th><th>Count</th><th>Share</th></tr></thead>
          <tbody>
            ${topAreasAll
              .map(([k, c]) => `<tr><td>${escapeHtml(k)}</td><td>${c}</td><td>${(
                (c / Math.max(1, totalAreaMentions)) *
                100
              ).toFixed(1)}%</td></tr>`)
              .join("\n")}
          </tbody>
        </table>
        <p class="note">Nota: qui la share e calcolata su <b>menzioni di area</b> (un nodo puo citare piu aree).</p>
      </div>
      <div class="panel">
        <h3>Macro-aree (conteggio nodi)</h3>
        <table class="small">
          <thead><tr><th>Macro</th><th>Count</th><th>Share</th></tr></thead>
          <tbody>
            ${macroAll
              .map(([k, c]) => `<tr><td>${escapeHtml(k)}</td><td>${c}</td><td>${(
                (c / Math.max(1, summary.totalNodes)) *
                100
              ).toFixed(1)}%</td></tr>`)
              .join("\n")}
          </tbody>
        </table>
        <p class="note">Valori “mixed/unknown” indicano nodi con aree multiple o aree non riconosciute come macro.</p>
      </div>
      <div class="panel">
        <h3>Lettura</h3>
        <p class="note">Queste distribuzioni dicono <b>cosa</b> viene registrato nel dataset. Sono utili per contestualizzare le metriche di processo (es. un ciclo puo emergere perche certi tipi di nodo sono usati come “snodi”).</p>
      </div>
    </div>

    <h2>Glossario metriche (clicca per dettagli)</h2>
    <details>
      <summary>Interlacing index (%) <span>quanto EX e MK coesistono nel tempo</span></summary>
      <p>% dei bucket temporali attivi (settimane) in cui <b>Exploring</b> e <b>Making</b> sono entrambi presenti. Alto = fasi sovrapposte.</p>
    </details>
    <details>
      <summary>Overlap intensity (%) <span>quanto EX e MK sono bilanciati quando coesistono</span></summary>
      <p>Nei bucket overlap: media di <code>min(EX,MK) / max(EX,MK)</code>. Alto = coesistenza bilanciata, basso = una fase domina anche quando l'altra appare.</p>
    </details>
    <details>
      <summary>Cross-area edges (%) <span>movimenti orizzontali tra macro-aree</span></summary>
      <p>Tra gli archi i cui estremi hanno una macro-area (Speculative/Communication/Interaction): % che connette macro-aree diverse. Alto = transizioni disciplinari frequenti.</p>
    </details>
    <details>
      <summary>Cross-area interlacing (%) <span>interlacing che attraversa discipline</span></summary>
      <p>Tra gli archi EX↔MK (E→M o M→E) con macro-area su entrambi gli estremi: % che attraversa macro-aree. Alto = l'interazione EX/MK avviene spesso anche in attraversamento disciplinare.</p>
    </details>
    <details>
      <summary>Cycle participation (%) <span>cicli e iterazione</span></summary>
      <p>% di nodi che appartengono a una <b>Strongly Connected Component</b> non banale (dimensione ≥ 2). Alto = loop strutturali nel grafo (iterazioni, ritorni).</p>
    </details>
    <details>
      <summary>Conversion E→M (%) <span>quanta exploring produce making</span></summary>
      <p>% di nodi Exploring che hanno almeno un arco uscente verso un nodo Making. Alto = molte esplorazioni portano a produzione.</p>
    </details>
    <details>
      <summary>Return M→E / E→M (%) <span>feedback dal fare al riflettere</span></summary>
      <p>Rapporto tra archi M→E e archi E→M (in %). Alto = forte “ritorno” da making a exploring (revisione, ripensamento).</p>
    </details>
    <details>
      <summary>Lead time E→M (median days) <span>tempo tipico tra esplorare e fare</span></summary>
      <p>Mediana dei giorni tra estremi di archi E→M quando entrambe le date sono presenti e non negative. E' una stima robusta (mediana) ma sensibile a date mancanti/approssimate.</p>
    </details>
    <details>
      <summary>Convergent/Divergent hubs <span>nodi critici (molti ingressi/uscite)</span></summary>
      <p>Conta nodi con in-degree / out-degree ≥ soglia (default ${escapeHtml(
        opts.hubThreshold
      )}). Convergent = punti di convergenza (molti input), Divergent = punti di diramazione (molti output).</p>
    </details>
    <details>
      <summary>Temporal back-edges (%) <span>archi che vanno indietro nel tempo</span></summary>
      <p>% di archi con date su entrambi gli estremi dove la destinazione e precedente alla sorgente. Può indicare ritorni reali, ma anche rumore (date incomplete o non allineate).</p>
    </details>

    <h2>Metriche aggregate (tra progetti)</h2>
    <div class="panel">
      <table class="small">
        <thead>
          <tr><th>Metrica</th><th>Media</th><th>Mediana</th><th>Min</th><th>Max</th></tr>
        </thead>
        <tbody>
          <tr><td>Interlacing index (%)</td><td>${fmt(summary.agg.interlacingIndex.mean)}</td><td>${fmt(
    summary.agg.interlacingIndex.median
  )}</td><td>${fmt(summary.agg.interlacingIndex.min)}</td><td>${fmt(summary.agg.interlacingIndex.max)}</td></tr>
          <tr><td>Overlap intensity (%)</td><td>${fmt(summary.agg.overlapIntensity.mean)}</td><td>${fmt(
    summary.agg.overlapIntensity.median
  )}</td><td>${fmt(summary.agg.overlapIntensity.min)}</td><td>${fmt(summary.agg.overlapIntensity.max)}</td></tr>
          <tr><td>Cycle participation (%)</td><td>${fmt(summary.agg.cycleParticipation.mean)}</td><td>${fmt(
    summary.agg.cycleParticipation.median
  )}</td><td>${fmt(summary.agg.cycleParticipation.min)}</td><td>${fmt(summary.agg.cycleParticipation.max)}</td></tr>
          <tr><td>Cross-area interlacing (%)</td><td>${fmt(summary.agg.crossInterlacingShare.mean)}</td><td>${fmt(
    summary.agg.crossInterlacingShare.median
  )}</td><td>${fmt(summary.agg.crossInterlacingShare.min)}</td><td>${fmt(summary.agg.crossInterlacingShare.max)}</td></tr>
          <tr><td>Conversion E→M (%)</td><td>${fmt(summary.agg.conversionRate.mean)}</td><td>${fmt(
    summary.agg.conversionRate.median
  )}</td><td>${fmt(summary.agg.conversionRate.min)}</td><td>${fmt(summary.agg.conversionRate.max)}</td></tr>
          <tr><td>Return M→E / E→M (%)</td><td>${fmt(summary.agg.feedbackRatio.mean)}</td><td>${fmt(
    summary.agg.feedbackRatio.median
  )}</td><td>${fmt(summary.agg.feedbackRatio.min)}</td><td>${fmt(summary.agg.feedbackRatio.max)}</td></tr>
          <tr><td>Lead time E→M (median days)</td><td>${fmt(summary.agg.leadtimeMedianDays.mean)}</td><td>${fmt(
    summary.agg.leadtimeMedianDays.median
  )}</td><td>${fmt(summary.agg.leadtimeMedianDays.min)}</td><td>${fmt(summary.agg.leadtimeMedianDays.max)}</td></tr>
          <tr><td>Cross-area edges (%)</td><td>${fmt(summary.agg.crossMacroShare.mean)}</td><td>${fmt(
    summary.agg.crossMacroShare.median
  )}</td><td>${fmt(summary.agg.crossMacroShare.min)}</td><td>${fmt(summary.agg.crossMacroShare.max)}</td></tr>
          <tr><td>Multi-area nodes (%)</td><td>${fmt(summary.agg.multiAreaShare.mean)}</td><td>${fmt(
    summary.agg.multiAreaShare.median
  )}</td><td>${fmt(summary.agg.multiAreaShare.min)}</td><td>${fmt(summary.agg.multiAreaShare.max)}</td></tr>
          <tr><td>Temporal back-edges (%)</td><td>${fmt(summary.agg.temporalBackShare.mean)}</td><td>${fmt(
    summary.agg.temporalBackShare.median
  )}</td><td>${fmt(summary.agg.temporalBackShare.min)}</td><td>${fmt(summary.agg.temporalBackShare.max)}</td></tr>
        </tbody>
      </table>
      <div class="btns">
        <button id="btnCsv">Scarica CSV metriche</button>
        <button onclick="window.print()">Stampa / Salva PDF</button>
      </div>
    </div>

    <h2>Distribuzioni rapide (eterogeneita tra progetti)</h2>
    <div class="grid">
      <div class="panel">
        <div class="svgbox" id="svg-interlacing">${exMkMixSvg}</div>
        <div class="btns"><button data-dlsvg="interlacing" data-fn="interlacing_index_per_progetto.svg">Scarica SVG</button></div>
      </div>
      <div class="panel">
        <div class="svgbox" id="svg-cycles">${cyclesSvg}</div>
        <div class="btns"><button data-dlsvg="cycles" data-fn="cycle_participation_per_progetto.svg">Scarica SVG</button></div>
      </div>
      <div class="panel">
        <div class="svgbox" id="svg-cross">${crossSvg}</div>
        <div class="btns"><button data-dlsvg="cross" data-fn="cross_area_interlacing_per_progetto.svg">Scarica SVG</button></div>
      </div>
      <div class="panel">
        <h3>Note</h3>
        <p class="note">Se le barre mostrano valori alti e “stabili” tra progetti: supporto a una lettura macro (interlacing strutturale). Se oscillano: supporto a una tesi di eterogeneita e situatezza (nessun modello unico).</p>
      </div>
    </div>

    <h2>Metriche per progetto (tabella A)</h2>
    <div class="panel">
      <table class="small">
        <thead>
          <tr>
            <th>Progetto</th><th>Nodi</th><th>Archi</th><th>EX</th><th>MK</th>
            <th>Interlace%</th><th>Overlap%</th><th>Cycle%</th><th>CrossInt%</th>
            <th>Conv%</th><th>Return%</th><th>Lead(d)</th>
          </tr>
        </thead>
        <tbody>
          ${metrics
            .map(
              (m) => `<tr>
                <td>${escapeHtml(m.project)}</td>
                <td>${fmt(m.nodes, 0)}</td><td>${fmt(m.edges, 0)}</td><td>${fmt(m.exploring, 0)}</td><td>${fmt(
                m.making,
                0
              )}</td>
                <td>${fmt(m.interlacingIndex)}</td><td>${fmt(m.overlapIntensity)}</td><td>${fmt(
                m.cycleParticipation
              )}</td><td>${fmt(m.crossInterlacingShare)}</td>
                <td>${fmt(m.conversionRate)}</td><td>${fmt(m.feedbackRatio)}</td><td>${
                m.leadtimeMedianDays == null ? "-" : fmt(m.leadtimeMedianDays)
              }</td>
              </tr>`
            )
            .join("\n")}
        </tbody>
      </table>
    </div>

    <h2>Metriche per progetto (tabella B)</h2>
    <div class="panel">
      <table class="small">
        <thead>
          <tr>
            <th>Progetto</th><th>MultiArea%</th><th>AvgAreas</th><th>CrossArea%</th>
            <th>SCC#</th><th>LargestSCC</th><th>Recip</th>
            <th>ConvHub</th><th>DivHub</th><th>Sources</th><th>Sinks</th><th>Density%</th><th>MacroCov%</th><th>BackEdges%</th>
          </tr>
        </thead>
        <tbody>
          ${metrics
            .map(
              (m) => `<tr>
                <td>${escapeHtml(m.project)}</td>
                <td>${fmt(m.multiAreaShare)}</td><td>${fmt(m.avgAreas, 2)}</td><td>${fmt(m.crossMacroShare)}</td>
                <td>${fmt(m.sccCount, 0)}</td><td>${fmt(m.largestScc, 0)}</td><td>${fmt(m.reciprocityPairs, 0)}</td>
                <td>${fmt(m.convergent, 0)}</td><td>${fmt(m.divergent, 0)}</td><td>${fmt(m.sources, 0)}</td><td>${fmt(
                m.sinks,
                0
              )}</td>
                <td>${fmt(m.density, 2)}</td><td>${fmt(m.macroEdgeCoverage, 1)}</td><td>${fmt(m.temporalBackShare, 1)}</td>
              </tr>`
            )
            .join("\n")}
        </tbody>
      </table>
      <p class="note">MacroCov% = % archi per cui entrambe le estremita hanno una macro-area riconosciuta (copertura dei dati area).</p>
    </div>

    <h2>Schema medio MK/EX (settimane relative)</h2>
    <div class="panel">
      <p class="note">Calcolato su ${timeline.projectsUsed} progetti · finestra robusta: prime ${escapeHtml(
    opts.maxWeeks
  )} settimane relative all'inizio.</p>
      ${
        timelineSvg
          ? `<div class="svgbox" id="svg-timeline">${timelineSvg}</div>
             <div class="btns"><button data-dlsvg="timeline" data-fn="mk_ex_media_all_projects.svg">Scarica SVG</button></div>`
          : `<p class="note">File mancante: mk_ex_media_all_projects.svg</p>`
      }
      <table class="small" style="margin-top:12px">
        <thead><tr><th>Week</th><th>EX avg</th><th>MK avg</th><th>Total avg</th></tr></thead>
        <tbody>
          ${timeline.weeks
            .slice(0, Math.min(24, timeline.weeks.length))
            .map((w) => `<tr><td>${w.week}</td><td>${w.ex.toFixed(2)}</td><td>${w.mk.toFixed(
              2
            )}</td><td>${w.total.toFixed(2)}</td></tr>`)
            .join("\n")}
        </tbody>
      </table>
    </div>

    <h2>Conclusioni (data-grounded)</h2>
    <div class="panel">
      <p><b>Interlacing</b> (mediana): ${fmt(summary.agg.interlacingIndex.median)}% · <b>Cicli</b> (mediana): ${fmt(
    summary.agg.cycleParticipation.median
  )}% · <b>Cross-area interlacing</b> (mediana): ${fmt(summary.agg.crossInterlacingShare.median)}%.</p>
      <p class="note">Interpretazione suggerita: valori alti e coerenti supportano l'idea di processi <b>interlaced</b> (fasi sovrapposte), <b>orizzontali</b> (attraversamenti disciplinari) e <b>iterativi</b> (cicli). Valori variabili evidenziano la <b>situatezza</b> e la difficolta di imporre ontologie forti (es. Double Diamond) come modello unico.</p>
      <p class="note">Prossimo step utile: affiancare queste metriche con letture qualitative (revisioni/appunti) per interpretare i picchi (perche un hub? perche un ciclo?) senza “domesticare il mess”.</p>
    </div>

    <script type="application/json" id="metrics-json">${escapeHtml(JSON.stringify(metrics))}</script>
    <script type="application/json" id="csv-data">${escapeHtml(csv)}</script>
    <script>
      function downloadText(filename, text, mime){
        const blob = new Blob([text], {type: mime || "text/plain"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 500);
      }
      function svgFromContainerId(id){
        const el = document.getElementById(id);
        if(!el) return "";
        const svg = el.querySelector("svg");
        if(!svg) return "";
        return new XMLSerializer().serializeToString(svg);
      }
      document.getElementById("btnCsv")?.addEventListener("click", () => {
        const csv = document.getElementById("csv-data")?.textContent || "";
        downloadText("threadscape_process_metrics.csv", csv, "text/csv");
      });
      document.querySelectorAll("button[data-dlsvg]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const kind = btn.getAttribute("data-dlsvg");
          const fn = btn.getAttribute("data-fn") || "chart.svg";
          let id = "";
          if(kind === "interlacing") id = "svg-interlacing";
          else if(kind === "cycles") id = "svg-cycles";
          else if(kind === "cross") id = "svg-cross";
          else if(kind === "timeline") id = "svg-timeline";
          const svg = svgFromContainerId(id);
          if(!svg) return;
          downloadText(fn, svg, "image/svg+xml");
        });
      });
    </script>
  </div>
</body>
</html>`;

  fs.writeFileSync(outHtml, html, "utf8");
  console.log(outHtml);
}

main();
