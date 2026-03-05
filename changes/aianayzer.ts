// @ts-nocheck
/**
 * aiAnalyzer.js -- HMO Claims AI Analysis Engine
 * ----------------------------------------------
 *
 * Builds rich, data-grounded prompts from the aggregated analytics
 * computed by dataParser.js for each client company.
 *
 * Currency: Philippine Peso (₱)
 * Data source: HMO claim-level records aggregated by Entity
 *
 * Exports:
 *   generateAiAnalysis({ client, storyId, xlsxMetrics })
 *   clearAiCache()
 *   getAiCacheStatus()
 *   deleteAiCacheEntry(key)
 */

const fetch = require('node-fetch');

const aiCache = new Map();

// -------------------------------------------------------------
// STORY CONTEXT -- what each analysis card focuses on
// -------------------------------------------------------------
const STORY_CONTEXT = {
  cost_trend:
    "overall HMO claims cost trends -- total approved amount, PMPM/PMPY changes, " +
    "claim type breakdown (Dental/Medical/Optical/Maternity), quarter-over-quarter " +
    "and year-over-year trend vs prior policy year",

  top5_diagnosis:
    "top 5 illness groups driving approved claim spend -- Digestive, Musculoskeletal, " +
    "Cardiovascular, Respiratory, Neoplasms -- prevalence by claim count, cost per illness " +
    "group, ICD code concentration, and targeted intervention opportunities",

  high_cost:
    "high-cost claimants -- members whose total approved spend approaches or exceeds MBL " +
    "(Maximum Benefit Limit of ₱400,000), member cost distribution bands, stop-loss " +
    "exposure, rising-risk member identification and case management opportunities",

  census_analysis:
    "member census demographics -- age band distribution (31-35 and 36-40 predominant), " +
    "gender split, Employee vs Dependent ratio, civil status mix, plan level distribution " +
    "(Platinum/Basic/Staff), category breakdown, active enrollment trend",

  utilization:
    "healthcare utilisation patterns -- Clinic vs Hospital vs Specialist facility split, " +
    "claim frequency per member, Fund type (HMO) utilisation, seasonal claim patterns " +
    "by quarter, and network efficiency indicators",

  plan_perf:
    "health plan performance -- plan level cost comparison (Platinum vs Basic vs Staff plans), " +
    "benefit utilisation rates per plan, approved vs billed amount variance, cost per plan " +
    "member, and plan design optimisation recommendations",
};

// -------------------------------------------------------------
// STORY METRIC LABELS -- KPI tiles shown on Analysis View
// These use ₱ Philippine Peso as currency
// -------------------------------------------------------------
const STORY_METRIC_LABELS = {
  cost_trend:     ["Total Approved (₱)", "PMPM (₱)",            "YoY Cost Trend",        "Dental vs Medical Split"],
  top5_diagnosis: ["#1 Illness Group",   "Top Group Cost (₱)",  "Claim Concentration %", "Preventable Claim %"],
  high_cost:      ["High-Cost Members",  "% Near/Above MBL",    "Top Member Cost (₱)",   "Avg Member Cost (₱)"],
  census_analysis:["Avg Member Age",     "Dependent Ratio",     "Female Member %",        "Plan Level Spread"],
  utilization:    ["Clinic Claims %",    "Hospital Claims %",   "Claims per Member",      "Seasonal Peak Quarter"],
  plan_perf:      ["Platinum Cost PMPM", "Basic/Staff PMPM",    "Approved/Billed Ratio",  "Highest Cost Plan"],
};

// -------------------------------------------------------------
// 3-YEAR TREND PROJECTION
// Compound annual growth: projectedPMPY = currentPMPY × (1 + trendPct/100)^3
// Also computes total portfolio cost impact based on member count
// -------------------------------------------------------------
function calcThreeYearProjection(client) {
  const currentPmpy = client.analytics?.pmpy || client.pmpy || 0;
  const trend       = client.analytics?.trendPct ?? client.trendPct ?? 0;
  const members     = client.members || 0;

  // If trend is flat or negative, projection is not meaningful for "no action" framing
  if (currentPmpy <= 0 || trend <= 0) {
    return {
      pmpy:         0,
      pct:          0,
      totalCost:    0,
      currentTotal: 0,
      yearLabel:    '',
      label:        '',
      hasProjection: false,
    };
  }

  const projected3yr    = Math.round(currentPmpy * Math.pow(1 + trend / 100, 3));
  const totalGrowthPct  = parseFloat(((projected3yr - currentPmpy) / currentPmpy * 100).toFixed(1));
  const totalPortfolio  = Math.round(projected3yr * members);
  const currentPortfolio= Math.round(currentPmpy  * members);

  // Derive target year from latest policy year in data or current year
  const latestYear  = parseInt(String(client.analytics?.latestPolicyYear || '').slice(0, 4)) || new Date().getFullYear();
  const targetYear  = latestYear + 3;

  const fmtNum  = n => `₱${Number(n).toLocaleString()}`;
  const label   =
    `${fmtNum(projected3yr)} PMPY by ${targetYear} ` +
    `(+${totalGrowthPct}% from current ${fmtNum(currentPmpy)}) — ` +
    `total portfolio impact: ${fmtNum(totalPortfolio)} vs current ${fmtNum(currentPortfolio)}`;

  return {
    pmpy:          projected3yr,
    pct:           totalGrowthPct,
    totalCost:     totalPortfolio,
    currentTotal:  currentPortfolio,
    yearLabel:     String(targetYear),
    currentPmpy,
    trend,
    label,
    hasProjection: true,
  };
}

