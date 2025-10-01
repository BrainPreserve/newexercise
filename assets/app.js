
// Brain Exercise App — UX3 update
// Implements user-requested fixes.
const state = {
  rows: [],
  fields: {
    title: "title",
    exercise_type: "exercise_type",
    protocol_start: "protocol_start",
    progression_rule: "progression_rule",
    contraindications_flags: "contraindications_flags",
    coach_script_non_api: "coach_script_non_api",
    coach_prompt_api: "coach_prompt_api",
    goal_label: "goal_label",
    cv_fitness: "cv_fitness",
    body_composition: "body_composition",
    lipids: "lipids",
    glycemic_control: "glycemic_control",
    blood_pressure: "blood_pressure",
    muscle_mass: "muscle_mass",
    direct_cognitive_benefits: "direct_cognitive_benefits",
    indirect_cognitive_benefits: "indirect_cognitive_benefits",
    mechanisms_brain_body: "mechanisms_brain_body",
    mechanism_tags: "mechanism_tags",
    cognitive_targets: "cognitive_targets",
    safety_notes: "safety_notes",
    home_equipment: "home_equipment"
  }
};

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
        const obj = {}; for (let i=0;i<headers.length;i++) obj[headers[i]] = row[i] ?? "";
        rows.push(obj);
      }
      row = [];
    }
    const val = match[2] ? match[2].replace(/""/g, '"') : match[3];
    row.push(val);
  }
  return rows;
}

const uniq = (a) => [...new Set(a.filter(Boolean))];
const numOrNull = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

function goalsFromRow(rec) {
  const set = new Set();
  (rec["goal_label"]||"").split(",").map(s=>s.trim()).filter(Boolean).forEach(g=> set.add(g));
  ["cv_fitness","body_composition","lipids","glycemic_control","blood_pressure","muscle_mass"].forEach(flag=>{
    if (String(rec[flag] ?? "") === "1") set.add(flag);
  });
  return [...set];
}

async function loadCSV(){
  const res = await fetch("./data/master.csv", { cache: "no-store" });
  const text = await res.text();
  state.rows = parseCSV(text);
}

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

// Library selectors
function hydrateSelectors(){
  let types = uniq(state.rows.map(r => (r[state.fields.exercise_type]||"").trim().toLowerCase())).sort();
  if (!types.length){ types = ["— none in CSV —"]; }
  const fill = (id, arr) => {
    const el = document.getElementById(id); el.innerHTML = "";
    arr.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; el.appendChild(o); });
  };
  fill("lib-types", types);

  let goals = uniq(state.rows.flatMap(goalsFromRow)).sort();
  if (!goals.length){ goals = ["— none in CSV —"]; }
  fill("lib-goals", goals);
}

const getMulti = (id) => Array.from(document.getElementById(id).selectedOptions).map(o=>o.value);

