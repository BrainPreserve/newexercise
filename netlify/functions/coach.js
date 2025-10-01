// BrainPreserve · Exercise — coach-plus.js (v2025-09-30a)
// Requires: OPENAI_API_KEY in Netlify Environment Variables

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
function cors(status=200, body=''){ return { statusCode: status, headers: CORS, body }; }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204);
  if (event.httpMethod !== 'POST') return cors(405, 'Method Not Allowed');

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return cors(500, 'Missing OPENAI_API_KEY');

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return cors(400, 'Bad JSON'); }

  const mode = String(body.mode || 'ask');
  const question   = (body.question || '').toString().slice(0, 3000);
  const csvContext = Array.isArray(body.csv_context) ? body.csv_context.slice(0, 10) : [];
  const protocol   = body.protocol || null;
  const biomarkers = body.biomarkers || null;

  const system = [
    'You are a physician-informed brain-health exercise coach for older adults.',
    'Be specific, practical, and safety-forward. Use concise bullets and short paragraphs.',
    'Do not diagnose; give prudent training guidance with clear intensity cues and safety notes.'
  ].join(' ');

  const lines = [];
  if (mode === 'plan' && protocol) {
    lines.push(`### Mode: PLAN — AI coaching addendum`);
    lines.push(`Protocol: ${protocol['Exercise Type'] || protocol.exercise_type || 'Unnamed'}`);
    if (protocol.coach_prompt_api) lines.push(`Coach Prompt (from CSV): ${protocol.coach_prompt_api}`);
    lines.push(`Non-API details:`);
    lines.push(`- Start: ${protocol.protocol_start || '—'}`);
    lines.push(`- Progression: ${protocol.progression_rule || '—'}`);
    lines.push(`- Contraindications: ${protocol.contraindications_flags || '—'}`);
    if (biomarkers) lines.push(`Biomarkers: ${JSON.stringify(biomarkers)}`);
  } else if (mode === 'library' && protocol) {
    lines.push(`### Mode: LIBRARY — AI coaching addendum`);
    lines.push(`Protocol: ${protocol['Exercise Type'] || protocol.exercise_type || 'Unnamed'}`);
    if (protocol.coach_prompt_api) lines.push(`Coach Prompt (from CSV): ${protocol.coach_prompt_api}`);
    lines.push(`Non-API details:`);
    lines.push(`- Start: ${protocol.protocol_start || '—'}`);
    lines.push(`- Progression: ${protocol.progression_rule || '—'}`);
    lines.push(`- Contraindications: ${protocol.contraindications_flags || '—'}`);
  } else {
    lines.push(`### Mode: ASK — general Q&A`);
    if (question) lines.push(`Question: ${question}`);
    if (csvContext.length) {
      lines.push(`Representative protocols from CSV:`);
      for (const r of csvContext) {
        lines.push(`- ${r.exercise_type}: start=${r.protocol_start}; progression=${r.progression_rule}; contraindications=${r.contraindications_flags}`);
      }
    }
  }

  const prompt = lines.join('\n');

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{
      'Authorization':`Bearer ${openaiKey}`,
      'Content-Type':'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        { role:'system', content: system },
        { role:'user', content: prompt }
      ]
    })
  });
  if(!resp.ok){
    const t=await resp.text().catch(()=> '');
    return cors(502, `OpenAI error: ${t || resp.statusText}`);
  }
  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content?.trim() || 'No content.';
  const html = `<div class="kv"><strong>Brain Health AI Coaching</strong></div><div>${text.replace(/\n/g,'<br/>')}</div>`;
  return cors(200, JSON.stringify({ html }));
};
