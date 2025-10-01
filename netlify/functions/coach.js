// netlify/functions/coach.js
// Stabilized: remove 'temperature' for models that only support default; support chat & responses shapes.
// Passthrough mode for "Ask the Coach": body = { passthrough: true, user_question }
// Coaching mode: body = { coach_prompt_api, user_question, record }

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }
    const body = JSON.parse(event.body || "{}");
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
    if (!OPENAI_API_KEY) {
      return { statusCode: 200, body: JSON.stringify({ message: "AI unavailable (no API key set)." }) };
    }

    const passthrough = !!body.passthrough;
    const userQ = (body.user_question || "").trim();
    const promptCSV = (body.coach_prompt_api || "").trim();
    const record = body.record || {};

    // Build messages (chat)
    let messages;
    if (passthrough) {
      messages = [{ role: "user", content: userQ }];
    } else {
      const ctx = [];
      if (promptCSV) ctx.push(promptCSV);
      if (record.protocol_start) ctx.push(`Protocol: ${record.protocol_start}`);
      if (record.progression_rule) ctx.push(`Progression: ${record.progression_rule}`);
      const contextStr = ctx.join("\n");
      messages = [
        { role: "system", content: "You are a precise exercise coach for older adults. Be concise and safety-first." },
        contextStr && { role: "system", content: contextStr },
        userQ && { role: "user", content: userQ }
      ].filter(Boolean);
    }

    // Prefer Chat Completions; remove temperature to satisfy models that enforce default settings
    const cc = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-5", messages })
    });

    if (cc.ok) {
      const data = await cc.json();
      const msg = data?.choices?.[0]?.message?.content || "";
      return { statusCode: 200, body: JSON.stringify({ message: msg }) };
    }

    // Fallback to Responses API if available
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-5", input: userQ || promptCSV })
    });
    if (r.ok) {
      const data = await r.json();
      const out = data?.output_text || "";
      return { statusCode: 200, body: JSON.stringify({ message: out }) };
    }

    const errTxt = await cc.text();
    return { statusCode: cc.status, body: JSON.stringify({ error: "openai_error", detail: errTxt }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "server_error", detail: String(err) }) };
  }
}
