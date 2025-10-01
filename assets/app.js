// Brain Exercise App — STRICT CSV READER (no guessing; detect headers from CSV as-is)
// Satisfies: Plan (hsCRP, HRV absolute, SBP/DBP/TIR gates, Exercise Type radio),
// Library (types + goals populated from CSV), Ask (clear button), Progress (multi-entry).

const state = {
  rows: [],
  headers: [],
  // Will be filled by detectSchema() using EXACT header names from master.csv
  fields: {
    title: null,                // e.g., "Exercise Type" (friendly display)
    exercise_type: null,        // e.g., "exercise_type" (machine value, lowercase)
    aliases: null,
    protocol_start: null,
    progression_rule: null,
    contraindications_flags: null,
    coach_prompt_api: null,
    coach_script_non_api: null,
    direct_cognitive_benefits: null,
    indirect_cognitive_benefits: null,
    mechanisms_brain_body: null,
    mechanism_tags: null,
    cognitive_targets: null,
    safety_notes: null,
    home_equipment: null,
    goal_label: null
  },
  goalCols: [],                 // any columns ending with "_goal"
};

// ---------- CSV parsing (no libs) ----------
function parseCSV(text) {
  const rows = [];
  const re = /(,|\r?\n|^)(?:"([^"]*(?:""[^"]*)*)"|([^",\r\n]*))/g;
  let row = []; let match; let str = text.replace(/\r\n/g, "\n");
  if (!str.endsWith("\n")) str += "\n";
  let headers = null;
  while ((match = re.exec(str))) {
    const delim = match[1];
    if (delim.length && delim !== ",") {
      if (headers === null) { headers = row; }
      else {
        const obj = {};
        for (let i = 0; i < headers.length; i++) obj[headers[i]] = row[i] ?? "";
        rows.push(obj);
      }
      row = [];
    }
    const val = match[2] ? match[2].replace(/""/g, '"') : match[3];
    row.push(val);
  }
  return { headers: rows.length ? Object.keys(rows[0] || {}) : headers || [], rows };
}

// ---------- Utilities ----------
const uniq = (a) => [...new Set(a.filter(Boolean))];
const numOrNull = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

// Find exact header if present; otherwise return null (no guessing)
function findHeaderExact(headers, name) {
  return headers.includes(name) ? name : null;
}
// Find any exact header among candidates, in order
function firstExact(headers, candidates) {
  for (const c of candidates) if (headers.includes(c)) return c;
  return null;
}

// Build displayable goal list from *_goal = "1" and/or goal_label (comma-separated)
function goalsFromRow(rec) {
  const out = [];
  for (const col of state.goalCols) {
    if (String(rec[col] ?? "").trim() === "1") out.push(col.replace(/_/g," "));
  }
  if (state.fields.goal_label) {
    const lbl = (rec[state.fields.goal_label] || "").split(",").map(s=>s.trim()).filter(Boolean);
    out.push(...lbl);
  }
  return uniq(out);
}

// ---------- Schema detection (STRICT) ----------
function detectSchema(headers) {
  state.headers = headers;

  // Titles: prefer friendly "Exercise Type" if present; else fall back to machine name; else null
  state.fields.title = findHeaderExact(headers, "Exercise Type");

  // Machine exercise type (lowercase column that drives filtering)
  state.fields.exercise_type = firstExact(headers, ["exercise_type", "modality", "type"]);

  // Optional extras
  state.fields.aliases = findHeaderExact(headers, "aliases");

  // Protocol & coaching
  state.fields.protocol_start       = firstExact(headers, ["protocol_start", "Protocol Start"]);
  state.fields.progression_rule     = firstExact(headers, ["progression_rule", "Progression Rule"]);
  state.fields.contraindications_flags = firstExact(headers, ["contraindications_flags","Contraindications","contraindications"]);
  state.fields.coach_prompt_api     = firstExact(headers, ["coach_prompt_api","Coach Prompt (API)"]);
  state.fields.coach_script_non_api = firstExact(headers, ["coach_script_non_api","Coach Script (non-API)"]);

  // Details
  state.fields.direct_cognitive_benefits  = firstExact(headers, ["direct_cognitive_benefits","Direct Cognitive Benefits"]);
  state.fields.indirect_cognitive_benefits= firstExact(headers, ["indirect_cognitive_benefits","Indirect Cognitive Benefits"]);
  state.fields.mechanisms_brain_body      = firstExact(headers, ["mechanisms_brain_body","Mechanisms Brain Body"]);
  state.fields.mechanism_tags             = firstExact(headers, ["mechanism_tags","Mechanism Tags"]);
  state.fields.cognitive_targets          = firstExact(headers, ["cognitive_targets","Cognitive Targets"]);
  state.fields.safety_notes               = firstExact(headers, ["safety_notes","Safety Notes"]);
  state.fields.home_equipment             = firstExact(headers, ["home_equipment","Home Equipment"]);

  // Goals
  state.fields.goal_label = firstExact(headers, ["goal_label","Goal Label"]);
  state.goalCols = headers.filter(h => /_goal$/.test(h));

  // Hard stop if neither friendly nor machine type exists (prevents “unnamed” cards)
  if (!state.fields.title && !state.fields.exercise_type) {
    throw new Error(
      'Required header missing: need either "Exercise Type" (friendly) or "exercise_type" (machine) in master.csv.'
    );
  }
}

// ---------- Data load ----------
async function loadCSV() {
  const res = await fetch("./data/master.csv", { cache: "no-store" });
  const text = await res.text();
  const parsed = parseCSV(text);
  // When CSV has a header row + N rows, parseCSV returns headers empty (because of our regex approach),
  // so recover headers from the first row's keys if available:
  const headers = parsed.headers.length ? parsed.headers : (parsed.rows[0] ? Object.keys(parsed.rows[0]) : []);
  detectSchema(headers);
  state.rows = parsed.rows;
}

// ---------- Tabs ----------
function mountTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b=> b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p=> p.classList.remove("active"));
      btn.classList.add("active");
      document.querySelector("#tab-"+btn.dataset.tab).classList.add("active");
    });
  });
}