// -------------------------------------------------------------
// ANALYTICS FORMATTER
// Converts the analytics object into a readable text block
// for the AI prompt -- all numbers grounded in real data
// -------------------------------------------------------------
function formatAnalyticsForPrompt(client, storyId) {
  const a = client.analytics;
  if (!a) return "  • No computed analytics available -- use client profile to derive estimates.";

  const fmt = n => `₱${Number(n || 0).toLocaleString()}`;
  const pct = n => `${Number(n || 0).toFixed(1)}%`;

  const lines = [];

  // Always include core cost context
  lines.push(`  • Total Approved Claims: ${fmt(a.totalApproved)}`);
  lines.push(`  • Total Claims Count: ${(a.totalClaims || 0).toLocaleString()}`);
  lines.push(`  • Unique Members: ${(client.members || 0).toLocaleString()}`);
  lines.push(`  • PMPM: ${fmt(a.pmpm)} | PMPY: ${fmt(a.pmpy)}`);
  lines.push(`  • YoY Cost Trend: ${a.trendPct > 0 ? "+" : ""}${a.trendPct}%`);
  lines.push(`  • Policy Years in Data: ${Object.keys(a.costByPolicyYear || {}).join(", ") || "N/A"}`);

  // ── 3-YEAR NO-ACTION PROJECTION (injected for all stories) ──
  const proj = calcThreeYearProjection(client);
  if (proj.hasProjection) {
    lines.push(`\n  -- 3-YEAR NO-ACTION PROJECTION --`);
    lines.push(`  • IF NO ACTION IS TAKEN, projected PMPY in ${proj.yearLabel}: ₱${proj.pmpy.toLocaleString()}`);
    lines.push(`  • That is +${proj.pct}% growth from current ₱${proj.currentPmpy.toLocaleString()} PMPY`);
    lines.push(`  • Total portfolio cost impact by ${proj.yearLabel}: ₱${proj.totalCost.toLocaleString()} (vs current ₱${proj.currentTotal.toLocaleString()})`);
    lines.push(`  • Annual trend rate driving this: +${proj.trend}% per year (compounded)`);
  } else {
    lines.push(`  • Trend projection: flat or declining — no escalation risk at current trajectory`);
  }

  // Story-specific data sections
  if (storyId === "cost_trend" || storyId === "utilization" || storyId === "plan_perf") {
    if (a.claimTypeCosts && Object.keys(a.claimTypeCosts).length) {
      lines.push(`\n  -- CLAIM TYPE BREAKDOWN --`);
      Object.entries(a.claimTypeCosts)
        .sort((x, y) => y[1] - x[1])
        .forEach(([type, cost]) => {
          const cnt = a.claimTypeCounts?.[type] || 0;
          const p   = a.totalClaims ? (cnt / a.totalClaims * 100).toFixed(1) : "0";
          lines.push(`  • ${type}: ${fmt(cost)} (${p}% of claims)`);
        });
    }
    if (a.quarterCosts && Object.keys(a.quarterCosts).length) {
      lines.push(`\n  -- QUARTERLY COST --`);
      Object.entries(a.quarterCosts).sort().forEach(([q, c]) => {
        lines.push(`  • ${q}: ${fmt(c)}`);
      });
    }
    if (a.fundBreakdown) {
      lines.push(`\n  -- FUND TYPE --`);
      Object.entries(a.fundBreakdown).forEach(([f, n]) => lines.push(`  • ${f}: ${n} claims`));
    }
  }

  if (storyId === "top5_diagnosis") {
    if (a.top5Diagnoses && a.top5Diagnoses.length) {
      lines.push(`\n  -- TOP 5 ILLNESS GROUPS BY COST --`);
      a.top5Diagnoses.forEach((d, i) => {
        lines.push(`  ${i + 1}. ${d.name}: ${fmt(d.cost)} | ${d.count} claims (${d.pct}%) | Example: ${d.topIllness}`);
      });
    }
  }

  if (storyId === "high_cost") {
    lines.push(`\n  -- HIGH-COST CLAIMANT PROFILE --`);
    lines.push(`  • MBL (Max Benefit Limit): ${fmt(a.mbl)}`);
    lines.push(`  • Members Near/Above 50% MBL: ${a.highCostMembers} (${pct(a.highCostPct)} of members)`);
    lines.push(`  • Highest Single Member Cost: ${fmt(a.topMemberCost)}`);
    lines.push(`  • Average Member Cost: ${fmt(a.avgMemberCost)}`);
    if (a.memberCostBands) {
      lines.push(`\n  -- MEMBER COST DISTRIBUTION --`);
      Object.entries(a.memberCostBands).forEach(([band, count]) => {
        lines.push(`  • ${band}: ${count} members`);
      });
    }
  }

  if (storyId === "census_analysis") {
    lines.push(`\n  -- DEMOGRAPHICS --`);
    lines.push(`  • Average Age: ${a.avgAge} years`);
    if (a.ageGroups) {
      lines.push(`  • Age Bands: ${Object.entries(a.ageGroups).map(([b,n]) => `${b}:${n}`).join(", ")}`);
    }
    lines.push(`  • Gender: Male ${pct(a.malePct)} | Female ${pct(a.femalePct)}`);
    lines.push(`  • Employees: ${a.employeeCount} | Dependents: ${a.dependentCount} | Ratio: ${a.dependentRatio}:1`);
    if (a.civilStatusCounts) {
      lines.push(`  • Civil Status: ${Object.entries(a.civilStatusCounts).map(([k,v]) => `${k}:${v}`).join(", ")}`);
    }
    if (a.planLevelCosts) {
      lines.push(`\n  -- PLAN LEVELS --`);
      Object.entries(a.planLevelCosts)
        .sort((x, y) => y[1] - x[1])
        .forEach(([plan, cost]) => {
          const cnt = a.planLevelCounts?.[plan] || 0;
          lines.push(`  • ${plan}: ${fmt(cost)} | ${cnt} members`);
        });
    }
    lines.push(`  • Category: ${a.category} | Member Type: ${a.memberType}`);
    lines.push(`  • Branch/es: ${(a.branches || []).join(", ") || "N/A"}`);
  }

  if (storyId === "utilization") {
    if (a.facilityTypeCounts) {
      lines.push(`\n  -- FACILITY TYPE UTILISATION --`);
      Object.entries(a.facilityTypeCounts).sort((x,y) => y[1]-x[1]).forEach(([ft, cnt]) => {
        const cost = a.facilityCosts?.[ft] || 0;
        lines.push(`  • ${ft}: ${cnt} claims | ${fmt(cost)}`);
      });
    }
    lines.push(`  • Claims per Member: ${(a.totalClaims / Math.max(client.members, 1)).toFixed(1)}`);
    lines.push(`  • Chronic-related Claims: ${a.chronicClaims} (${pct(a.chronicPct)})`);
  }

  if (storyId === "plan_perf") {
    if (a.planLevelCosts) {
      lines.push(`\n  -- PLAN PERFORMANCE --`);
      Object.entries(a.planLevelCosts).sort((x,y) => y[1]-x[1]).forEach(([plan, cost]) => {
        const cnt      = a.planLevelCounts?.[plan] || 1;
        const planPmpm = Math.round(cost / cnt / Math.max(a.numMonths, 1));
        lines.push(`  • ${plan}: ${fmt(cost)} total | ₱${planPmpm.toLocaleString()} PMPM | ${cnt} members`);
      });
    }
    lines.push(`  • Billed vs Approved: ${fmt(a.totalBilled)} billed -> ${fmt(a.totalApproved)} approved`);
  }

  return lines.join("\n");
}

