
// Brain Health Exercise App — Fix 2
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
function hasAnyGoalFlags(rec){
  return ["cv_fitness","body_composition","lipids","glycemic_control","blood_pressure","muscle_mass"]
    .some(f => String(rec[f] ?? "").trim() === "1");
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

function hydrateSelectors(){
  const types = uniq(state.rows.map(r => (r[state.fields.exercise_type]||"").trim())).sort();
  const goals = uniq(state.rows.flatMap(goalsFromRow)).sort();
  const fill = (id, arr) => {
    const el = document.getElementById(id); el.innerHTML = "";
    arr.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; el.appendChild(o); });
  };
  fill("types", types); fill("goals", goals);
  fill("lib-types", types); fill("lib-goals", goals);
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
      ${goalsFromRow(rec).map(g=> `<span class="badge">${g}</span>`).join("")}
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

function filterRowsBy(types, goals){
  return state.rows.filter(r => {
    const tOK = types.length ? types.includes((r[state.fields.exercise_type]||"").trim()) : true;
    const rowGoals = goalsFromRow(r);
    const gOK = goals.length ? goals.some(g => rowGoals.includes(g)) : true;
    return tOK && gOK;
  });
}

function gatesAdvice({sleepEff, hrvDelta, sbp, dbp, tir}){
  const notes = [];
  if (isNum(sbp) && sbp >= 160) notes.push("SBP ≥160: avoid HIIT/plyo; choose low-intensity aerobic, breathing, mobility; recheck BP.");
  if (isNum(dbp) && dbp >= 100) notes.push("DBP ≥100: avoid vigorous work; emphasize technique and low-load options; monitor symptoms.");
  if (isNum(hrvDelta) && hrvDelta <= -7) notes.push("HRV ≤ baseline −7%: deload intensity/volume; favor Zone 2 + mobility.");
  if (isNum(sleepEff) && sleepEff < 85) notes.push("Sleep efficiency <85%: reduce intensity; prioritize low-stress work and form.");
  if (isNum(tir) && tir < 70) notes.push("CGM TIR <70%: prioritize resistance then Zone 2; add post‑meal walks.");
  if (!notes.length) notes.push("No gates triggered: progress if recent sessions were completed at target RPE and no symptoms.");
  return notes;
}

function choosePlanProtocols(types, goals){
  const list = filterRowsBy(types, goals);
  const preferred = list.filter(r => hasAnyGoalFlags(r) || (r.protocol_start||"").trim());
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
  const types = getMulti("types");
  const goals = getMulti("goals");
  const sleepEff = numOrNull(document.getElementById("sleep_eff").value);
  const hrvDelta = numOrNull(document.getElementById("hrv_delta").value);
  const sbp = numOrNull(document.getElementById("sbp").value);
  const dbp = numOrNull(document.getElementById("dbp").value);
  const tir = numOrNull(document.getElementById("cgm_tir").value);
  const gate = gatesAdvice({sleepEff, hrvDelta, sbp, dbp, tir});
  const gateBox = document.createElement("div");
  gateBox.className = gate.some(s=>/avoid|deload/i.test(s)) ? "notice" : "ok";
  gateBox.innerHTML = `<strong>Safety gates:</strong> ${gate.join(" ")}`;
  out.appendChild(gateBox);

  const picks = choosePlanProtocols(types, goals);
  if (!picks.length){
    const no = document.createElement("div"); no.className="card"; no.textContent="No items available for the current filters.";
    out.appendChild(no); return;
  }
  picks.forEach(rec => out.appendChild(renderCard(rec)));
}

function bindPlan(){
  document.getElementById("generate-plan").addEventListener("click", renderPlan);
  document.getElementById("clear-plan").addEventListener("click", ()=>{
    ["sleep_eff","hrv_delta","sbp","dbp","cgm_tir"].forEach(id=> document.getElementById(id).value = "");
    ["goals","types"].forEach(id=> Array.from(document.getElementById(id).options).forEach(o=> o.selected=false));
    document.getElementById("plan-output").innerHTML = "";
  });
}
function bindLibrary(){
  document.getElementById("apply-filters").addEventListener("click", ()=>{
    const t = getMulti("lib-types");
    const g = getMulti("lib-goals");
    const list = filterRowsBy(t,g);
    const out = document.getElementById("library-output"); out.innerHTML = "";
    if (!list.length){ const no = document.createElement("div"); no.className="card"; no.textContent="No items match the filters."; out.appendChild(no); return; }
    list.forEach(rec => out.appendChild(renderCard(rec)));
  });
  document.getElementById("clear-filters").addEventListener("click", ()=>{
    ["lib-types","lib-goals"].forEach(id=> Array.from(document.getElementById(id).options).forEach(o=> o.selected=false));
    document.getElementById("library-output").innerHTML = "";
  });
}
function bindAsk(){
  document.getElementById("ask-send").addEventListener("click", async ()=>{
    const q = (document.getElementById("ask-input").value || "").trim();
    const out = document.getElementById("ask-output"); out.innerHTML = "";
    if (!q){ out.textContent = "Please enter a question."; return; }
    const msg = await llmCoach("", {}, q);
    const box = document.createElement("div"); box.className="card"; box.innerHTML = `<strong>Coach:</strong> ${msg}`;
    out.appendChild(box);
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
  }catch(err){
    console.error("Init error:", err);
    const c = document.querySelector(".container");
    const warn = document.createElement("div");
    warn.className = "notice";
    warn.textContent = "Initialization failed. Ensure data/master.csv exists and is valid.";
    c.prepend(warn);
  }
})();