// ---------- Library selectors ----------
function hydrateSelectors() {
  const types = uniq(state.rows.map(r => {
    const machine = state.fields.exercise_type ? String(r[state.fields.exercise_type]||"").trim().toLowerCase() : "";
    const friendly = state.fields.title ? String(r[state.fields.title]||"").trim() : "";
    // For the selector, prefer the machine key if present; fall back to friendly->lowercase; else blank (filtered out)
    return machine || (friendly ? friendly.toLowerCase() : "");
  }).filter(Boolean)).sort();

  const typesEl = document.getElementById("lib-types"); typesEl.innerHTML = "";
  if (types.length) {
    types.forEach(k => { const o = document.createElement("option"); o.value = k; o.textContent = k; typesEl.appendChild(o); });
  } else {
    const o = document.createElement("option"); o.value = ""; o.textContent = "— none in CSV —"; typesEl.appendChild(o);
  }

  const allGoals = uniq(state.rows.flatMap(goalsFromRow)).sort();
  const goalsEl = document.getElementById("lib-goals"); goalsEl.innerHTML = "";
  if (allGoals.length) {
    allGoals.forEach(g => { const o = document.createElement("option"); o.value = g; o.textContent = g; goalsEl.appendChild(o); });
  } else {
    const o = document.createElement("option"); o.value = ""; o.textContent = "— none in CSV —"; goalsEl.appendChild(o);
  }
}

const getMulti = (id) => Array.from(document.getElementById(id).selectedOptions).map(o=>o.value);

