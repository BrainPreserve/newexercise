// STRICT CSV READER — reads master.csv EXACTLY (no guessing)
// Requirements implemented:
// - Plan radio uses modality: "resistance", "aerobic", "none"; "Both" shows resistance + aerobic + none.
// - Library "Exercise Type" list comes directly from the "Exercise Type" column.
// - Library "Goals" list comes ONLY from headers that end with "_goal"; filtering = value === "1".
// - If required headers are missing, show a clear error.

const REQUIRED_HEADERS = ["Exercise Type", "modality"]; // exact
const STATE = {
  rows: [],
  headers: [],
  goalsHeaders: [], // *_goal columns
  // Optional columns used for details/coaching if present
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
  home_equipment: null
};

// ---- CSV parsing (no libs) ----
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
  return { headers, rows };
}

// ---- Data load & schema checks ----
async function loadCSVStrict() {
  const res = await fetch("./data/master.csv", { cache: "no-store" });
  const text = await res.text();
  const parsed = parseCSV(text);
  const headers = parsed.headers || [];
  // Validate required headers
  for (const h of REQUIRED_HEADERS) {
    if (!headers.includes(h)) throw new Error(`Required header missing in master.csv: "${h}"`);
  }
  STATE.headers = headers;
  STATE.rows = parsed.rows;

  // Detect *_goal headers exactly
  STATE.goalsHeaders = headers.filter(h => /_goal$/.test(h));

  // Optional descriptive columns (only used if present)
  const opt = (nameArr) => nameArr.find(n => headers.includes(n)) || null;
  STATE.protocol_start           = opt(["protocol_start"]);
  STATE.progression_rule         = opt(["progression_rule"]);
  STATE.contraindications_flags  = opt(["contraindications_flags"]);
  STATE.coach_prompt_api         = opt(["coach_prompt_api"]);
  STATE.coach_script_non_api     = opt(["coach_script_non_api"]);
  STATE.direct_cognitive_benefits= opt(["direct_cognitive_benefits"]);
  STATE.indirect_cognitive_benefits= opt(["indirect_cognitive_benefits"]);
  STATE.mechanisms_brain_body    = opt(["mechanisms_brain_body"]);
  STATE.mechanism_tags           = opt(["mechanism_tags"]);
  STATE.cognitive_targets        = opt(["cognitive_targets"]);
  STATE.safety_notes             = opt(["safety_notes"]);
  STATE.home_equipment           = opt(["home_equipment"]);
}

// ---- Tabs ----
function mountTabs(){
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b=> b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p=> p.classList.remove("active"));
      btn.classList.add("active");
      document.querySelector("#tab-"+btn.dataset.tab).classList.add("active");
    });
  });
}

// ---- Helpers ----
const uniq = (a) => [...new Set(a.filter(Boolean))];
const numOrNull = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

// Build goals list for a row: only *_goal == "1"
function goalsFromRow(rec){
  const out = [];
  for (const h of STATE.goalsHeaders) {
    if (String(rec[h] ?? "").trim() === "1") out.push(h); // exact header as label
  }
  return out;
}

// ---- Library selectors ----
function hydrateLibrarySelectors(){
  // Exercise Types from "Exercise Type" (friendly, exact)
  const types = uniq(STATE.rows.map(r => String(r["Exercise Type"]||"").trim()).filter(Boolean)).sort();
  const elT = document.getElementById("lib-types"); elT.innerHTML = "";
  if (types.length){
    types.forEach(v => { const o=document.createElement("option"); o.value=v; o.textContent=v; elT.appendChild(o); });
  } else {
    const o=document.createElement("option"); o.value=""; o.textContent="— none in CSV —"; elT.appendChild(o);
  }

  // Goals from *_goal headers (exact header names)
  const goals = STATE.goalsHeaders.slice().sort();
  const elG = document.getElementById("lib-goals"); elG.innerHTML = "";
  if (goals.length){
    goals.forEach(g => { const o=document.createElement("option"); o.value=g; o.textContent=g; elG.appendChild(o); });
  } else {
    const o=document.createElement("option"); o.value=""; o.textContent="— none in CSV —"; elG.appendChild(o);
  }
}

const getMulti = (id) => Array.from(document.getElementById(id).selectedOptions).map(o=>o.value);

// ---- Cards ----
function renderCard(rec){
  const wrap = document.createElement("div"); wrap.className = "card";
  const title = String(rec["Exercise Type"] || "").trim() || "Protocol";
  const type  = String(rec["modality"] || "").trim();
  const proto = STATE.protocol_start ? String(rec[STATE.protocol_start]||"").trim() : "";
  const prog  = STATE.progression_rule ? String(rec[STATE.progression_rule]||"").trim() : "";
  const contra= STATE.contraindications_flags ? String(rec[STATE.contraindications_flags]||"").trim() : "";
  const nonAI = STATE.coach_script_non_api ? String(rec[STATE.coach_script_non_api]||"").trim() : "";

  const details = {
    direct: STATE.direct_cognitive_benefits ? String(rec[STATE.direct_cognitive_benefits]||"").trim() : "",
    indirect: STATE.indirect_cognitive_benefits ? String(rec[STATE.indirect_cognitive_benefits]||"").trim() : "",
    mech: STATE.mechanisms_brain_body ? String(rec[STATE.mechanisms_brain_body]||"").trim() : "",
    mechTags: STATE.mechanism_tags ? String(rec[STATE.mechanism_tags]||"").trim() : "",
    cogTargets: STATE.cognitive_targets ? String(rec[STATE.cognitive_targets]||"").trim() : "",
    safety: STATE.safety_notes ? String(rec[STATE.safety_notes]||"").trim() : "",
    equip: STATE.home_equipment ? String(rec[STATE.home_equipment]||"").trim() : ""
  };

  wrap.innerHTML = `
    <div class="kv">
      <span class="badge">${type || "modality: n/a"}</span>
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
  `;
  return wrap;
}

