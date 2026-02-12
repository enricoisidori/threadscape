#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

function escapeXml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
    return {
      id: String(n?.id || ""),
      action: action === "exploring" ? "exploring" : action === "making" ? "making" : "other",
      date,
      areas,
      macro: macroFromAreas(areas),
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

  const buckets = minDate ? computeBuckets(nodes.filter((n) => n.action !== "other"), minDate) : new Map();
  const interlacing = computeInterlacing(buckets);

  const scc = computeScc(nodes, edges, idToIndex);
  const cycleParticipation = nCount ? (scc.cyclicNodes.size / nCount) * 100 : 0;

  return {
    project: projectName,
    nodes: nCount,
    edges: eCount,
    exploring: exploringNodes.length,
    making: makingNodes.length,
    other: otherNodes.length,
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
    minDate: minDate ? minDate.toISOString().slice(0, 10) : "",
    maxDate: maxDate ? maxDate.toISOString().slice(0, 10) : "",
    spanDays,
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
    // Use overlap buckets for alignment only if dates exist; derive sparse buckets from minDate/maxDate
    // Here we approximate with a simple uniform distribution is not acceptable; instead recompute per project buckets.
    // We intentionally rebuild from the JSON again in the main loop, so this function is filled elsewhere.
    if (!m.__timeline) continue;
    projectsUsed += 1;
    for (let i = 0; i < maxWeeks; i++) {
      const b = m.__timeline[i] || { ex: 0, mk: 0 };
      ex[i] += b.ex;
      mk[i] += b.mk;
      tot[i] += b.ex + b.mk;
    }
  }

  if (!projectsUsed) return { projectsUsed: 0, weeks: [] };
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

function wPara(text, style = null) {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${escapeXml(style)}"/></w:pPr>` : "";
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function wSpacer() {
  return `<w:p><w:r><w:t xml:space="preserve"> </w:t></w:r></w:p>`;
}

function wTable(rows, opts = {}) {
  const header = !!opts.header;
  const colCount = rows.length ? rows[0].length : 1;
  const grid = Array.from({ length: colCount })
    .map(() => `<w:gridCol w:w="2400"/>`)
    .join("");
  const tblPr = `
    <w:tblPr>
      <w:tblW w:w="0" w:type="auto"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="D4D4D4"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="D4D4D4"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="D4D4D4"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="D4D4D4"/>
        <w:insideH w:val="single" w:sz="6" w:space="0" w:color="E2E2E2"/>
        <w:insideV w:val="single" w:sz="6" w:space="0" w:color="E2E2E2"/>
      </w:tblBorders>
    </w:tblPr>`;

  const trXml = rows
    .map((r, ri) => {
      const isHeader = header && ri === 0;
      const rowXml = r
        .map((cell) => {
          const shade = isHeader ? `<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>` : "";
          const bold = isHeader ? `<w:rPr><w:b/></w:rPr>` : "";
          return `
            <w:tc>
              <w:tcPr>${shade}</w:tcPr>
              <w:p>
                <w:r>${bold}<w:t xml:space="preserve">${escapeXml(cell)}</w:t></w:r>
              </w:p>
            </w:tc>`;
        })
        .join("");
      return `<w:tr>${rowXml}</w:tr>`;
    })
    .join("");

  return `<w:tbl>${tblPr}<w:tblGrid>${grid}</w:tblGrid>${trXml}</w:tbl>`;
}

function wInlineImage(relId, widthEmu, heightEmu, name, docPrId = 1) {
  const cx = Math.max(1, Math.floor(widthEmu));
  const cy = Math.max(1, Math.floor(heightEmu));
  const safeName = escapeXml(name || "Image");
  const safeRel = escapeXml(relId || "rId2");
  return `<w:p>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:docPr id="${Math.max(1, Math.floor(docPrId))}" name="${safeName}"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="0" name="${safeName}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="${safeRel}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="${cx}" cy="${cy}"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`;
}

function buildDocxXml(title, metrics, summary, timeline, opts, hasTimelineSvg) {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const body = [];
  body.push(wPara(title, "Title"));
  body.push(wPara(`Generated: ${dateStr}`));
  body.push(wSpacer());

  body.push(wPara("Method & limits", "Heading1"));
  body.push(wPara("This report summarizes a directed graph representation of student design processes."));
  body.push(
    wPara(
      "Important: metrics are descriptive approximations of what was documented/coded (nodes, links, tags), not a measurement of the full lived process."
    )
  );
  body.push(
    wPara(
      "Use aggregates for macro patterns; keep per-project distributions to avoid erasing specificity (outliers, different briefs, different documentation intensity)."
    )
  );
  body.push(wSpacer());

  body.push(wPara("Metric glossary (quick)", "Heading1"));
  [
    "Interlacing index (%): % of active time-buckets where EX and MK coexist (overlap in time).",
    "Overlap intensity (%): in overlap buckets, how balanced EX vs MK are (mean of min/max).",
    "Cross-area edges (%): among edges whose endpoints have a macro-area, % that connect different macro-areas.",
    "Cross-area interlacing (%): among E↔M edges with macro-area on both ends, % that cross macro-areas.",
    "Cycle participation (%): % of nodes that belong to a non-trivial SCC (cycle structure).",
    "Conversion E→M (%): % of EX nodes that have at least one outgoing edge to an MK node.",
    "Return M→E / E→M (%): how much the graph “returns” from making to exploring (feedback).",
    "Lead time E→M (median days): median time gap on E→M edges (when both endpoints have dates).",
    "Convergent / Divergent hubs: nodes with in-degree/out-degree ≥ hub threshold (default 4).",
    "Density (%): directed density = E / (N*(N-1)) as percent (sensitive to graph size).",
  ].forEach((t) => body.push(wPara(`- ${t}`)));
  body.push(wSpacer());

  body.push(wPara("Dataset overview", "Heading1"));
  body.push(wPara(`Projects: ${summary.projectCount}`));
  body.push(wPara(`Total nodes: ${summary.totalNodes} · Total edges: ${summary.totalEdges}`));
  body.push(wPara(`Total Exploring: ${summary.totalExploring} · Total Making: ${summary.totalMaking}`));
  body.push(wPara(`Hub threshold (in/out-degree): ${opts.hubThreshold}`));
  if (summary.flaggedProjects.length) {
    body.push(wPara("Flagged projects (date span suspicious):", "Heading2"));
    summary.flaggedProjects.forEach((p) => body.push(wPara(`- ${p}`)));
  }
  body.push(wSpacer());

  body.push(wPara("Aggregate metrics (across projects)", "Heading1"));
  body.push(
    wTable(
      [
        ["Metric", "Mean", "Median", "Min", "Max"],
        ["Interlacing index (%)", fmt(summary.agg.interlacingIndex.mean), fmt(summary.agg.interlacingIndex.median), fmt(summary.agg.interlacingIndex.min), fmt(summary.agg.interlacingIndex.max)],
        ["Overlap intensity (%)", fmt(summary.agg.overlapIntensity.mean), fmt(summary.agg.overlapIntensity.median), fmt(summary.agg.overlapIntensity.min), fmt(summary.agg.overlapIntensity.max)],
        ["Cycle participation (%)", fmt(summary.agg.cycleParticipation.mean), fmt(summary.agg.cycleParticipation.median), fmt(summary.agg.cycleParticipation.min), fmt(summary.agg.cycleParticipation.max)],
        ["Cross-area interlacing (%)", fmt(summary.agg.crossInterlacingShare.mean), fmt(summary.agg.crossInterlacingShare.median), fmt(summary.agg.crossInterlacingShare.min), fmt(summary.agg.crossInterlacingShare.max)],
        ["Conversion E→M (%)", fmt(summary.agg.conversionRate.mean), fmt(summary.agg.conversionRate.median), fmt(summary.agg.conversionRate.min), fmt(summary.agg.conversionRate.max)],
        ["Return M→E / E→M (%)", fmt(summary.agg.feedbackRatio.mean), fmt(summary.agg.feedbackRatio.median), fmt(summary.agg.feedbackRatio.min), fmt(summary.agg.feedbackRatio.max)],
        ["Lead time E→M (median days)", fmt(summary.agg.leadtimeMedianDays.mean), fmt(summary.agg.leadtimeMedianDays.median), fmt(summary.agg.leadtimeMedianDays.min), fmt(summary.agg.leadtimeMedianDays.max)],
        ["Cross-area edges (%)", fmt(summary.agg.crossMacroShare.mean), fmt(summary.agg.crossMacroShare.median), fmt(summary.agg.crossMacroShare.min), fmt(summary.agg.crossMacroShare.max)],
        ["Multi-area nodes (%)", fmt(summary.agg.multiAreaShare.mean), fmt(summary.agg.multiAreaShare.median), fmt(summary.agg.multiAreaShare.min), fmt(summary.agg.multiAreaShare.max)],
      ],
      { header: true }
    )
  );
  body.push(wSpacer());

  body.push(wPara("Per-project metrics (table A)", "Heading1"));
  const headerA = [
    "Project",
    "Nodes",
    "Edges",
    "EX",
    "MK",
    "Interlace%",
    "Overlap%",
    "Cycle%",
    "CrossInt%",
    "Conv%",
    "Return%",
    "Lead(d)",
  ];
  const rowsA = [headerA].concat(
    metrics.map((m) => [
      m.project,
      fmt(m.nodes, 0),
      fmt(m.edges, 0),
      fmt(m.exploring, 0),
      fmt(m.making, 0),
      fmt(m.interlacingIndex),
      fmt(m.overlapIntensity),
      fmt(m.cycleParticipation),
      fmt(m.crossInterlacingShare),
      fmt(m.conversionRate),
      fmt(m.feedbackRatio),
      m.leadtimeMedianDays == null ? "-" : fmt(m.leadtimeMedianDays),
    ])
  );
  body.push(wTable(rowsA, { header: true }));
  body.push(wSpacer());

  body.push(wPara("Per-project metrics (table B)", "Heading1"));
  const headerB = [
    "Project",
    "MultiArea%",
    "AvgAreas",
    "CrossArea%",
    "SCC#",
    "LargestSCC",
    "Recip",
    "ConvHub",
    "DivHub",
    "Density%",
    "MacroCov%",
  ];
  const rowsB = [headerB].concat(
    metrics.map((m) => [
      m.project,
      fmt(m.multiAreaShare),
      fmt(m.avgAreas, 2),
      fmt(m.crossMacroShare),
      fmt(m.sccCount, 0),
      fmt(m.largestScc, 0),
      fmt(m.reciprocityPairs, 0),
      fmt(m.convergent, 0),
      fmt(m.divergent, 0),
      fmt(m.density, 2),
      fmt(m.macroEdgeCoverage, 1),
    ])
  );
  body.push(wTable(rowsB, { header: true }));
  body.push(wSpacer());

  body.push(wPara("Comparisons (rankings)", "Heading1"));
  const topK = 5;
  const rank = (key) =>
    [...metrics]
      .filter((m) => m[key] != null && Number.isFinite(m[key]))
      .sort((a, b) => b[key] - a[key])
      .slice(0, topK)
      .map((m, i) => `${i + 1}. ${m.project} (${fmt(m[key])})`);
  body.push(wPara("Top interlacing index:", "Heading2"));
  rank("interlacingIndex").forEach((t) => body.push(wPara(t)));
  body.push(wPara("Top cycle participation:", "Heading2"));
  rank("cycleParticipation").forEach((t) => body.push(wPara(t)));
  body.push(wPara("Top cross-area interlacing:", "Heading2"));
  rank("crossInterlacingShare").forEach((t) => body.push(wPara(t)));
  body.push(wSpacer());

  body.push(wPara("MK/EX average schema (relative weeks)", "Heading1"));
  body.push(wPara(`Computed on ${timeline.projectsUsed} projects · capped to first ${opts.maxWeeks} weeks.`));
  if (hasTimelineSvg) {
    body.push(wPara("MK/EX cohort average (vector chart)", "Heading2"));
    // 6.5in width; height keeps ~1400x760 aspect ratio.
    body.push(wInlineImage("rId2", 5943600, 3226000, "MK/EX cohort average", 1));
  }
  const weeksPreview = timeline.weeks.slice(0, Math.min(24, timeline.weeks.length));
  const rowsT = [["Week", "EX avg", "MK avg", "Total avg"]].concat(
    weeksPreview.map((w) => [String(w.week), w.ex.toFixed(2), w.mk.toFixed(2), w.total.toFixed(2)])
  );
  body.push(wTable(rowsT, { header: true }));
  body.push(wPara("See also: mk_ex_media_all_projects.svg (vector chart)."));
  body.push(wSpacer());

  body.push(wPara("Conclusion (data-grounded)", "Heading1"));
  body.push(
    wPara(
      `Interlacing index median: ${fmt(summary.agg.interlacingIndex.median)}% · Cycle participation median: ${fmt(
        summary.agg.cycleParticipation.median
      )}% · Cross-area interlacing median: ${fmt(summary.agg.crossInterlacingShare.median)}%.`
    )
  );
  body.push(
    wPara(
      "If interlacing and cycle metrics are consistently high across projects, this supports claims of overlapped phases, horizontal movements, and iterative loops; if they vary widely, the report highlights heterogeneity rather than a single prescriptive model."
    )
  );

  body.push(`<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="850" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`);

  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
              xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
    <w:body>
      ${body.join("\n")}
    </w:body>
  </w:document>`;
  return doc;
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:after="240"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="40"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="30"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:qFormat/>
    <w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
</w:styles>`;
}

function writeDocx(outPath, documentXml, title, mediaParts = []) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "threadscape-docx-"));
  const relsDir = path.join(tmp, "_rels");
  const wordDir = path.join(tmp, "word");
  const wordRelsDir = path.join(wordDir, "_rels");
  const mediaDir = path.join(wordDir, "media");
  const docPropsDir = path.join(tmp, "docProps");
  fs.mkdirSync(relsDir, { recursive: true });
  fs.mkdirSync(wordDir, { recursive: true });
  fs.mkdirSync(wordRelsDir, { recursive: true });
  fs.mkdirSync(docPropsDir, { recursive: true });
  if (mediaParts.length) fs.mkdirSync(mediaDir, { recursive: true });

  const extraDefaults = new Map();
  for (const part of mediaParts) {
    const ext = path.extname(part.filename || "").replace(/^\./, "").toLowerCase();
    if (!ext || ext === "xml" || ext === "rels") continue;
    if (ext === "svg") extraDefaults.set(ext, "image/svg+xml");
    else if (ext === "png") extraDefaults.set(ext, "image/png");
    else if (ext === "jpg" || ext === "jpeg") extraDefaults.set(ext, "image/jpeg");
    else if (ext === "gif") extraDefaults.set(ext, "image/gif");
    else extraDefaults.set(ext, `image/${ext}`);
  }
  const extraDefaultsXml = [...extraDefaults.entries()]
    .map(([ext, ct]) => `  <Default Extension="${escapeXml(ext)}" ContentType="${escapeXml(ct)}"/>`)
    .join("\n");

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
${extraDefaultsXml ? `${extraDefaultsXml}\n` : ""}  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const imageRelsXml = mediaParts
    .map(
      (p) =>
        `  <Relationship Id="${escapeXml(p.relId)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${escapeXml(
          p.filename
        )}"/>`
    )
    .join("\n");
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
${imageRelsXml ? `${imageRelsXml}\n` : ""}</Relationships>`;

  const now = new Date();
  const created = now.toISOString();
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:dcmitype="http://purl.org/dc/dcmitype/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>Threadscape</dc:creator>
  <cp:lastModifiedBy>Threadscape</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>
</cp:coreProperties>`;

  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
            xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Threadscape</Application>
