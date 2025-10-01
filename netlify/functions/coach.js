// netlify/functions/coach.js
// Drop-in replacement that supports a "passthrough" mode for Ask the Coach.
// - If body.passthrough === true: send exactly the user's question to the OpenAI API with no extra context.
// - Else: build a concise coaching prompt from provided fields (backward-compatible with prior calls).
// Requires environment variable: OPENAI_API_KEY

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    const body = JSON.parse(event.body || "{}");
    const passthrough = !!body.passthrough;
    const userQ = (body.user_question || "").trim();
    const promptCSV = (body.coach_prompt_api || "").trim();
    const record = body.record || {};
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

    // If no API key, return an explicit fallback (keeps UI functional)
    if (!OPENAI_API_KEY) {
      const offline = passthrough
        ? "AI unavailable (no API key)."
        : [
            record.coach_script_non_api || "",
            record.protocol_start ? `Protocol: ${record.protocol_start}` : "",
            record.progression_rule ? `Progression: ${record.progression_rule}` : ""
          ].filter(Boolean).join(" — ") || "Rules-based guidance unavailable for this item.";
      return { statusCode: 200, body: JSON.stringify({ message: offline }) };
    }

    // Build messages
    let messages;
    if (passthrough) {
      // Try to mirror a fresh chat: only the user's question, temperature 0.
      messages = [{ role: "user", content: userQ }];
    } else {
      const contextLines = [];
      if (promptCSV) contextLines.push(promptCSV);
      if (record.protocol_start) contextLines.push(`Protocol: ${record.protocol_start}`);
      if (record.progression_rule) contextLines.push(`Progression: ${record.progression_rule}`);
      const context = contextLines.join("\n");

      messages = [
        { role: "system", content: "You are a precise exercise coach for older adults. Be concise and safety-first." },
        context && { role: "system", content: context },
        userQ && { role: "user", content: userQ }
      ].filter(Boolean);
    }

    // Call OpenAI Chat Completions
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5",         // use the same family as ChatGPT to minimize divergence
        temperature: 0.0,       // stabilize output
        messages
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { statusCode: resp.status, body: JSON.stringify({ error: "openai_error", detail: errText }) };
    }

    const data = await resp.json();
    const answer = data?.choices?.[0]?.message?.content || "";
    return { statusCode: 200, body: JSON.stringify({ message: answer }) };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "server_error", detail: String(err) }) };
  }
}