// ---- PLAN ----
function gatesAdvice({sbp, dbp, tir, hscrp}){
  const notes = [];
  if (isNum(sbp) && sbp >= 160) notes.push("SBP ≥160: avoid HIIT/plyo; choose low-intensity aerobic, breathing, mobility; recheck BP.");
  if (isNum(dbp) && dbp >= 100) notes.push("DBP ≥100: avoid vigorous work; emphasize technique and low-load options; monitor symptoms.");
  if (isNum(tir) && tir < 70)  notes.push("CGM TIR <70%: prioritize resistance then Zone 2; add post-meal walks.");
  if (isNum(hscrp) && hscrp >= 3) notes.push("hsCRP ≥3 mg/L: prefer low-impact; avoid excessive eccentric load; extend warm-up.");
  if (!notes.length) notes.push("No gates triggered: progress if recent sessions were completed at target RPE and no symptoms.");
  return notes;
}

function wantModality(){ return (document.querySelector('input[name="etype"]:checked')?.value || "both").toLowerCase(); }

function planFilterByModality(rec, want){
  const m = String(rec["modality"] || "").trim().toLowerCase();
  if (want === "resistance") return m === "resistance";
  if (want === "aerobic")    return m === "aerobic";
  // Both should also include "none" (soleus push-up, exercise snacks)
  if (want === "both")       return m === "resistance" || m === "aerobic" || m === "none";
  return false;
}

function choosePlanRows(){
  const want = wantModality();
  const list = STATE.rows.filter(r => planFilterByModality(r, want));
  // Prefer rows that actually have protocol content
  const withProtocol = STATE.protocol_start ? list.filter(r => String(r[STATE.protocol_start]||"").trim()) : list;
  return (withProtocol.length ? withProtocol : list).slice(0,3);
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

  const picks = choosePlanRows();
  if (!picks.length){
    const no = document.createElement("div"); no.className="card"; no.textContent="No items available (check CSV modality).";
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

// ---- LIBRARY ----
function libraryFilter(selectedTypes, selectedGoals){
  return STATE.rows.filter(r => {
    // Type filter uses the friendly "Exercise Type" (exact text match)
    const tFriendly = String(r["Exercise Type"]||"").trim();
    const tOK = selectedTypes.length ? selectedTypes.includes(tFriendly) : true;
    // Goals: ALL selected goals must be "1" ?
    // Your earlier instruction was “options should be from *_goal headers; read exactly”.
    // Typically we treat selection as ANY; if you want ALL, change `.some` to `.every`.
    const gOK = selectedGoals.length
      ? selectedGoals.some(g => String(r[g]||"").trim() === "1")
      : true;
    return tOK && gOK;
  });
}

function bindLibrary(){
  document.getElementById("apply-filters").addEventListener("click", ()=>{
    const types = getMulti("lib-types");
    const goals = getMulti("lib-goals");
    const list = libraryFilter(types, goals);
    const out = document.getElementById("library-output"); out.innerHTML = "";
    if (!list.length){ const no=document.createElement("div"); no.className="card"; no.textContent="No items match the filters."; out.appendChild(no); return; }
    list.forEach(rec => out.appendChild(renderCard(rec)));
  });
  document.getElementById("clear-filters").addEventListener("click", ()=>{
    ["lib-types","lib-goals"].forEach(id=> Array.from(document.getElementById(id).options).forEach(o=> o.selected=false));
    document.getElementById("library-output").innerHTML = "";
  });
}

// ---- ASK ----
async function llmCoach(coachPrompt, record, extraUserQ=null){
  try{
    const resp = await fetch("/.netlify/functions/coach", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ mode: extraUserQ ? "ask" : "coach", coach_prompt_api: coachPrompt || "", record, user_question: extraUserQ || "" })
    });
    if (!resp.ok) throw new Error("Function error");
    const data = await resp.json();
    return data.message || "(No response)";
  }catch(e){
    const proto = STATE.protocol_start ? (record[STATE.protocol_start]||"") : "";
    const prog  = STATE.progression_rule ? (record[STATE.progression_rule]||"") : "";
    const non   = STATE.coach_script_non_api ? (record[STATE.coach_script_non_api]||"") : "";
    return [non, proto && `Protocol: ${proto}`, prog && `Progression: ${prog}`].filter(Boolean).join(" — ")
      || "Rules-based guidance is unavailable for this item.";
  }
}

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

// ---- PROGRESS (multi-entry/day) ----
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

// ---- Boot ----
(async function init(){
  try{
    mountTabs();
    await loadCSVStrict();
    hydrateLibrarySelectors();
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