// ---------- Rendering ----------
function renderCard(rec) {
  const f = state.fields;
  const wrap = document.createElement("div"); wrap.className = "card";

  const title = (f.title && rec[f.title]) ? String(rec[f.title]).trim()
               : (f.exercise_type && rec[f.exercise_type]) ? String(rec[f.exercise_type]).trim()
               : "Protocol";

  const type  = f.exercise_type ? String(rec[f.exercise_type]||"").trim() : "";
  const proto = f.protocol_start ? String(rec[f.protocol_start]||"").trim() : "";
  const prog  = f.progression_rule ? String(rec[f.progression_rule]||"").trim() : "";
  const contra= f.contraindications_flags ? String(rec[f.contraindications_flags]||"").trim() : "";
  const nonAI = f.coach_script_non_api ? String(rec[f.coach_script_non_api]||"").trim() : "";
  const prompt= f.coach_prompt_api ? String(rec[f.coach_prompt_api]||"").trim() : "";

  const details = {
    direct: f.direct_cognitive_benefits ? String(rec[f.direct_cognitive_benefits]||"").trim() : "",
    indirect: f.indirect_cognitive_benefits ? String(rec[f.indirect_cognitive_benefits]||"").trim() : "",
    mech: f.mechanisms_brain_body ? String(rec[f.mechanisms_brain_body]||"").trim() : "",
    mechTags: f.mechanism_tags ? String(rec[f.mechanism_tags]||"").trim() : "",
    cogTargets: f.cognitive_targets ? String(rec[f.cognitive_targets]||"").trim() : "",
    safety: f.safety_notes ? String(rec[f.safety_notes]||"").trim() : "",
    equip: f.home_equipment ? String(rec[f.home_equipment]||"").trim() : ""
  };

  wrap.innerHTML = `
    <div class="kv">
      <span class="badge">${type || "type: n/a"}</span>
      ${goalsFromRow(rec).map(g=> `<span class="badge">${g}</span>`).join("")}
    </div>
    <h3>${title}</h3>
    <p><strong>Protocol:</strong> ${proto || "—"}</p>
    <p><strong>Progression:</strong> ${prog || "—"}</p>
    ${contra ? `<div class="notice"><strong>Contraindications:</strong> ${contra}</div>` : ""}
    ${nonAI ? `<p><strong>Coaching (rules-based):</strong> ${nonAI}</p>` : ""}
    <details>
      <summary>Details</summary>
      <p><strong>Direct cognitive benefits:</strong> ${details.direct || "—"}</p>
      <p><strong>Indirect cognitive benefits:</strong> ${details.indirect || "—"}</p>
      <p><strong>Mechanisms (brain↔body):</strong> ${details.mech || "—"}</p>
      <p><strong>Mechanism tags:</strong> ${details.mechTags || "—"}</p>
      <p><strong>Cognitive targets:</strong> ${details.cogTargets || "—"}</p>
      <p><strong>Safety notes:</strong> ${details.safety || "—"}</p>
      <p><strong>Home equipment:</strong> ${details.equip || "—"}</p>
    </details>
    <div class="actions" style="margin-top:8px;">
      <button type="button" class="secondary ask-llm">AI Coaching</button>
    </div>
  `;

  wrap.querySelector(".ask-llm").addEventListener("click", async ()=>{
    let out = wrap.querySelector(".ai-out");
    if (!out){ out = document.createElement("div"); out.className="ok ai-out"; wrap.appendChild(out); }
    out.textContent = "Generating…";
    const msg = await llmCoach(prompt, rec);
    out.innerHTML = `<strong>AI Coaching:</strong> ${msg}`;
  });

  return wrap;
}

// ---------- Filtering ----------
function wantKeyFromRadio() {
  return (document.querySelector('input[name="etype"]:checked')?.value || "both").toLowerCase();
}

function rowMatchesPlanType(rec, want) {
  // Prefer machine filter on exact CSV column
  if (state.fields.exercise_type) {
    const machine = String(rec[state.fields.exercise_type]||"").trim().toLowerCase();
    if (want === "both") return true;
    return machine === want;
  }
  // Fallback: if only friendly title exists, allow "both" to show all; otherwise no strict filtering
  if (state.fields.title) return want === "both";
  return true;
}

