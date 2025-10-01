/* BrainPreserve — Brain Exercise App
   app.js (2025-10-01b)
   Key corrections:
   - PLAN uses CSV 'modality' to determine Resistance/Aerobic (not 'Exercise Type').
   - Visible protocol name = CSV 'Exercise Type' (or fallback to exercise_key, aliases).
   - LIBRARY filter: "Exercise Type(s)" now refers to the CSV 'Exercise Type' categories, not modality.
   - Goals combine with type correctly: must match selected category(ies) AND any selected *_goal==1 (when selections exist).
   - Netlify function payload matches /netlify/functions/coach.js expectations.
*/

(() => {
  "use strict";

  const $ = (sel, parent = document) => parent.querySelector(sel);
  const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));

  const norm = (s) => (s ?? "").toString().trim();
  const normLower = (s) => norm(s).toLowerCase();

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
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        } else { field += c; i++; continue; }
      } else {
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ",") { row.push(field); field=""; i++; continue; }
        if (c === "\n") { row.push(field); rows.push(row); row=[]; field=""; i++; continue; }
        if (c === "\r") { i++; continue; }
        field += c; i++;
      }
    }
    row.push(field); rows.push(row);
    while (rows.length && rows[rows.length-1].every((x)=>norm(x)==="")) rows.pop();
    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const headersRaw = rows[0].map((h) => norm(h));
    const headers = headersRaw.map((h) =>
      normLower(h).replace(/\s+/g,"_").replace(/[^\w]+/g,"_")
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

  function normalizeModality(s) {
    const x = normLower(s);
    if (x.includes("resist") || x.includes("muscular") || x.includes("strength")) return "resistance";
    if (x.includes("aerobic") || x.includes("cardio")) return "aerobic";
    return x || "none";
  }

  function toNum(val) { const n = Number(val); return Number.isFinite(n) ? n : null; }

  function goalColumns(items) {
    if (!items.length) return [];
    return Object.keys(items[0]).filter((k) => k.endsWith("_goal"));
  }

  // ------------ Global Data ------------
  let DATA = [];
  let GOAL_COLS = [];
  let CATEGORY_OPTIONS = [];  // CSV "Exercise Type" values (visible categories)
  let MODALITY_OPTIONS = [];  // normalized modalities (resistance/aerobic/none)

  async function loadData() {
    const url = "./data/master.csv";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Unable to load ${url}: ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    const items = rowsToObjects(rows);

    // Map fields:
    // - visible category label: prefer "exercise_type" (CSV header "Exercise Type"), else "exercise_key" or "aliases"
    // - modality: from CSV "modality"
    for (const it of items) {
      const categoryLabel = norm(it.exercise_type) || norm(it.exercise_key) || norm(it.aliases);
      it._label = categoryLabel || "(Untitled)";
      it._modality = normalizeModality(it.modality || it.type || "");

      // Coerce goals to 0/1
      for (const key of Object.keys(it)) {
        if (key.endsWith("_goal")) {
          const v = normLower(it[key]);
          it[key] = (v === "1" || v === "true" || v === "y" || v === "yes") ? 1 : Number(v) === 1 ? 1 : 0;
        }
      }
    }

    DATA = items;
    GOAL_COLS = goalColumns(items);
    CATEGORY_OPTIONS = Array.from(new Set(items.map((it) => it._label))).filter(Boolean).sort();
    MODALITY_OPTIONS = Array.from(new Set(items.map((it) => it._modality))).filter(Boolean).sort();
  }

  // ------------ Tabs ------------
  function initTabs() {
    $$(".tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-tab");
        $$(".tab").forEach((b) => b.classList.toggle("active", b === btn));
        $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
      });
    });
  }

  // ------------ PLAN ------------
  function planSelectedModality() {
    const checked = $$('input[name="etype"]:checked');
    if (!checked.length) return "both";
    return checked[0].value; // resistance | aerobic | both
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

  function filterPlanItems() {
    const sel = planSelectedModality();
    if (sel === "both") return DATA.filter((it) => it._modality === "resistance" || it._modality === "aerobic");
    return DATA.filter((it) => it._modality === sel);
  }

  async function onGeneratePlan() {
    const items = filterPlanItems();
    renderProtocols($("#plan-output"), items, { showGoalsBadges: true, includeAI: true });
  }

  function onClearPlan() {
    $("#plan-form").reset();
    $$('input[name="etype"]').forEach((r) => (r.checked = r.value === "both"));
    $("#plan-output").innerHTML = "";
  }

  // ------------ LIBRARY ------------
  function populateLibrarySelectors() {
    const typesSel = $("#lib-types");
    const goalsSel = $("#lib-goals");
    typesSel.innerHTML = "";
    goalsSel.innerHTML = "";

    // Exercise Type(s) = visible categories from CSV "Exercise Type"
    CATEGORY_OPTIONS.forEach((label) => {
      const opt = document.createElement("option");
      opt.value = label;
      opt.textContent = label;
      typesSel.appendChild(opt);
    });

    // Goal(s) from *_goal columns
    GOAL_COLS.forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g.replace(/_goal$/i, "").replace(/_/g, " ").replace(/\b\w/g, (m)=>m.toUpperCase());
      goalsSel.appendChild(opt);
    });
  }

  function getMultiSelectValues(sel) {
    return Array.from(sel.selectedOptions).map((o) => o.value);
  }

  function applyLibraryFilters() {
    const selCategories = new Set(getMultiSelectValues($("#lib-types"))); // CSV category labels
    const selGoals = getMultiSelectValues($("#lib-goals"));              // *_goal keys

    let items = DATA.slice();

    if (selCategories.size) {
      items = items.filter((it) => selCategories.has(it._label));
    }
    if (selGoals.length) {
      items = items.filter((it) => selGoals.some((g) => Number(it[g]) === 1));
    }

    renderProtocols($("#library-output"), items, { showGoalsBadges: true, includeAI: true });
  }

  function clearLibraryFilters() {
    $("#library-form").reset();
    $$("#lib-types option, #lib-goals option").forEach((o) => (o.selected = false));
    $("#library-output").innerHTML = "";
  }

  // ------------ Rendering ------------
  function badge(text) {
    const span = document.createElement("span");
    span.className = "badge";
    span.textContent = text;
    return span;
  }

  function goalsBadges(it) {
    const frag = document.createDocumentFragment();
    GOAL_COLS.forEach((g) => { if (Number(it[g]) === 1) frag.appendChild(badge(g.replace(/_goal$/,""))); });
    return frag;
  }

  function protocolCard(it, opts = {}) {
    const { showGoalsBadges = false, includeAI = false } = opts;
    const card = document.createElement("div");
    card.className = "card";

    const head = document.createElement("div");
    head.style.display = "flex"; head.style.justifyContent = "space-between"; head.style.alignItems = "baseline";
    const h3 = document.createElement("h3");
    h3.textContent = it._label || "(Untitled)";
    const et = document.createElement("div");
    et.className = "badge"; et.textContent = (it._modality || "").toUpperCase();
    head.appendChild(h3); head.appendChild(et);
    card.appendChild(head);

    if (showGoalsBadges) {
      const kv = document.createElement("div"); kv.className = "kv"; kv.appendChild(goalsBadges(it));
      card.appendChild(kv);
    }

    // Non-AI Coaching
    const coachBlock = document.createElement("details");
    coachBlock.open = true;
    const sum1 = document.createElement("summary"); sum1.textContent = "Coaching (non-AI)";
    const nonApi = document.createElement("div");
    const proto = norm(it.protocol_start);
    const prog = norm(it.progression_rule);
    const contra = norm(it.contraindications_flags);
    nonApi.innerHTML = [
      proto ? `<p><strong>Protocol start:</strong> ${proto}</p>` : "",
      prog ? `<p><strong>Progression:</strong> ${prog}</p>` : "",
      contra ? `<p class="notice"><strong>Contraindications:</strong> ${contra}</p>` : "",
    ].filter(Boolean).join("");
    coachBlock.appendChild(sum1); coachBlock.appendChild(nonApi);
    card.appendChild(coachBlock);

    if (includeAI) {
      const aiBlock = document.createElement("details");
      aiBlock.open = false;
      const sum2 = document.createElement("summary"); sum2.textContent = "AI Coaching";
      const aiWrap = document.createElement("div");
      const btn = document.createElement("button");
      btn.type = "button"; btn.textContent = "Generate AI Coaching";
      btn.addEventListener("click", async () => {
        btn.disabled = true; btn.textContent = "Generating…";
        const vitals = collectVitals();
        try {
          const resp = await callCoachFunction({
            coach_prompt_api: it.coach_prompt_api || "",
            user_question: buildUserQuestion(it, vitals),
            record: {
              protocol_start: it.protocol_start || "",
              progression_rule: it.progression_rule || "",
              coach_script_non_api: it.coach_script_non_api || ""
            }
          });
          aiWrap.innerHTML = `<div class="ok"><strong>AI Coach:</strong><br>${escapeHtml(resp)}</div>`;
        } catch (e) {
          aiWrap.innerHTML = `<div class="ok"><strong>AI Coach (offline fallback):</strong><br>${escapeHtml(fallbackAICoach(it, vitals))}</div>`;
        } finally {
          btn.disabled = false; btn.textContent = "Regenerate AI Coaching";
        }
      });
      aiBlock.appendChild(sum2); aiWrap.appendChild(btn); aiBlock.appendChild(aiWrap);
      card.appendChild(aiBlock);
    }

    return card;
  }

  function renderProtocols(container, items, opts) {
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = `<div class="warn">No items available (check CSV modality/Exercise Type).</div>`;
      return;
    }
    items.forEach((it) => container.appendChild(protocolCard(it, opts)));
  }

  function buildUserQuestion(it, vitals) {
    const parts = [];
    parts.push(`Provide practical coaching for: ${it._label} [${it._modality.toUpperCase()}]`);
    const proto = norm(it.protocol_start); if (proto) parts.push(`Start: ${proto}`);
    const prog  = norm(it.progression_rule); if (prog) parts.push(`Progression: ${prog}`);
    const contra = norm(it.contraindications_flags); if (contra) parts.push(`Contraindications: ${contra}`);
    parts.push(`Vitals — SleepEff%: ${vitals.sleep_eff ?? "NA"}, HRV(ms): ${vitals.hrv_value ?? "NA"}, BP: ${vitals.sbp ?? "NA"}/${vitals.dbp ?? "NA"}, CGM TIR%: ${vitals.cgm_tir ?? "NA"}, hsCRP: ${vitals.hscrp ?? "NA"}`);
    parts.push("Keep guidance concise, safe, and tailored to older adults.");
    return parts.join("\n");
  }

  async function callCoachFunction(payload) {
    const url = "/.netlify/functions/coach";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`coach function error ${res.status}`);
    const data = await res.json().catch(()=>({}));
    // Accept either {message} or {answer}
    return data.message || data.answer || JSON.stringify(data);
  }

  function fallbackAICoach(it, vitals) {
    const lines = [];
    lines.push(`Focus on ${it._label} (${(it._modality || "").toUpperCase()}).`);
    const proto = norm(it.protocol_start); if (proto) lines.push(`• Start: ${proto}`);
    const prog = norm(it.progression_rule); if (prog) lines.push(`• Progress when: ${prog}`);
    lines.push("• Stop if you experience chest pain, dizziness, or concerning symptoms.");
    return lines.join("\n");
  }

  function escapeHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  // ------------ ASK tab ------------
  function initAsk() {
    $("#ask-send").addEventListener("click", async () => {
      const q = norm($("#ask-input").value);
      const out = $("#ask-output");
      if (!q) return;
      out.innerHTML = `<div class="card">Sending…</div>`;
      try {
        const resp = await callCoachFunction({
          coach_prompt_api: "",
          user_question: q,
          record: {},
        });
        out.innerHTML = `<div class="card ok"><strong>Coach:</strong><br>${escapeHtml(resp)}</div>`;
      } catch (e) {
        out.innerHTML = `<div class="card ok"><strong>Coach (offline fallback):</strong><br>${escapeHtml("Choose the lowest-risk option today: a short Zone 2 walk or gentle resistance basics. Warm up, breathe steadily, and stop if unwell.")}</div>`;
      }
    });
    $("#ask-clear").addEventListener("click", () => { $("#ask-input").value = ""; $("#ask-output").innerHTML = ""; });
  }

  // ------------ PROGRESS ------------
  function initProgress() {
    const tableBody = $("#p-table tbody");
    const storeKey = "bp_ex_prog_v1";
    function load(){ try{ return JSON.parse(localStorage.getItem(storeKey)||"[]"); }catch{return []} }
    function save(a){ localStorage.setItem(storeKey, JSON.stringify(a)); }
    function render(){
      const arr = load();
      tableBody.innerHTML = arr.map((r)=>
        `<tr><td>${r.date||""}</td><td>${r.type||""}</td><td>${r.dur||""}</td><td>${r.rpe||""}</td><td>${r.hrv||""}</td></tr>`
      ).join("");
    }
    $("#p-add").addEventListener("click", ()=>{
      const rec = { date: $("#p-date").value, type: $("#p-type").value, dur: $("#p-duration").value, rpe: $("#p-rpe").value, hrv: $("#p-hrv").value };
      const arr = load(); arr.push(rec); save(arr); render();
    });
    $("#p-clear").addEventListener("click", ()=>{ if(confirm("Clear all progress entries?")){ save([]); render(); } });
    render();
  }

  // ------------ Bootstrap ------------
  function wirePlan(){ $("#generate-plan").addEventListener("click", onGeneratePlan); $("#clear-plan").addEventListener("click", onClearPlan); }
  function wireLibrary(){ $("#apply-filters").addEventListener("click", applyLibraryFilters); $("#clear-filters").addEventListener("click", clearLibraryFilters); }

  async function init() {
    initTabs(); wirePlan(); wireLibrary(); initProgress(); initAsk();
    try {
      await loadData();
      populateLibrarySelectors();
    } catch(e) {
      console.error(e);
      const err = document.createElement("div");
      err.className = "notice";
      err.innerHTML = `<strong>Data error:</strong> ${String(e.message)}`;
      $("#tab-plan").appendChild(err);
    }
  }
  document.addEventListener("DOMContentLoaded", init);
})();
