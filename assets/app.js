
// Brain Health Exercise App (Starter) — CSP-safe (no inline JS)
/* MVP goals:
 * - Read data/master.csv EXACTLY (no guessing). Show types & goals from CSV.
 * - Plan: deterministic gating + protocol selection using CSV.
 * - Library: combined filter by Exercise Type(s) AND Goal(s).
 * - Ask: optional server-side LLM via Netlify function; fallback to deterministic.
 */

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
    // Common goal flags; the CSV may include more (1/0) columns:
    cv_fitness: "cv_fitness",
    body_composition: "body_composition",
    lipids: "lipids",
    glycemic_control: "glycemic_control",
    blood_pressure: "blood_pressure",
    muscle_mass: "muscle_mass",
    // Details wrapper columns:
    direct_cognitive_benefits: "direct_cognitive_benefits",
    indirect_cognitive_benefits: "indirect_cognitive_benefits",
    mechanisms_brain_body: "mechanisms_brain_body",
    mechanism_tags: "mechanism_tags",
    cognitive_targets: "cognitive_targets",
    safety_notes: "safety_notes",
    home_equipment: "home_equipment"
  }
};

// Simple CSV parser (no external deps)
function parseCSV(text) {
  const rows = [];
  const re = /(,|\r?\n|^)(?:"([^"]*(?:""[^"]*)*)"|([^",\r\n]*))/g;
  let row = []; let match; let str = text.replace(/\r\n/g, "\n");
  if (!str.endsWith("\n")) str += "\n";
  let i = 0, headers = null;
  while ((match = re.exec(str))) {
    const delim = match[1];
    if (delim.length && delim !== ",") {
      if (headers === null) { headers = row; } else { rows.push(Object.fromEntries(headers.map((h, idx) => [h, row[idx] ?? ""]))); }
      row = [];
    }
    let val = match[2] ? match[2].replace(/""/g, '"') : match[3];
    row.push(val);
  }
  return rows;
}

// Utilities
function uniq(arr){ return [...new Set(arr.filter(Boolean))]; }
function byKeys(obj, keys){ const out = {}; keys.forEach(k=> out[k]=obj[k] ?? ""); return out; }
function hasAnyGoalFlags(rec) {
  const flags = ["cv_fitness","body_composition","lipids","glycemic_control","blood_pressure","muscle_mass"];
  return flags.some(f => String(rec[f] ?? "").trim() === "1");
}
function goalsFromRow(rec) {
  const set = new Set();
  const label = (rec["goal_label"]||"").split(",").map(s=>s.trim()).filter(Boolean);
  label.forEach(g=> set.add(g));
  // Add snake_case flags where == "1"
  ["cv_fitness","body_composition","lipids","glycemic_control","blood_pressure","muscle_mass"].forEach(flag=>{
    if (String(rec[flag] ?? "") === "1") set.add(flag);
  });
  return [...set];
}

async function loadCSV() {
  const res = await fetch("./data/master.csv", {cache: "no-store"});
  const text = await res.text();
  const rows = parseCSV(text);
  state.rows = rows;
}

function mountTabs(){
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b=> b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p=> p.classList.remove("active"));
      btn.classList.add("active");
      const id = btn.dataset.tab;
      document.querySelector("#tab-"+id).classList.add("active");
    });
  });
}

function hydrateSelectors(){
  const types = uniq(state.rows.map(r => (r[state.fields.exercise_type]||"").trim())).sort();
  const goals = uniq(state.rows.flatMap(goalsFromRow)).sort();

  const fill = (sel, arr) => {
    const el = document.getElementById(sel);
    el.innerHTML = "";
    arr.forEach(v=>{
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      el.appendChild(opt);
    });
  };
  fill("types", types); fill("goals", goals);
  fill("lib-types", types); fill("lib-goals", goals);
}

function getMultiSelectValues(id){
  return Array.from(document.getElementById(id).selectedOptions).map(o=>o.value);
}