function filterRowsForPlan() {
  const want = wantKeyFromRadio();
  return state.rows.filter(r => rowMatchesPlanType(r, want));
}

function filterRowsForLibrary(typeKeys, goals) {
  return state.rows.filter(r => {
    const machine = state.fields.exercise_type ? String(r[state.fields.exercise_type]||"").trim().toLowerCase() : "";
    const okT = typeKeys.length ? typeKeys.includes(machine) : true;
    const rowGoals = goalsFromRow(r);
    const okG = goals.length ? goals.some(g => rowGoals.includes(g)) : true;
    return okT && okG;
  });
}

// ---------- Netlify function (AI + fallback) ----------
async function llmCoach(coachPrompt, record, extraUserQ=null){
  try{
    const resp = await fetch("/.netlify/functions/coach", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        mode: extraUserQ ? "ask" : "coach",
        coach_prompt_api: coachPrompt || "",
        record,
        user_question: extraUserQ || ""
      })
    });
    if (!resp.ok) throw new Error("Function error");
    const data = await resp.json();
    return data.message || "(No response)";
  }catch(e){
    const f = state.fields;
    const proto = f.protocol_start ? (record[f.protocol_start]||"") : "";
    const prog  = f.progression_rule ? (record[f.progression_rule]||"") : "";
    const non   = f.coach_script_non_api ? (record[f.coach_script_non_api]||"") : "";
    return [non, proto && `Protocol: ${proto}`, prog && `Progression: ${prog}`].filter(Boolean).join(" — ")
      || "Rules-based guidance is unavailable for this item.";
  }
}

// ---------- PLAN ----------
function gatesAdvice({sbp, dbp, tir, hscrp}){
  const notes = [];
  if (isNum(sbp) && sbp >= 160) notes.push("SBP ≥160: avoid HIIT/plyo; choose low-intensity aerobic, breathing, mobility; recheck BP.");
  if (isNum(dbp) && dbp >= 100) notes.push("DBP ≥100: avoid vigorous work; emphasize technique and low-load options; monitor symptoms.");
  if (isNum(tir) && tir < 70)  notes.push("CGM TIR <70%: prioritize resistance then Zone 2; add post-meal walks.");
  if (isNum(hscrp) && hscrp >= 3) notes.push("hsCRP ≥3 mg/L: prefer low-impact; avoid excessive eccentric load; extend warm-up.");
  if (!notes.length) notes.push("No gates triggered: progress if recent sessions were completed at target RPE and no symptoms.");
  return notes;
}

function choosePlanProtocols() {
  const list = filterRowsForPlan();
  // Prefer rows that have a protocol_start value
  const preferred = state.fields.protocol_start ? list.filter(r => String(r[state.fields.protocol_start]||"").trim()) : list;
  return (preferred.length ? preferred : list).slice(0,3);
}

function renderPlan(){
  const out = document.getElementById("plan-output"); out.innerHTML = "";
  const sbp = numOrNull(document.getElementById("sbp").value);
  const dbp = numOrNull(document.getElementById("dbp").value);
  const tir = numOrNull(document.getElementById("cgm_tir").value);
  const hscrp = numOrNull(document.getElementById("hscrp").value);

  const gate = gatesAdvice({sbp, dbp, tir, hscrp});
  const gateBox = document.createElement("div");
  gateBox.className = gate.some(s=>/avoid|prefer|deload/i.test(s)) ? "notice" : "ok";
  gateBox.innerHTML = `<strong>Safety gates:</strong> ${gate.join(" ")}`;
  out.appendChild(gateBox);

  const picks = choosePlanProtocols();
  if (!picks.length){
    const no = document.createElement("div"); no.className="card"; no.textContent="No items available (check CSV exercise_type/title).";
    out.appendChild(no); return;
  }
  picks.forEach(rec => out.appendChild(renderCard(rec)));
}