// -------------------------------------------------------------
// PROMPT BUILDER
// -------------------------------------------------------------
function buildPrompt(client, storyId, xlsxMetrics) {
  const ctx    = STORY_CONTEXT[storyId]       || "HMO employee benefits claims analysis";
  const labels = STORY_METRIC_LABELS[storyId] || ["Metric 1", "Metric 2", "Metric 3", "Metric 4"];

  // Pre-compute 3-year projection so we can reference it in the prompt rules
  const proj = calcThreeYearProjection(client);

  // Use real aggregated analytics if available, else fallback to xlsx metrics
  const hasRealAnalytics = !!(client.analytics);
  const dataBlock = hasRealAnalytics
    ? formatAnalyticsForPrompt(client, storyId)
    : (xlsxMetrics && xlsxMetrics.length
        ? xlsxMetrics.map(m =>
            `  • ${m.label}: ${m.value}${m.delta ? ` (${m.delta})` : ""}${m.bench ? ` [benchmark: ${m.bench}]` : ""}`
          ).join("\n")
        : "  • No data available -- derive estimates from client profile.");

  // Build the headline instruction dynamically based on whether projection is available
  const headlineInstruction = proj.hasProjection
    ? `"headline": "One sentence (max 25 words) that MUST follow this structure: 'Without intervention, [client name]'s claims cost will reach ₱${proj.pmpy.toLocaleString()} PMPY by ${proj.yearLabel} — a +${proj.pct}% increase.' Use EXACTLY these pre-calculated figures from the 3-YEAR NO-ACTION PROJECTION section above."`
    : `"headline": "One specific sentence (max 22 words) highlighting the single most critical cost driver with a real number or % from the data above. Since trend is flat/declining, focus on the top illness group or highest cost concentration instead."`;

  const system = `You are a Senior Employee Benefits Analyst at Marsh Philippines, specializing in HMO corporate health insurance analytics.
You produce concise, data-driven, executive-level analysis for HR Directors and CFOs of Philippine corporations.
Currency is Philippine Peso (₱). Your tone is authoritative, specific, and actionable.
RESPOND ONLY with a valid JSON object. No markdown, no preamble, no extra text.`;

  const user = `Analyze "${client.name}" for the "${storyId.replace(/_/g, " ").toUpperCase()}" story.

--- CLIENT OVERVIEW ---------------------------------
  Company:        ${client.name}
  Country:        Philippines (HMO Data)
  Total Members:  ${(client.members || 0).toLocaleString()}
  Risk Score:     ${client.riskScore || 50} / 100
  PMPY:           ₱${(client.pmpy || 0).toLocaleString()}
  YoY Cost Trend: ${client.trendPct > 0 ? "+" : ""}${client.trendPct || 0}%
  Chronic Claim %:${client.chronicPct || 0}%
  Total Approved: ₱${(client.totalCost || 0).toLocaleString()}
  Latest Policy:  ${client.analytics?.latestPolicyYear || "2022-23"}

--- STORY FOCUS -------------------------------------
  ${ctx}

--- REAL DATA FROM CLAIMS ---------------------------
${dataBlock}

--- REQUIRED OUTPUT FORMAT --------------------------
Return a JSON object with exactly these 5 fields.
Base ALL values on the real data above -- do NOT invent numbers.

{
  ${headlineInstruction},

  "insight": "2-3 sentences explaining the key driver and pattern visible in the data. Reference specific illness groups, claim types, or cost figures from the data above.",

  "so_what": "2-3 sentences on business impact for this Philippine company's HR/CFO team and the specific Marsh recommendation with estimated savings in ₱.",

  "talking_points": [
    "Specific data point from the analysis that will resonate in a client meeting.",
    "Root cause or trend that explains the pattern -- reference actual illness group or claim type.",
    "3-year no-action projection: if the current +${proj.hasProjection ? proj.trend : client.trendPct || 0}% annual trend continues unchecked, total portfolio cost will reach ₱${proj.hasProjection ? proj.totalCost.toLocaleString() : 'N/A'} by ${proj.hasProjection ? proj.yearLabel : 'year 3'} — state this figure explicitly.",
    "Specific recommended intervention: wellness program, plan design change, case management, etc. Include estimated ₱ savings if Marsh intervenes."
  ],

  "ai_metrics": [
    { "label": "${labels[0]}", "value": "MUST use real value from data", "delta": "vs prior year", "dir": "bad|good|neutral", "bench": "benchmark value", "benchLabel": "Industry" },
    { "label": "${labels[1]}", "value": "MUST use real value from data", "delta": "vs prior year", "dir": "bad|good|neutral", "bench": "benchmark value", "benchLabel": "Industry" },
    { "label": "${labels[2]}", "value": "MUST use real value from data", "delta": "vs prior year", "dir": "bad|good|neutral", "bench": "benchmark value", "benchLabel": "Industry" },
    { "label": "${labels[3]}", "value": "MUST use real value from data", "delta": "vs prior year", "dir": "bad|good|neutral", "bench": "benchmark value", "benchLabel": "Industry" }
  ]
}

RULES:
- Currency: Philippine Peso ₱, format as "₱12,345" or "₱1.2M"
- "dir" must be exactly "bad", "good", or "neutral"
- Extract ALL metric values directly from the real data block above
- Talking points must reference specific illness names, amounts, or % from the data
- The headline MUST use the pre-calculated 3-year projection figures — do not recalculate or round differently
- Do NOT use placeholder text like "e.g." or "MUST use real value" in your response`;

  return { system, user };
}

