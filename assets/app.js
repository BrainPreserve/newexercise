/* BrainPreserve — Brain Exercise App
   app.js (2025-10-01)
   Fixes included:
   1) PLAN: show ALL matching protocols (no arbitrary 3‑item limit), match exercise_type (Resistance/Aerobic/Both),
      and render BOTH Non‑AI "Coaching" and "AI Coaching" per protocol.
   2) LIBRARY: multi‑select filters now combine Exercise Type(s) AND Goal(s). Protocols appear if:
        - type matches any selected Exercise Type(s) (if any are selected); AND
        - at least one selected Goal *_goal column has value 1 (if any are selected).
      For each result, render BOTH Coaching blocks.
   3) Goals populate strictly from columns whose headers contain "_goal" (as requested).
   4) Robust CSV loader (tolerates quotes and commas), dynamic header mapping, and safe fallbacks.
   5) Tabs, clear buttons, and error handling hardened. CSP‑friendly (all JS is external).

   Expected CSV columns (case-insensitive; flexible naming supported):
     - title
     - exercise_type (values like "Resistance", "Aerobic", "Muscular" accepted; "Muscular" normalizes to "Resistance")
     - protocol_start
     - progression_rule
     - contraindications_flags (optional)
     - coach_prompt_api (optional, used to build the AI prompt)
     - multiple *_goal columns (e.g., vo2_max_goal, cv_goal, body_comp_goal, etc.) with values 0/1
     - optional tags

   Assumed Netlify function for AI:
     /.netlify/functions/coach   (POST { question, context })
   If the function is missing or returns an error, a deterministic, non‑API coaching summary is shown as a fallback.

   Data source path:
     ./data/master.csv
*/

