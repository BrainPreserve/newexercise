/* BrainPreserve — Brain Exercise App
   app.js (2025-10-01d)
   Changes:
   - PLAN: "Save data" persists sessions and immediately refreshes Progress table.
   - LIBRARY: True AND filter using canonicalized Exercise Type labels + any selected *_goal==1.
   - DETAILS: Shows CSV fields (no guessing): cognitive_targets, mechanism_tags, direct_cognitive_benefits,
              indirect_cognitive_benefits, mechanisms_brain_body.
   - ASK: unchanged call shape, but supports "passthrough" (requires coach.js below).
*/

(() => {
  "use strict";

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
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        } else { field += c; i++; continue; }
      } else {
        if (c === '"') { inQ = true; i++; continue; }
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
      h.toLowerCase().trim().replace(/\s+/g,"_").replace(/[^\w]+/g,"_")
    );
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const obj = {};
      for (let c = 0; c < headers.length; c++) obj[headers[c]] = rows[r][c] ?? "";
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
  let CATEGORY_OPTIONS = [];   // visible labels (Exercise Type)
  let CATEGORY_KEYS = [];      // canonical values for matching
  const storeKey = "bp_ex_prog_v1";

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
    const labels = Array.from(new Set(items.map((it) => it._label))).filter(Boolean).sort((a,b)=>a.localeCompare(b));
    CATEGORY_OPTIONS = labels;
    CATEGORY_KEYS = labels.map((s)=>canon(s));
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
    const getNum = (id) => {
      const v = $(id) ? $(id).value : "";
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      sleep_eff: getNum("#sleep_eff"),
      hrv_value: getNum("#hrv_value"),
      sbp: getNum("#sbp"),
      dbp: getNum("#dbp"),
      cgm_tir: getNum("#cgm_tir"),
      hscrp: getNum("#hscrp"),
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

  // Save session and immediately refresh Progress table
  function addPlanSaveButton() {
    const actions = $("#plan-form .actions") || $("#tab-plan");
    if (!actions) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "save-session";
    btn.textContent = "Save data";
    btn.style.marginLeft = "0.5rem";
    btn.addEventListener("click", () => {
      const now = new Date();
      const rec = {
        date: now.toISOString().slice(0,16).replace("T"," "),
        type: planSelectedModality().toUpperCase(),
        dur: "",
        rpe: "",
        hrv: ($("#hrv_value") && $("#hrv_value").value) || "",
        extras: collectVitals(),
      };
      let arr;
      try { arr = JSON.parse(localStorage.getItem(storeKey) || "[]"); } catch { arr = []; }
      arr.push(rec);
      localStorage.setItem(storeKey, JSON.stringify(arr));

      // Visual confirmation
      const msg = document.createElement("div");
      msg.className = "ok";
      msg.textContent = "Session saved to Progress.";
      $("#plan-output").prepend(msg);
      setTimeout(()=>{ msg.remove(); }, 2000);

      // Refresh Progress table immediately
      progressRender();
    });
    actions.appendChild(btn);
  }

  // ------------ LIBRARY ------------
  function populateLibrarySelectors() {
    const typesSel = $("#lib-types");
    const goalsSel = $("#lib-goals");
    if (typesSel) {
      typesSel.innerHTML = "";
      CATEGORY_OPTIONS.forEach((label) => {
        const opt = document.createElement("option");
        opt.value = canon(label);  // canonical value for robust match
        opt.textContent = label;
        typesSel.appendChild(opt);
      });
    }
    if (goalsSel) {
      goalsSel.innerHTML = "";
      GOAL_COLS.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = g.replace(/_goal$/i, "").replace(/_/g, " ").replace(/\b\w/g, (m)=>m.toUpperCase());
        goalsSel.appendChild(opt);
      });
    }
  }

  function getMultiSelectValues(sel) {
    return sel ? Array.from(sel.selectedOptions).map((o) => o.value) : [];
  }

  function applyLibraryFilters() {
    const selTypeKeys = new Set(getMultiSelectValues($("#lib-types")));  // canonical keys
    const selGoals = getMultiSelectValues($("#lib-goals"));              // *_goal

    const items = DATA.filter((it) => {
      const typeOK = (selTypeKeys.size === 0) || selTypeKeys.has(it._label_key);
      const goalOK = (selGoals.length === 0) || selGoals.some((g) => Number(it[g]) === 1);
      return typeOK && goalOK;
    });

    renderProtocols($("#library-output"), items, { showGoalsBadges: true, includeAI: true });
  }

  function clearLibraryFilters() {
    $("#library-form") && $("#library-form").reset();
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
    const sum = document.createElement("summary");
    sum.textContent = "Details";
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
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No additional details in CSV.";
      box.appendChild(p);
    }
    det.appendChild(box);
    return det;
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
      proto ? `<p><strong>Protocol start:</strong> ${escapeHtml(proto)}</p>` : "",
      prog ? `<p><strong>Progression:</strong> ${escapeHtml(prog)}</p>` : "",
      contra ? `<p class="notice"><strong>Contraindications:</strong> ${escapeHtml(contra)}</p>` : "",
    ].filter(Boolean).join("");
    coachBlock.appendChild(sum1); coachBlock.appendChild(nonApi);
    card.appendChild(coachBlock);

    // Details from CSV
    card.appendChild(detailsBlock(it));

    if (includeAI) {
      const aiBlock = document.createElement("details");
      aiBlock.open = false;
      const sum2 = document.createElement("summary"); sum2.textContent = "AI Coaching";
      const aiWrap = document.createElement("div");
      const btn = document.createElement("button");
      btn.type = "button"; btn.textContent = "Generate AI Coaching";
      btn.addEventListener("click", async () => {
        btn.disabled = true; btn.textContent = "Generating…";
        try {
          const resp = await callCoachFunction({
            coach_prompt_api: it.coach_prompt_api || "",
            user_question: buildUserQuestion(it),
            record: {
              protocol_start: it.protocol_start || "",
              progression_rule: it.progression_rule || "",
              coach_script_non_api: it.coach_script_non_api || ""
            }
          });
          aiWrap.innerHTML = `<div class="ok"><strong>AI Coach:</strong><br>${escapeHtml(resp)}</div>`;
        } catch (e) {
          aiWrap.innerHTML = `<div class="ok"><strong>AI Coach (offline fallback):</strong><br>${escapeHtml("Short, safe guidance unavailable. Check function/KEY.")}</div>`;
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
    if (!container) return;
    container.innerHTML = "";
    if (!items.length) {
      container.innerHTML = `<div class="warn">No items available (check CSV modality/Exercise Type and selected filters).</div>`;
      return;
    }
    items.forEach((it) => container.appendChild(protocolCard(it, opts)));
  }

  function buildUserQuestion(it) {
    const parts = [];
    parts.push(`Provide practical coaching for: ${it._label} [${(it._modality||"").toUpperCase()}]`);
    const proto = norm(it.protocol_start); if (proto) parts.push(`Start: ${proto}`);
    const prog  = norm(it.progression_rule); if (prog) parts.push(`Progression: ${prog}`);
    const contra = norm(it.contraindications_flags); if (contra) parts.push(`Contraindications: ${contra}`);
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
    return data.message || data.answer || JSON.stringify(data);
  }

  function escapeHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  // ------------ ASK tab ------------
  function initAsk() {
    $("#ask-send").addEventListener("click", async () => {
      const q = ($("#ask-input") && $("#ask-input").value) || "";
      const out = $("#ask-output");
      if (!q) return;
      out.innerHTML = `<div class="card">Sending…</div>`;
      try {
        const resp = await fetch("/.netlify/functions/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passthrough: true,            // request verbatim API answer (no extra prompt)
            user_question: q
          }),
        }).then(r => r.json());
        const msg = resp.message || resp.answer || JSON.stringify(resp);
        out.innerHTML = `<div class="card ok"><strong>Coach:</strong><br>${escapeHtml(msg)}</div>`;
      } catch (e) {
        out.innerHTML = `<div class="card ok"><strong>Coach (offline fallback):</strong><br>${escapeHtml("Unable to reach AI. Check function/OPENAI_API_KEY.")}</div>`;
      }
    });
    $("#ask-clear").addEventListener("click", () => { if ($("#ask-input")) $("#ask-input").value = ""; if ($("#ask-output")) $("#ask-output").innerHTML = ""; });
  }

  // ------------ PROGRESS ------------
  function progressLoad(){ try{ return JSON.parse(localStorage.getItem(storeKey)||"[]"); }catch{return []} }
  function progressSave(a){ localStorage.setItem(storeKey, JSON.stringify(a)); }
  function progressRender(){
    const tableBody = $("#p-table tbody");
    if (!tableBody) return;
    const arr = progressLoad();
    tableBody.innerHTML = arr.map((r)=>
      `<tr><td>${r.date||""}</td><td>${r.type||""}</td><td>${r.dur||""}</td><td>${r.rpe||""}</td><td>${r.hrv||""}</td></tr>`
    ).join("");
  }
  function initProgress() {
    progressRender();
    $("#p-add") && $("#p-add").addEventListener("click", ()=>{
      const rec = { date: $("#p-date").value, type: $("#p-type").value, dur: $("#p-duration").value, rpe: $("#p-rpe").value, hrv: $("#p-hrv").value };
      const arr = progressLoad(); arr.push(rec); progressSave(arr); progressRender();
    });
    $("#p-clear") && $("#p-clear").addEventListener("click", ()=>{ if(confirm("Clear all progress entries?")){ progressSave([]); progressRender(); } });
  }

  // ------------ Bootstrap ------------
  function wirePlan(){ $("#generate-plan") && $("#generate-plan").addEventListener("click", renderPlan); $("#clear-plan") && $("#clear-plan").addEventListener("click", onClearPlan); addPlanSaveButton(); }
  function wireLibrary(){ $("#apply-filters") && $("#apply-filters").addEventListener("click", applyLibraryFilters); $("#clear-filters") && $("#clear-filters").addEventListener("click", clearLibraryFilters); }

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
      $("#tab-plan") && $("#tab-plan").appendChild(err);
    }
  }
  document.addEventListener("DOMContentLoaded", init);

  // expose progressRender for Save updates
  window.__bp_progressRender = progressRender;

})();