// -------------------------------------------------------------
// RESPONSE PARSER
// -------------------------------------------------------------
function parseAiResponse(rawText) {
  const cleaned = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI response contained no JSON object.");

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    throw new Error(`AI JSON parse failed: ${e.message}`);
  }

  if (!parsed.headline || !parsed.insight || !parsed.so_what) {
    throw new Error("AI response missing required fields: headline / insight / so_what.");
  }

  const talking_points = Array.isArray(parsed.talking_points)
    ? parsed.talking_points.filter(p => typeof p === "string" && p.trim()).map(p => p.trim())
    : [];

  const VALID_DIRS = new Set(["bad", "good", "neutral"]);
  const ai_metrics = Array.isArray(parsed.ai_metrics)
    ? parsed.ai_metrics.filter(m => m && m.label && m.value).map(m => ({
        label:      String(m.label      || "").trim(),
        value:      String(m.value      || "").trim(),
        delta:      String(m.delta      || "").trim(),
        dir:        VALID_DIRS.has(m.dir) ? m.dir : "neutral",
        bench:      String(m.bench      || "").trim(),
        benchLabel: String(m.benchLabel || m.benchlabel || "Industry").trim(),
      }))
    : [];

  return {
    headline:       String(parsed.headline).trim(),
    insight:        String(parsed.insight).trim(),
    so_what:        String(parsed.so_what).trim(),
    talking_points,
    ai_metrics,
  };
}