function renderCard(rec, mode="library"){
  const title = rec[state.fields.title] || rec[state.fields.exercise_type] || "Protocol";
  const type = rec[state.fields.exercise_type] || "";
  const proto = rec[state.fields.protocol_start] || "";
  const prog = rec[state.fields.progression_rule] || "";
  const contra = rec[state.fields.contraindications_flags] || "";
  const coachNonAPI = rec[state.fields.coach_script_non_api] || "";
  const coachPrompt = rec[state.fields.coach_prompt_api] || "";

  const details = {
    direct: rec[state.fields.direct_cognitive_benefits] || "",
    indirect: rec[state.fields.indirect_cognitive_benefits] || "",
    mech: rec[state.fields.mechanisms_brain_body] || "",
    mechTags: rec[state.fields.mechanism_tags] || "",
    cogTargets: rec[state.fields.cognitive_targets] || "",
    safety: rec[state.fields.safety_notes] || "",
    equip: rec[state.fields.home_equipment] || ""
  };

  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.innerHTML = `
    <div class="kv">
      <span class="badge">${type || "type: n/a"}</span>
      ${goalsFromRow(rec).map(g=> `<span class="badge">${g}</span>`).join("")}
    </div>
    <h3>${title}</h3>
    <p><strong>Protocol:</strong> ${proto || "—"}</p>
    <p><strong>Progression:</strong> ${prog || "—"}</p>
    ${contra ? `<div class="notice"><strong>Contraindications:</strong> ${contra}</div>`: ""}
    <p><strong>Coaching (rules‑based):</strong> ${coachNonAPI || "—"}</p>
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
  wrap.querySelector(".ask-llm").addEventListener("click", async () => {
    const out = wrap.querySelector(".ai-out") || document.createElement("div");
    out.className = "ok ai-out"; out.textContent = "Generating…";
    wrap.appendChild(out);
    const prompt = (rec[state.fields.coach_prompt_api] || "").trim();
    const result = await llmCoach(prompt, rec);
    out.innerHTML = `<strong>AI Coaching:</strong> ${result}`;
  });
  return wrap;
}

function filterRowsBy(types, goals){
  return state.rows.filter(r => {
    const typeOk = types.length ? types.includes((r[state.fields.exercise_type]||"").trim()) : true;
    const rowGoals = goalsFromRow(r);
    const goalsOk = goals.length ? goals.some(g => rowGoals.includes(g)) : true;
    return typeOk && goalsOk;
  });
}

// PLAN tab logic (deterministic gates)
function gatesAdvice({sleepEff, hrvDelta, sbp, tir}){
  const notes = [];

  if (sbp !== null && sbp >= 160) notes.push("SBP ≥ 160: avoid HIIT/plyometrics; choose low‑intensity aerobic, breathing, and mobility. Recheck BP.");
  if (hrvDelta !== null && hrvDelta <= -7) notes.push("HRV ≤ baseline −7%: deload intensity/volume; emphasize Zone 2 and mobility.");
  if (sleepEff !== null && sleepEff < 85) notes.push("Sleep efficiency <85%: reduce intensity; prioritize technique and low‑stress work.");
  if (tir !== null andNumber(tir) and (tir < 70)) notes.push("CGM TIR <70%: prioritize resistance, then Zone 2; include post‑meal walks.");

  if (notes.length === 0) notes.push("No gates triggered: progress normally if last 2 sessions were completed at target RPE and no symptoms.");
  return notes;
}
function andNumber(x){ return typeof x === "number" && !Number.isNaN(x); }

function choosePlanProtocols(types, goals){
  const list = filterRowsBy(types, goals);
  // Prefer items that have any goal flag or protocol text
  const preferred = list.filter(r => hasAnyGoalFlags(r) || (r.protocol_start||"").trim());
  return (preferred.length ? preferred : list).slice(0, 3);
}

async function llmCoach(coachPrompt, record, extraUserQ=null){
  // Calls Netlify function if available; otherwise falls back to deterministic coaching.
  try{
    const resp = await fetch("/.netlify/functions/coach", {
      method:"POST", headers:{ "Content-Type":"application/json" },
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
    // Fallback: deterministic blend
    const proto = record[state.fields.protocol_start] || "";
    const prog = record[state.fields.progression_rule] || "";
    const non = record[state.fields.coach_script_non_api] || "";
    return [non, proto && `Protocol: ${proto}`, prog && `Progression: ${prog}`].filter(Boolean).join(" — ");
  }
}

function renderPlan(){
  const out = document.getElementById("plan-output");
  out.innerHTML = "";
  const types = getMultiSelectValues("types");
  const goals = getMultiSelectValues("goals");

  const sleepEff = numOrNull(document.getElementById("sleep_eff").value);
  const hrvDelta = numOrNull(document.getElementById("hrv_delta").value);
  const sbp = numOrNull(document.getElementById("sbp").value);
  const tir = numOrNull(document.getElementById("cgm_tir").value);

  const gate = gatesAdvice({sleepEff, hrvDelta, sbp, tir});
  const gateBox = document.createElement("div");
  gateBox.className = gate.some(s=>s.includes("avoid")||s.includes("deload")) ? "notice" : "ok";
  gateBox.innerHTML = `<strong>Safety gates:</strong> ${gate.join(" ")} `;
  out.appendChild(gateBox);

  const picks = choosePlanProtocols(types, goals);
  if (!picks.length){
    const no = document.createElement("div");
    no.className = "card"; no.textContent = "No items available for the current filters.";
    out.appendChild(no);
    return;
  }
  picks.forEach(rec => out.appendChild(renderCard(rec, "plan")));
}

function numOrNull(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bindPlan(){
  document.getElementById("generate-plan").addEventListener("click", renderPlan);
  document.getElementById("clear-plan").addEventListener("click", ()=>{
    ["sleep_eff","hrv_delta","sbp","cgm_tir"].forEach(id=> document.getElementById(id).value="");
    ["goals","types"].forEach(id=> Array.from(document.getElementById(id).options).forEach(o=> o.selected=false));
    document.getElementById("plan-output").innerHTML = "";
  });
}

function bindLibrary(){
  document.getElementById("apply-filters").addEventListener("click", ()=>{
    const t = getMultiSelectValues("lib-types");
    const g = getMultiSelectValues("lib-goals");
    const list = filterRowsBy(t, g);
    const out = document.getElementById("library-output");
    out.innerHTML = "";
    if (!list.length){
      const no = document.createElement("div"); no.className="card"; no.textContent="No items match the filters.";
      out.appendChild(no); return;
    }
    list.forEach(rec => out.appendChild(renderCard(rec, "library")));
  });
  document.getElementById("clear-filters").addEventListener("click", ()=>{
    ["lib-types","lib-goals"].forEach(id=> Array.from(document.getElementById(id).options).forEach(o=> o.selected=false));
    document.getElementById("library-output").innerHTML = "";
  });
}

function bindAsk(){
  document.getElementById("ask-send").addEventListener("click", async ()=>{
    const q = (document.getElementById("ask-input").value || "").trim();
    const out = document.getElementById("ask-output");
    out.innerHTML = "";
    if (!q){ out.textContent = "Please enter a question."; return; }
    // We pass an empty record and the question; the server will optionally blend CSV context.
    const msg = await llmCoach("", {}, q);
    const box = document.createElement("div"); box.className="card"; box.innerHTML = `<strong>Coach:</strong> ${msg}`;
    out.appendChild(box);
  });
}

// Boot
(async function(){
  try{
    mountTabs();
    await loadCSV();
    hydrateSelectors();
    bindPlan();
    bindLibrary();
    bindAsk();
  }catch(err){
    console.error("Init error:", err);
    const el = document.querySelector(".container");
    const warn = document.createElement("div");
    warn.className = "notice";
    warn.textContent = "Initialization failed. Check that data/master.csv exists and is valid.";
    el.prepend(warn);
  }
})();