</Properties>`;

  fs.writeFileSync(path.join(tmp, "[Content_Types].xml"), contentTypes, "utf8");
  fs.writeFileSync(path.join(relsDir, ".rels"), rootRels, "utf8");
  fs.writeFileSync(path.join(wordDir, "document.xml"), documentXml, "utf8");
  fs.writeFileSync(path.join(wordDir, "styles.xml"), buildStylesXml(), "utf8");
  fs.writeFileSync(path.join(wordRelsDir, "document.xml.rels"), docRels, "utf8");
  fs.writeFileSync(path.join(docPropsDir, "core.xml"), core, "utf8");
  fs.writeFileSync(path.join(docPropsDir, "app.xml"), app, "utf8");
  for (const part of mediaParts) {
    fs.writeFileSync(path.join(mediaDir, part.filename), part.data);
  }

  const absOut = path.resolve(outPath);
  try {
    execFileSync("zip", ["-X", "-r", absOut, "."], { cwd: tmp, stdio: "ignore" });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const outDocx = opts.output || path.join(cwd, "threadscape_process_report.docx");

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

  // Also build per-project timelines for the cohort-average table.
  for (const pf of projectFiles) {
    const json = JSON.parse(fs.readFileSync(pf.file, "utf8"));
    const m = computeMetricsForProject(pf.name, json, opts);

    // Timeline: first N weeks relative to earliest dated EX/MK node.
    const nodes = (json.nodes || []).map((n) => ({
      action: String(n?.data?.action || "").toLowerCase().trim(),
      date: parseDate(n?.data?.date || ""),
    }));
    const em = nodes.filter((n) => n.date && (n.action === "exploring" || n.action === "making"));
    if (em.length) {
      const min = new Date(Math.min(...em.map((n) => n.date.getTime())));
      min.setHours(0, 0, 0, 0);
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const tl = Array(Math.max(4, opts.maxWeeks)).fill(null).map(() => ({ ex: 0, mk: 0 }));
      for (const n of em) {
        const w = Math.max(0, Math.floor((n.date.getTime() - min.getTime()) / weekMs));
        if (w >= tl.length) continue;
        if (n.action === "exploring") tl[w].ex += 1;
        if (n.action === "making") tl[w].mk += 1;
      }
      m.__timeline = tl;
    }

    if (m.spanDays != null && m.spanDays > 365 * 20) flagged.push(`${pf.name} (span ~${Math.round(m.spanDays / 365)}y)`);
    metrics.push(m);
    totalNodes += m.nodes;
    totalEdges += m.edges;
    totalExploring += m.exploring;
    totalMaking += m.making;
  }

  // Summary across projects for numeric metrics.
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
    agg: {
      interlacingIndex: agg.interlacingIndex,
      overlapIntensity: agg.overlapIntensity,
      cycleParticipation: agg.cycleParticipation,
      crossInterlacingShare: agg.crossInterlacingShare,
      conversionRate: agg.conversionRate,
      feedbackRatio: agg.feedbackRatio,
      leadtimeMedianDays: agg.leadtimeMedianDays,
      crossMacroShare: agg.crossMacroShare,
      multiAreaShare: agg.multiAreaShare,
    },
  };

  const timeline = buildAverageTimeline(metrics, opts);

  // Sort rows by folder name for stability.
  metrics.sort((a, b) => a.project.localeCompare(b.project, "en"));

  const svgPath = path.join(cwd, "mk_ex_media_all_projects.svg");
  const timelineSvg = fs.existsSync(svgPath) ? fs.readFileSync(svgPath, "utf8") : "";
  const mediaParts = timelineSvg
    ? [{ relId: "rId2", filename: "mk_ex_media_all_projects.svg", data: timelineSvg }]
    : [];

  const docXml = buildDocxXml(opts.title, metrics, summary, timeline, opts, !!timelineSvg);
  writeDocx(outDocx, docXml, opts.title, mediaParts);
  console.log(outDocx);
}

main();
