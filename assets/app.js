/* BrainPreserve — Brain Exercise App
   app.js (2025-10-01e)
   Stabilization:
   - Idempotent init (prevents double wiring that can break tabs or double-save).
   - "Save data" captures EXACT Plan inputs (no defaults), stores to v2 store, and refreshes Progress immediately.
   - Progress renders a full table including all saved Plan inputs (sleep_eff, hrv, sbp, dbp, cgm_tir, hsCRP).
   - Library filter temporarily simplified to TYPE-ONLY per user's request (Goals ignored for now to avoid churn).
   - Details block reads only from CSV fields (no guessing).
   - AI calls unchanged; function updated separately to remove unsupported temperature parameter.
*/

(() => {
  "use strict";

  if (window.__bp_init_done) return; // prevent double-init
  window.__bp_init_done = true;

  const $ = (sel, parent = document) => parent.querySelector(sel);
  const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));
  const norm = (s) => (s ?? "").toString().trim();
  const canon = (s) => norm(s).toLowerCase().replace(/\s+/g, " ");

  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", i = 0, inQ = false;
    while (i < text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i+1] === '"') { field += '"'; i += 2; } else { inQ = false; i++; } }
        else { field += c; i++; }
      } else {
        if (c === '"') { inQ = true; i++; }
        else if (c === ",") { row.push(field); field=""; i++; }
        else if (c === "\n") { row.push(field); rows.push(row); row=[]; field=""; i++; }
        else if (c === "\r") { i++; }
        else { field += c; i++; }
      }
    }
    row.push(field); rows.push(row);
    while (rows.length && rows[rows.length-1].every((x)=>norm(x)==="")) rows.pop();
    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows.length) return [];
    const headersRaw = rows[0].map((h) => norm(h));
    const headers = headersRaw.map((h) => h.toLowerCase().trim().replace(/\s+/g,"_").replace(/[^\w]+/g,"_"));
    const out = [];
    for (let r=1; r<rows.length; r++) {
      const obj = {};
      for (let c=0; c<headers.length; c++) obj[headers[c]] = rows[r][c] ?? "";
      out.push(obj);
    }
    return out;
  }

  function normalizeModality(s) {
    const x = canon(s);
    if (!x) return "none";
    if (x.includes("resist") || x.includes("muscular") || x.includes("strength")) return "resistance";
    if (x.includes("aerobic") || x.includes("cardio")) return "aerobic";
    return x;
  }

  function goalColumns(items) {
    if (!items.length) return [];
    return Object.keys(items[0]).filter((k) => k.endsWith("_goal"));
  }

  // ------------ Global Data ------------
  let DATA = [];
  let GOAL_COLS = [];
  let CATEGORY_OPTIONS = [];
  const storeKeyV1 = "bp_ex_prog_v1"; // legacy
  const storeKeyV2 = "bp_ex_prog_v2"; // new

  async function loadData() {
    const url = "./data/master.csv";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Unable to load ${url}: ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    const items = rowsToObjects(rows);
    for (const it of items) {
      const label = it.exercise_type || it.exercise_key || it.aliases;
      it._label = norm(label) || "(Untitled)";
      it._label_key = canon(it._label);
      it._modality = normalizeModality(it.modality || it.type || "");
      for (const key of Object.keys(it)) {
        if (key.endsWith("_goal")) {
          const v = (it[key] ?? "").toString().trim().toLowerCase();
          it[key] = (v === "1" || v === "true" || v === "y" || v === "yes") ? 1 : Number(v) === 1 ? 1 : 0;
        }
      }
    }
    DATA = items;
    GOAL_COLS = goalColumns(items);
    CATEGORY_OPTIONS = Array.from(new Set(items.map((it) => it._label))).filter(Boolean).sort((a,b)=>a.localeCompare(b));
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
    return checked[0].value;
  }

  function getVal(id) { const el = $(id); return el ? el.value : ""; }

  function collectPlanInputs() {
    return {
      sleep_eff: getVal("#sleep_eff"),
      hrv_value: getVal("#hrv_value"),
      sbp: getVal("#sbp"),
      dbp: getVal("#dbp"),
      cgm_tir: getVal("#cgm_tir"),
      hscrp: getVal("#hscrp"),
    };
  }

  function filterPlanItems() {
    const sel = planSelectedModality();
    if (sel === "both") return DATA.filter((it) => it._modality === "resistance" || it._modality === "aerobic");
    return DATA.filter((it) => it._modality === sel);
  }

  function renderPlan() {
    const items = filterPlanItems();
    renderProtocols($("#plan-output"), items, { showGoalsBadges: true, includeAI: true });
  }

  function onClearPlan() {
    $("#plan-form") && $("#plan-form").reset();
    $$('input[name="etype"]').forEach((r) => (r.checked = r.value === "both"));
    $("#plan-output").innerHTML = "";
  }

  function ensurePlanSaveButton() {
    if ($("#save-session")) return;
    const actions = $("#plan-form .actions") || $("#tab-plan");
    if (!actions) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "save-session";
    btn.textContent = "Save data";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      const now = new Date();
      const inputs = collectPlanInputs(); // exact strings from inputs
      const rec = {
        id: String(now.getTime()),
        date: now.toISOString().slice(0,16).replace("T"," "),
        modality: planSelectedModality().toUpperCase(),
        duration: "",
        rpe: "",
        ...inputs,
      };
      let arr = [];
      try {
        arr = JSON.parse(localStorage.getItem(storeKeyV2) || "[]");
      } catch {}
      arr.push(rec);
      localStorage.setItem(storeKeyV2, JSON.stringify(arr));
      // also migrate any legacy once (no duplication on next saves)
      try {
        const legacy = JSON.parse(localStorage.getItem(storeKeyV1) || "[]");
        if (legacy && legacy.length) {
          localStorage.setItem(storeKeyV1, JSON.stringify([]));
        }
      } catch {}
      toast("Session saved to Progress.");
      progressRender();
      btn.disabled = false;
    });
    actions.appendChild(btn);
  }

  // ------------ LIBRARY (TEMP: Type-only filtering) ------------
  function populateLibrarySelectors() {
    const typesSel = $("#lib-types");
    const goalsSel = $("#lib-goals");
    if (typesSel) {
      typesSel.innerHTML = "";
      CATEGORY_OPTIONS.forEach((label) => {
        const opt = document.createElement("option");
        opt.value = canon(label);
        opt.textContent = label;
        typesSel.appendChild(opt);
      });
    }
    if (goalsSel) {
      // keep visible for later, but we'll ignore selections in applyLibraryFilters()
      goalsSel.innerHTML = "";
      GOAL_COLS.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = g.replace(/_goal$/i, "").replace(/_/g, " ").replace(/\b\w/g, (m)=>m.toUpperCase());
        goalsSel.appendChild(opt);
      });
    }
  }

  function getMulti(sel){ return sel ? Array.from(sel.selectedOptions).map(o=>o.value) : []; }

  function applyLibraryFilters() {
    const typeKeys = new Set(getMulti($("#lib-types")));  // canonical
    let items = DATA;
    if (typeKeys.size) {
      items = items.filter((it) => typeKeys.has(it._label_key));
    }
    renderProtocols($("#library-output"), items, { showGoalsBadges: true, includeAI: true });
  }

  function clearLibraryFilters() {
    $("#library-form") && $("#library-form").reset();
    $$("#lib-types option, #lib-goals option").forEach((o) => (o.selected = false));
    $("#library-output").innerHTML = "";
  }

  // ------------ Rendering ------------
  function badge(text) { const s=document.createElement("span"); s.className="badge"; s.textContent=text; return s; }

  function goalsBadges(it) {
    const frag = document.createDocumentFragment();
    GOAL_COLS.forEach((g) => { if (Number(it[g]) === 1) frag.appendChild(badge(g.replace(/_goal$/,""))); });
    return frag;
  }

  function detailsBlock(it) {
    const keys = [
      { key: "cognitive_targets", label: "Cognitive Targets" },
      { key: "mechanism_tags", label: "Mechanisms / Tags" },
      { key: "direct_cognitive_benefits", label: "Direct Cognitive Benefits" },
      { key: "indirect_cognitive_benefits", label: "Indirect Cognitive Benefits" },
      { key: "mechanisms_brain_body", label: "Mechanisms (Brain–Body)" },
    ];
    const det = document.createElement("details");
    det.open = false;
    const sum = document.createElement("summary"); sum.textContent = "Details";
    det.appendChild(sum);
    const box = document.createElement("div");
    keys.forEach(({key, label}) => {
      const v = norm(it[key]);
      if (v) {
        const p = document.createElement("p");
        p.innerHTML = `<strong>${label}:</strong> ${escapeHtml(v)}`;
        box.appendChild(p);
      }
    });
    if (!box.childNodes.length) {
      const p = document.createElement("p"); p.className="muted"; p.textContent="No additional details in CSV."; box.appendChild(p);
    }
    det.appendChild(box);
    return det;
  }

  function protocolCard(it, opts = {}) {
    const { showGoalsBadges = false, includeAI = false } = opts;
    const card = document.createElement("div"); card.className="card";
    const head = document.createElement("div"); head.style.display="flex"; head.style.justifyContent="space-between"; head.style.alignItems="baseline";
    const h3 = document.createElement("h3"); h3.textContent = it._label || "(Untitled)";
    const et = document.createElement("div"); et.className="badge"; et.textContent = (it._modality || "").toUpperCase();
    head.appendChild(h3); head.appendChild(et); card.appendChild(head);
    if (showGoalsBadges) { const kv = document.createElement("div"); kv.className="kv"; kv.appendChild(goalsBadges(it)); card.appendChild(kv); }

    const coachBlock = document.createElement("details"); coachBlock.open=true;
    const sum1 = document.createElement("summary"); sum1.textContent="Coaching (non-AI)";
    const nonApi = document.createElement("div");
    const proto = norm(it.protocol_start); const prog = norm(it.progression_rule); const contra = norm(it.contraindications_flags);
    nonApi.innerHTML = [
      proto ? `<p><strong>Protocol start:</strong> ${escapeHtml(proto)}</p>` : "",
      prog ? `<p><strong>Progression:</strong> ${escapeHtml(prog)}</p>` : "",
      contra ? `<p class="notice"><strong>Contraindications:</strong> ${escapeHtml(contra)}</p>` : "",
    ].filter(Boolean).join("");
    coachBlock.appendChild(sum1); coachBlock.appendChild(nonApi); card.appendChild(coachBlock);

    card.appendChild(detailsBlock(it));

    if (includeAI) {
      const aiBlock = document.createElement("details"); aiBlock.open=false;
      const sum2 = document.createElement("summary"); sum2.textContent="AI Coaching";
      const aiWrap = document.createElement("div");
      const btn = document.createElement("button"); btn.type="button"; btn.textContent="Generate AI Coaching";
      btn.addEventListener("click", async () => {
        btn.disabled = true; btn.textContent = "Generating…";
        try {
          const resp = await callCoachFunction({
            coach_prompt_api: it.coach_prompt_api || "",
            user_question: `Coaching guidance for ${it._label} [${(it._modality||"").toUpperCase()}]`,
            record: {
              protocol_start: it.protocol_start || "",
              progression_rule: it.progression_rule || "",
              coach_script_non_api: it.coach_script_non_api || ""
            }
          });
          aiWrap.innerHTML = `<div class="ok"><strong>AI Coach:</strong><br>${escapeHtml(resp)}</div>`;
        } catch (e) {
          aiWrap.innerHTML = `<div class="ok"><strong>AI Coach (offline fallback):</strong><br>${escapeHtml("AI unavailable. Check function/OPENAI_API_KEY.")}</div>`;
        } finally {
          btn.disabled = false; btn.textContent = "Regenerate AI Coaching";
        }
      });
      aiBlock.appendChild(sum2); aiWrap.appendChild(btn); aiBlock.appendChild(aiWrap); card.appendChild(aiBlock);
    }
    return card;
  }

  function renderProtocols(container, items, opts) {
    if (!container) return;
    container.innerHTML = "";
    if (!items.length) { container.innerHTML = `<div class="warn">No items available.</div>`; return; }
    items.forEach((it) => container.appendChild(protocolCard(it, opts)));
  }

  async function callCoachFunction(payload) {
    const url = "/.netlify/functions/coach";
    const res = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`coach function error ${res.status}`);
    const data = await res.json().catch(()=>({}));
    return data.message || data.answer || data.output_text || JSON.stringify(data);
  }

  function escapeHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function toast(msg){ const d=document.createElement("div"); d.className="ok"; d.textContent=msg; ($("#plan-output")||$("#tab-plan")||document.body).prepend(d); setTimeout(()=>d.remove(), 2000); }

  // ------------ ASK ------------
  function initAsk() {
    const send = $("#ask-send");
    const input = $("#ask-input");
    const out = $("#ask-output");
    if (!send || !input || !out) return;
    send.addEventListener("click", async () => {
      const q = input.value.trim();
      if (!q) return;
      out.innerHTML = `<div class="card">Sending…</div>`;
      try {
        const resp = await fetch("/.netlify/functions/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passthrough: true, user_question: q })
        }).then(r => r.json());
        const msg = resp.message || resp.answer || resp.output_text || JSON.stringify(resp);
        out.innerHTML = `<div class="card ok"><strong>Coach:</strong><br>${escapeHtml(msg)}</div>`;
      } catch (e) {
        out.innerHTML = `<div class="card ok"><strong>Coach (offline fallback):</strong><br>${escapeHtml("Unable to reach AI. Check function/OPENAI_API_KEY.")}</div>`;
      }
    });
    $("#ask-clear") && $("#ask-clear").addEventListener("click", () => { input.value=""; out.innerHTML=""; });
  }

  // ------------ PROGRESS ------------
  function loadSessions(){
    let v2=[]; let v1=[];
    try { v2 = JSON.parse(localStorage.getItem(storeKeyV2) || "[]"); } catch {}
    try { v1 = JSON.parse(localStorage.getItem(storeKeyV1) || "[]"); } catch {}
    // normalize legacy to v2-shape (best effort)
    const mapV1 = v1.map(r => ({
      id: cryptoRandomId(),
      date: r.date || "",
      modality: r.type || "",
      duration: r.dur || "",
      rpe: r.rpe || "",
      hrv_value: r.hrv || "",
      sleep_eff: "",
      sbp: "",
      dbp: "",
      cgm_tir: "",
      hscrp: ""
    }));
    return [...mapV1, ...v2];
  }
  function cryptoRandomId(){ try{ return String(crypto.getRandomValues(new Uint32Array(1))[0]); }catch{ return String(Math.random()).slice(2); } }

  function progressRender(){
    const table = $("#p-table");
    if (!table) return;
    const data = loadSessions();
    const headers = ["Date/Time","Modality","SleepEff","HRV","SBP","DBP","CGM TIR","hsCRP","Duration","RPE"];
    const rows = data.map(r => [
      r.date||"", r.modality||"", r.sleep_eff||"", r.hrv_value||"", r.sbp||"", r.dbp||"", r.cgm_tir||"", r.hscrp||"", r.duration||"", r.rpe||""
    ]);
    // rebuild table for accurate columns
    const thead = "<thead><tr>" + headers.map(h=>`<th>${h}</th>`).join("") + "</tr></thead>";
    const tbody = "<tbody>" + rows.map(cells=>"<tr>"+cells.map(c=>`<td>${escapeHtml(c)}</td>`).join("")+"</tr>").join("") + "</tbody>";
    table.innerHTML = thead + tbody;
  }

  function initProgress() {
    progressRender();
    $("#p-add") && $("#p-add").addEventListener("click", ()=>{
      const rec = {
        id: cryptoRandomId(),
        date: $("#p-date")?.value || "",
        modality: $("#p-type")?.value || "",
        duration: $("#p-duration")?.value || "",
        rpe: $("#p-rpe")?.value || "",
        hrv_value: $("#p-hrv")?.value || "",
        sleep_eff: "",
        sbp: "",
        dbp: "",
        cgm_tir: "",
        hscrp: ""
      };
      let v2 = []; try { v2 = JSON.parse(localStorage.getItem(storeKeyV2) || "[]"); } catch {}
      v2.push(rec); localStorage.setItem(storeKeyV2, JSON.stringify(v2)); progressRender();
    });
    $("#p-clear") && $("#p-clear").addEventListener("click", ()=>{ if(confirm("Clear all progress entries?")){ localStorage.setItem(storeKeyV2,"[]"); localStorage.setItem(storeKeyV1,"[]"); progressRender(); } });
  }

  // ------------ Bootstrap ------------
  function wirePlan(){
    $("#generate-plan") && $("#generate-plan").addEventListener("click", renderPlan);
    $("#clear-plan") && $("#clear-plan").addEventListener("click", onClearPlan);
    ensurePlanSaveButton();
  }
  function wireLibrary(){
    $("#apply-filters") && $("#apply-filters").addEventListener("click", applyLibraryFilters);
    $("#clear-filters") && $("#clear-filters").addEventListener("click", clearLibraryFilters);
  }

  async function init() {
    try {
      initTabs(); wirePlan(); wireLibrary(); initProgress(); initAsk();
      await loadData();
      populateLibrarySelectors();
    } catch(e) {
      console.error(e);
      const err = document.createElement("div"); err.className="notice"; err.innerHTML = `<strong>Error:</strong> ${String(e.message)}`;
      ($("#tab-plan")||document.body).appendChild(err);
    }
  }
  document.addEventListener("DOMContentLoaded", init);
})();