function renderCard(rec){
  const f = state.fields;
  const wrap = document.createElement("div"); wrap.className = "card";
  const title = rec[f.title] || rec[f.exercise_type] || "Protocol";
  const type  = rec[f.exercise_type] || "";
  const proto = rec[f.protocol_start] || "";
  const prog  = rec[f.progression_rule] || "";
  const contra= rec[f.contraindications_flags] || "";
  const nonAI = rec[f.coach_script_non_api] || "";
  const prompt= rec[f.coach_prompt_api] || "";
  const details = {
    direct: rec[f.direct_cognitive_benefits] || "",
    indirect: rec[f.indirect_cognitive_benefits] || "",
    mech: rec[f.mechanisms_brain_body] || "",
    mechTags: rec[f.mechanism_tags] || "",
    cogTargets: rec[f.cognitive_targets] || "",
    safety: rec[f.safety_notes] || "",
    equip: rec[f.home_equipment] || ""
  };

  wrap.innerHTML = `
    <div class="kv">
      <span class="badge">${type || "type: n/a"}</span>
    </div>
    <h3>${title}</h3>
    <p><strong>Protocol:</strong> ${proto || "—"}</p>
    <p><strong>Progression:</strong> ${prog || "—"}</p>
    ${contra ? `<div class="notice"><strong>Contraindications:</strong> ${contra}</div>` : ""}
    <p><strong>Coaching (rules-based):</strong> ${nonAI || "—"}</p>
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

function filterRowsByType(typeRadioValue){
  const want = (typeRadioValue || "both").toLowerCase();
  if (want === "both") return state.rows;
  return state.rows.filter(r => (r[state.fields.exercise_type]||"").trim().toLowerCase() === want);
}

// PLAN
function gatesAdvice({sbp, dbp, tir, hscrp}){
  const notes = [];
  if (isNum(sbp) && sbp >= 160) notes.push("SBP ≥160: avoid HIIT/plyo; choose low-intensity aerobic, breathing, mobility; recheck BP.");
  if (isNum(dbp) && dbp >= 100) notes.push("DBP ≥100: avoid vigorous work; emphasize technique and low-load options; monitor symptoms.");
  if (isNum(tir) && tir < 70) notes.push("CGM TIR <70%: prioritize resistance then Zone 2; add post-meal walks.");
  if (isNum(hscrp) && hscrp >= 3) notes.push("hsCRP ≥3 mg/L: prefer low-impact options; avoid excessive eccentric load; extend warm-up.");
  if (!notes.length) notes.push("No gates triggered: progress if recent sessions were completed at target RPE and no symptoms.");
  return notes;
}

function choosePlanProtocols(typeRadioValue){
  const list = filterRowsByType(typeRadioValue);
  const preferred = list.filter(r => (r.protocol_start||"").trim());
  return (preferred.length ? preferred : list).slice(0,3);
}

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
    const proto = record["protocol_start"] || "";
    const prog  = record["progression_rule"] || "";
    const non   = record["coach_script_non_api"] || "";
    return [non, proto && `Protocol: ${proto}`, prog && `Progression: ${prog}`].filter(Boolean).join(" — ")
      || "Rules-based guidance is unavailable for this item.";
  }
}

function renderPlan(){
  const out = document.getElementById("plan-output"); out.innerHTML = "";
  const sbp = numOrNull(document.getElementById("sbp").value);
  const dbp = numOrNull(document.getElementById("dbp").value);
  const tir = numOrNull(document.getElementById("cgm_tir").value);
  const hscrp = numOrNull(document.getElementById("hscrp").value);
  const typeValue = (document.querySelector('input[name="etype"]:checked')?.value || "both").toLowerCase();

  const gate = gatesAdvice({sbp, dbp, tir, hscrp});
  const gateBox = document.createElement("div");
  gateBox.className = gate.some(s=>/avoid|prefer|deload/i.test(s)) ? "notice" : "ok";
  gateBox.innerHTML = `<strong>Safety gates:</strong> ${gate.join(" ")}`;
  out.appendChild(gateBox);

  const picks = choosePlanProtocols(typeValue);
  if (!picks.length){
    const no = document.createElement("div"); no.className="card"; no.textContent="No items available (check CSV 'exercise_type').";
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

// LIBRARY
function bindLibrary(){
  document.getElementById("apply-filters").addEventListener("click", ()=>{
    let t = getMulti("lib-types").map(s=>s.toLowerCase()).filter(v=>!/^— none/.test(v));
    let g = getMulti("lib-goals").filter(v=>!/^— none/.test(v));
    const list = state.rows.filter(r => {
      const type = (r[state.fields.exercise_type]||"").trim().toLowerCase();
      const okT = t.length ? t.includes(type) : true;
      const rowGoals = goalsFromRow(r);
      const okG = g.length ? g.some(x => rowGoals.includes(x)) : true;
      return okT && okG;
    });
    const out = document.getElementById("library-output"); out.innerHTML = "";
    if (!list.length){ const no = document.createElement("div"); no.className="card"; no.textContent="No items match the filters."; out.appendChild(no); return; }
    list.forEach(rec => out.appendChild(renderCard(rec)));
  });
  document.getElementById("clear-filters").addEventListener("click", ()=>{
    ["lib-types","lib-goals"].forEach(id=> Array.from(document.getElementById(id).options).forEach(o=> o.selected=false));
    document.getElementById("library-output").innerHTML = "";
  });
}

// ASK
function bindAsk(){
  const input = document.getElementById("ask-input");
  const output = document.getElementById("ask-output");
  document.getElementById("ask-send").addEventListener("click", async ()=>{
    const q = (input.value || "").trim();
    output.innerHTML = "";
    if (!q){ output.textContent = "Please enter a question."; return; }
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

// PROGRESS (multiple entries per day via localStorage)
const PKEY = "bp_exercise_progress_v1";
function loadProgress(){ try{ return JSON.parse(localStorage.getItem(PKEY) || "[]"); }catch{ return []; } }
function saveProgress(arr){ localStorage.setItem(PKEY, JSON.stringify(arr)); }
function renderProgressTable(){
  const tbody = document.querySelector("#p-table tbody"); tbody.innerHTML = "";
  const arr = loadProgress();
  arr.forEach(row => {
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
    const arr = loadProgress();
    arr.push(row);
    saveProgress(arr);
    renderProgressTable();
  });
  document.getElementById("p-clear").addEventListener("click", ()=>{
    if (confirm("Clear ALL progress entries?")){ saveProgress([]); renderProgressTable(); }
  });
}

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
    warn.className = "notice";
    warn.textContent = "Initialization failed. Ensure data/master.csv exists and is valid.";
    c.prepend(warn);
  }
})();