(() => {
  "use strict";

  // -------------------------------
  // Utilities
  // -------------------------------

  const $ = (sel, parent = document) => parent.querySelector(sel);
  const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

  const norm = (s) => (s ?? "").toString().trim();
  const normLower = (s) => norm(s).toLowerCase();

  // Defensive parse for numbers; returns null if invalid
  function toNum(val) {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }

  // CSV parser that handles quotes, commas, and newlines inside quotes.
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let i = 0;
    let field = "";
    let inQuotes = false;

    while (i < text.length) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          } else {
            inQuotes = false;
            i++;
            continue;
          }
        } else {
          field += c;
          i++;
          continue;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
          i++;
          continue;
        }
        if (c === ",") {
          row.push(field);
          field = "";
          i++;
          continue;
        }
        if (c === "\n") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
          i++;
          continue;
        }
        if (c === "\r") { // handle CRLF
          i++;
          continue;
        }
        field += c;
        i++;
      }
    }
    // push last field/row
    row.push(field);
    rows.push(row);

    // Trim trailing empty rows
    while (rows.length && rows[rows.length - 1].every((x) => norm(x) === "")) {
      rows.pop();
    }
    return rows;
  }

  // Convert rows to objects with header mapping (lower_snake headers)
  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const headersRaw = rows[0].map((h) => norm(h));
    const headers = headersRaw.map((h) =>
      normLower(h)
        .replace(/\s+/g, "_")
        .replace(/[^\w]+/g, "_")
    );
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        obj[headers[c]] = rows[r][c] ?? "";
      }
      out.push(obj);
    }
    return out;
  }

  // Normalize exercise type values
  function normalizeType(t) {
    const s = normLower(t);
    if (!s) return "";
    if (s.includes("muscular") || s === "strength") return "resistance";
    if (s.includes("resistance")) return "resistance";
    if (s.includes("aerobic") || s.includes("cardio")) return "aerobic";
    return s;
  }

  // Identify goal columns dynamically: headers containing "_goal"
  function goalColumns(items) {
    if (!items.length) return [];
    const keys = Object.keys(items[0]);
    return keys.filter((k) => k.endsWith("_goal"));
  }

  // Build human label from a goal key
  function goalLabelFromKey(key) {
    return norm(key.replace(/_goal$/i, "").replace(/_/g, " "))
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  // -------------------------------
  // Data loading
  // -------------------------------

  let DATA = [];
  let GOAL_COLS = [];
  let TYPE_OPTIONS = [];

  async function loadData() {
    const url = "./data/master.csv";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Unable to load ${url}: ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    const items = rowsToObjects(rows);

    // Normalize types and coerce 0/1 in goal columns
    items.forEach((it) => {
      it.exercise_type = normalizeType(it.exercise_type ?? it.type ?? "");
      // Accept "title" or "name"
      it.title = it.title || it.name || "(Untitled Protocol)";
      // normalize tags string
      if (typeof it.tags === "string") it.tags = it.tags;
    });

    const gcols = goalColumns(items);
    for (const it of items) {
      for (const g of gcols) {
        const v = normLower(it[g]);
        // Coerce truthiness: "1", "true", "y", "yes" => 1; else 0
        it[g] = (v === "1" || v === "true" || v === "y" || v === "yes") ? 1 : Number(v) === 1 ? 1 : 0;
      }
    }

    // Collect unique type options
    const types = Array.from(new Set(items.map((it) => it.exercise_type))).filter(Boolean);
    DATA = items;
    GOAL_COLS = gcols;
    TYPE_OPTIONS = types;
  }

  // -------------------------------
  // UI wiring: tabs
  // -------------------------------

  function initTabs() {
    const tabs = $$(".tab");
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-tab");
        tabs.forEach((b) => b.classList.toggle("active", b === btn));
        $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
      });
    });
  }

  // -------------------------------
  // PLAN tab
  // -------------------------------

  function planSelectedType() {
    const checked = $$('input[name="etype"]:checked');
    if (!checked.length) return "both";
    return checked[0].value;
  }

  function collectVitals() {
    return {
      sleep_eff: toNum($("#sleep_eff").value),
      hrv_value: toNum($("#hrv_value").value),
      sbp: toNum($("#sbp").value),
      dbp: toNum($("#dbp").value),
      cgm_tir: toNum($("#cgm_tir").value),
      hscrp: toNum($("#hscrp").value),
    };
  }

  function filterByType(items, typeSel) {
    if (typeSel === "both") return items;
    return items.filter((it) => it.exercise_type === typeSel);
  }

  function renderPlan(items) {
    const out = $("#plan-output");
    out.innerHTML = "";
    if (!items.length) {
      out.innerHTML = `<div class="warn">No items available (check CSV exercise_type/title).</div>`;
      return;
    }
    // Render all (no artificial cap)
    items.forEach((it) => out.appendChild(protocolCard(it, { showGoalsBadges: true, includeAI: true })));
  }

  async function onGeneratePlan() {
    const typeSel = planSelectedType(); // resistance / aerobic / both
    const items = filterByType(DATA, typeSel);
    renderPlan(items);
  }

  function onClearPlan() {
    $("#plan-form").reset();
    $("#plan-output").innerHTML = "";
    // default to both
    $$('input[name="etype"]').forEach((r) => (r.checked = r.value === "both"));
  }

  // -------------------------------
  // LIBRARY tab
  // -------------------------------

  function populateLibrarySelectors() {
    const $types = $("#lib-types");
    const $goals = $("#lib-goals");
    $types.innerHTML = "";
    $goals.innerHTML = "";

    // Exercise types
    TYPE_OPTIONS.sort().forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      $types.appendChild(opt);
    });

    // Goals from *_goal columns
    GOAL_COLS.sort().forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = goalLabelFromKey(g);
      $goals.appendChild(opt);
    });
  }

  function getMultiSelectValues(sel) {
    return Array.from(sel.selectedOptions).map((o) => o.value);
  }

  function applyLibraryFilters() {
    const typeVals = getMultiSelectValues($("#lib-types")); // exercise_type values (normalized)
    const goalCols = getMultiSelectValues($("#lib-goals")); // *_goal keys

    let items = DATA.slice();

    // Filter by type if any selected
    if (typeVals.length) {
      const set = new Set(typeVals);
      items = items.filter((it) => set.has(it.exercise_type));
    }

    // Filter by goals if any selected: keep if ANY selected goal column == 1
    if (goalCols.length) {
      items = items.filter((it) => goalCols.some((g) => Number(it[g]) === 1));
    }

    const out = $("#library-output");
    out.innerHTML = "";

    if (!items.length) {
      out.innerHTML = `<div class="warn">No items match the selected filter(s).</div>`;
      return;
    }

    items.forEach((it) => out.appendChild(protocolCard(it, { showGoalsBadges: true, includeAI: true })));
  }

  function clearLibraryFilters() {
    $("#library-form").reset();
    // Explicitly clear multi-selects
    $$("#lib-types option, #lib-goals option").forEach((o) => (o.selected = false));
    $("#library-output").innerHTML = "";
  }

  // -------------------------------
  // PROTOCOL CARD RENDERING
  // -------------------------------

  function badge(text) {
    const span = document.createElement("span");
    span.className = "badge";
    span.textContent = text;
    return span;
  }

  function goalsBadges(it) {
    const frag = document.createDocumentFragment();
    GOAL_COLS.forEach((g) => {
      if (Number(it[g]) === 1) {
        frag.appendChild(badge(goalLabelFromKey(g)));
      }
    });
    return frag;
  }

  function protocolCard(it, opts = {}) {
    const { showGoalsBadges = false, includeAI = false } = opts;
    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.justifyContent = "space-between";
    head.style.alignItems = "baseline";
    const h3 = document.createElement("h3");
    h3.textContent = it.title || "(Untitled Protocol)";
    const et = document.createElement("div");
    et.className = "badge";
    et.textContent = (it.exercise_type || "").toUpperCase();
    head.appendChild(h3);
    head.appendChild(et);
    card.appendChild(head);

    if (showGoalsBadges) {
      const kv = document.createElement("div");
      kv.className = "kv";
      kv.appendChild(goalsBadges(it));
      card.appendChild(kv);
    }

    // Non‑API Coaching (from CSV: protocol_start + progression_rule)
    const coachBlock = document.createElement("details");
    coachBlock.open = true;
    const sum1 = document.createElement("summary");
    sum1.textContent = "Coaching (non‑AI)";
    const nonApi = document.createElement("div");
    const proto = norm(it.protocol_start);
    const prog = norm(it.progression_rule);
    const contra = norm(it.contraindications_flags);
    nonApi.innerHTML = [
      proto ? `<p><strong>Protocol start:</strong> ${proto}</p>` : "",
      prog ? `<p><strong>Progression:</strong> ${prog}</p>` : "",
      contra ? `<p class="notice"><strong>Contraindications:</strong> ${contra}</p>` : "",
    ].filter(Boolean).join("");
    coachBlock.appendChild(sum1);
    coachBlock.appendChild(nonApi);
    card.appendChild(coachBlock);

    // AI Coaching
    if (includeAI) {
      const aiBlock = document.createElement("details");
      aiBlock.open = false;
      const sum2 = document.createElement("summary");
      sum2.textContent = "AI Coaching";
      const aiWrap = document.createElement("div");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Generate AI Coaching";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Generating…";
        const vitals = collectVitals();
        const prompt = buildAIPrompt(it, vitals);
        try {
          const resp = await callCoachFunction(prompt, { protocol: it, vitals });
          aiWrap.innerHTML = `<div class="ok"><strong>AI Coach:</strong><br>${escapeHtml(resp)}</div>`;
        } catch (e) {
          // Deterministic fallback if function missing or errors
          aiWrap.innerHTML = `<div class="ok"><strong>AI Coach (offline fallback):</strong><br>${escapeHtml(fallbackAICoach(it, vitals))}</div>`;
        } finally {
          btn.disabled = false;
          btn.textContent = "Regenerate AI Coaching";
        }
      });
      aiBlock.appendChild(sum2);
      aiWrap.appendChild(btn);
      aiBlock.appendChild(aiWrap);
      card.appendChild(aiBlock);
    }

    return card;
  }

  function buildAIPrompt(it, vitals) {
    const parts = [];
    // Prefer CSV-provided coaching prompt if present
    if (it.coach_prompt_api) parts.push(String(it.coach_prompt_api));
    // Always provide context
    parts.push(`Protocol: ${it.title} [type: ${it.exercise_type}]`);
    const proto = norm(it.protocol_start);
    if (proto) parts.push(`Protocol start: ${proto}`);
    const prog = norm(it.progression_rule);
    if (prog) parts.push(`Progression rules: ${prog}`);
    const contra = norm(it.contraindications_flags);
    if (contra) parts.push(`Contraindications: ${contra}`);
    parts.push(`Vitals — SleepEff%: ${vitals.sleep_eff ?? "NA"}, HRV(ms): ${vitals.hrv_value ?? "NA"}, BP: ${vitals.sbp ?? "NA"}/${vitals.dbp ?? "NA"}, CGM TIR%: ${vitals.cgm_tir ?? "NA"}, hsCRP: ${vitals.hscrp ?? "NA"}`);
    parts.push("Give concise, older‑adult‑friendly guidance (plain English, safety first).");
    return parts.join("\n");
  }

  async function callCoachFunction(question, context) {
    // Netlify functions path
    const url = "/.netlify/functions/coach";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context }),
    });
    if (!res.ok) {
      throw new Error(`coach function error ${res.status}`);
    }
    const data = await res.json().catch(() => ({}));
    // Expect { answer: string } or raw text
    return data.answer || data.result || (await res.text());
  }

  function fallbackAICoach(it, vitals) {
    const lines = [];
    lines.push(`Focus on ${it.title} (${(it.exercise_type || "").toUpperCase()}).`);
    if (vitals.sbp && vitals.sbp >= 160) lines.push("• SBP ≥160: keep intensity light; avoid breath‑holding and heavy straining today.");
    if (vitals.hscrp && vitals.hscrp >= 3) lines.push("• hsCRP ≥3: prefer lower‑impact aerobic work or shorter resistance bouts.");
    if (vitals.hrv_value && vitals.hrv_value < 25) lines.push("• Low HRV: extend warm‑up and reduce volume by ~20–30%.");
    const proto = norm(it.protocol_start);
    if (proto) lines.push(`• Start: ${proto}`);
    const prog = norm(it.progression_rule);
    if (prog) lines.push(`• Progress when: ${prog}`);
    lines.push("• Stop if you experience chest pain, dizziness, or concerning symptoms.");
    return lines.join("\n");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // -------------------------------
  // ASK tab (simple coach function wrapper)
  // -------------------------------

  function initAsk() {
    $("#ask-send").addEventListener("click", async () => {
      const q = norm($("#ask-input").value);
      const out = $("#ask-output");
      if (!q) return;
      out.innerHTML = `<div class="card">Sending…</div>`;
      try {
        const vitals = collectVitals();
        const answer = await callCoachFunction(q, { vitals });
        out.innerHTML = `<div class="card ok"><strong>Coach:</strong><br>${escapeHtml(answer)}</div>`;
      } catch (e) {
        out.innerHTML = `<div class="card ok"><strong>Coach (offline fallback):</strong><br>${escapeHtml("When in doubt, choose low‑risk options: Zone 2 walking or a short resistance session. Warm up, breathe continuously (avoid Valsalva), and progress gradually.")}</div>`;
      }
    });
    $("#ask-clear").addEventListener("click", () => {
      $("#ask-input").value = "";
      $("#ask-output").innerHTML = "";
    });
  }

  // -------------------------------
  // PROGRESS tab (local only)
  // -------------------------------

  function initProgress() {
    const tableBody = $("#p-table tbody");
    const storeKey = "bp_ex_prog_v1";

    function load() {
      try {
        return JSON.parse(localStorage.getItem(storeKey) || "[]");
      } catch {
        return [];
      }
    }
    function save(arr) {
      localStorage.setItem(storeKey, JSON.stringify(arr));
    }
    function render() {
      const arr = load();
      tableBody.innerHTML = arr.map((r) =>
        `<tr><td>${r.date || ""}</td><td>${r.type || ""}</td><td>${r.dur || ""}</td><td>${r.rpe || ""}</td><td>${r.hrv || ""}</td></tr>`
      ).join("");
    }

    $("#p-add").addEventListener("click", () => {
      const rec = {
        date: $("#p-date").value,
        type: $("#p-type").value,
        dur: $("#p-duration").value,
        rpe: $("#p-rpe").value,
        hrv: $("#p-hrv").value,
      };
      const arr = load();
      arr.push(rec);
      save(arr);
      render();
    });

    $("#p-clear").addEventListener("click", () => {
      if (confirm("Clear all progress entries?")) {
        save([]);
        render();
      }
    });

    render();
  }

  // -------------------------------
  // Bootstrap
  // -------------------------------

  function wirePlan() {
    $("#generate-plan").addEventListener("click", onGeneratePlan);
    $("#clear-plan").addEventListener("click", onClearPlan);
  }

  function wireLibrary() {
    $("#apply-filters").addEventListener("click", applyLibraryFilters);
    $("#clear-filters").addEventListener("click", clearLibraryFilters);
  }

  async function init() {
    initTabs();
    wirePlan();
    wireLibrary();
    initProgress();
    initAsk();
    try {
      await loadData();
      populateLibrarySelectors();
      // Auto‑generate when page loads (optional: comment out if not desired)
      // onGeneratePlan();
    } catch (e) {
      console.error(e);
      const err = document.createElement("div");
      err.className = "notice";
      err.innerHTML = `<strong>Data error:</strong> ${escapeHtml(e.message)}`;
      $("#tab-plan").appendChild(err);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