// -------------------------------------------------------------
// OPENROUTER API CALLER
// -------------------------------------------------------------
async function callOpenRouter(system, user) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model  = process.env.OPENROUTER_MODEL || "mistralai/mistral-7b-instruct";

  if (!apiKey || apiKey === "your_openrouter_api_key_here") {
    throw new Error(
      "OPENROUTER_API_KEY not set in backend/.env -- get a free key at https://openrouter.ai"
    );
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 45_000); // 45s for large data

  let response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
        "HTTP-Referer":  process.env.APP_URL  || "http://localhost:3001",
        "X-Title":       process.env.APP_NAME || "Marsh-ClaimsIQ",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,   // low = consistent, factual output
        max_tokens:  2000,  // enough for full response with all real data
        messages: [
          { role: "system", content: system },
          { role: "user",   content: user   },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenRouter API ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(`OpenRouter: ${data.error.message || JSON.stringify(data.error)}`);

  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error("OpenRouter returned empty response.");
  return rawText;
}

// -------------------------------------------------------------
// MAIN EXPORT
// -------------------------------------------------------------
async function generateAiAnalysis({ client, storyId, xlsxMetrics = [] }) {
  const cacheKey = `${client.id}_${storyId}`;

  if (aiCache.has(cacheKey)) {
    console.log(`[ai] ⚡ Cache hit: ${cacheKey}`);
    return { ...aiCache.get(cacheKey), fromCache: true };
  }

  console.log(`[ai] Generating: "${client.name}" -> "${storyId}"`);
  const { system, user } = buildPrompt(client, storyId, xlsxMetrics);
  const rawText          = await callOpenRouter(system, user);
  const result           = parseAiResponse(rawText);

  aiCache.set(cacheKey, result);
  console.log(
    `[ai] ✓ Cached: ${cacheKey} | ` +
    `metrics: ${result.ai_metrics.length} | ` +
    `talking_points: ${result.talking_points.length}`
  );
  return { ...result, fromCache: false };
}

// -------------------------------------------------------------
// CACHE MANAGEMENT
// -------------------------------------------------------------
function clearAiCache() {
  const size = aiCache.size;
  aiCache.clear();
  console.log(`[ai] Cache cleared (${size} entries removed).`);
}
function getAiCacheStatus() {
  return { size: aiCache.size, keys: [...aiCache.keys()] };
}
function deleteAiCacheEntry(key) {
  const existed = aiCache.delete(key);
  if (existed) console.log(`[ai] Cache entry deleted: ${key}`);
  return existed;
}

module.exports = {
  generateAiAnalysis,
  clearAiCache,
  getAiCacheStatus,
  deleteAiCacheEntry,
};