function bindPlan(){
  document.getElementById("generate-plan").addEventListener("click", renderPlan);
  document.getElementById("clear-plan").addEventListener("click", ()=>{
    ["sleep_eff","hrv_value","sbp","dbp","cgm_tir","hscrp"].forEach(id=> document.getElementById(id).value = "");
    document.querySelector('input[name="etype"][value="both"]').checked = true;
    document.getElementById("plan-output").innerHTML = "";
  });
}

// ---------- LIBRARY ----------
function bindLibrary(){
  document.getElementById("apply-filters").addEventListener("click", ()=>{
    let t = getMulti("lib-types").map(s=>s.toLowerCase()).filter(Boolean);
    let g = getMulti("lib-goals").filter(Boolean);
    const list = filterRowsForLibrary(t, g);
    const out = document.getElementById("library-output"); out.innerHTML = "";
    if (!list.length){ const no = document.createElement("div"); no.className="card"; no.textContent="No items match the filters."; out.appendChild(no); return; }
    list.forEach(rec => out.appendChild(renderCard(rec)));
  });
  document.getElementById("clear-filters").addEventListener("click", ()=>{
    ["lib-types","lib-goals"].forEach(id=> Array.from(document.getElementById(id).options).forEach(o=> o.selected=false));
    document.getElementById("library-output").innerHTML = "";
  });
}

// ---------- ASK ----------
function bindAsk(){
  const input = document.getElementById("ask-input");
  const output = document.getElementById("ask-output");
  document.getElementById("ask-send").addEventListener("click", async ()=>{
    const q = (input.value || "").trim();
    output.innerHTML = "";
    if (!q){ output.innerHTML = '<div class="warn">Please enter a question.</div>'; return; }
    const msg = await llmCoach("", {}, q);
    const box = document.createElement("div"); box.className="card"; box.innerHTML = `<strong>Coach:</strong> ${msg}`;
    output.appendChild(box);
  });
  document.getElementById("ask-clear").addEventListener("click", ()=>{
    input.value = "";
    output.innerHTML = "";
    input.focus();
  });
}

// ---------- PROGRESS (multi-entry/day) ----------
const PKEY = "bp_exercise_progress_v1";
function loadProgress(){ try{ return JSON.parse(localStorage.getItem(PKEY) || "[]"); }catch{ return []; } }
function saveProgress(arr){ localStorage.setItem(PKEY, JSON.stringify(arr)); }
function renderProgressTable(){
  const tbody = document.querySelector("#p-table tbody"); tbody.innerHTML = "";
  loadProgress().forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.date}</td><td>${row.type}</td><td>${row.duration}</td><td>${row.rpe}</td><td>${row.hrv ?? ""}</td>`;
    tbody.appendChild(tr);
  });
}
function bindProgress(){
  const dateEl = document.getElementById("p-date");
  dateEl.valueAsDate = new Date();
  document.getElementById("p-add").addEventListener("click", ()=>{
    const row = {
      date: document.getElementById("p-date").value || new Date().toISOString().slice(0,10),
      type: document.getElementById("p-type").value,
      duration: Number(document.getElementById("p-duration").value || 0),
      rpe: Number(document.getElementById("p-rpe").value || 0),
      hrv: numOrNull(document.getElementById("p-hrv").value)
    };
    const arr = loadProgress(); arr.push(row); saveProgress(arr); renderProgressTable();
  });
  document.getElementById("p-clear").addEventListener("click", ()=>{
    if (confirm("Clear ALL progress entries?")){ saveProgress([]); renderProgressTable(); }
  });
}

// ---------- Boot ----------
(async function init(){
  try{
    mountTabs();
    await loadCSV();
    hydrateSelectors();
    bindPlan();
    bindLibrary();
    bindAsk();
    bindProgress();
    renderProgressTable();
  }catch(err){
    console.error("Init error:", err);
    const c = document.querySelector(".container");
    const warn = document.createElement("div");
    warn.className = "warn";
    warn.textContent = "Initialization failed: " + String(err.message || err);
    c.prepend(warn);
  }
})();
