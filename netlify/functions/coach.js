// netlify/functions/coach.js
export async function handler(event) {
  try{
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }
    const body = JSON.parse(event.body || "{}");
    const prompt = (body.coach_prompt_api || "").trim();
    const userQ  = (body.user_question || "").trim();
    const record = body.record || {};

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

    const baseContext = [
      prompt && `Coach prompt (from CSV): ${prompt}`,
      userQ && `User question: ${userQ}`,
      record && Object.keys(record).length ? `Record: ${JSON.stringify(record).slice(0, 1000)}` : ""
    ].filter(Boolean).join("\n\n");

    if (OPENAI_API_KEY){
      try{
        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {role:"system", content:"You are a cautious, older-adult exercise coach focused on brain health. Follow safety gates strictly. Be concise and motivational. Not a medical device."},
              {role:"user", content: baseContext || "Provide brief, brain-health–focused exercise coaching for an older adult."}
            ],
            temperature: 0.2
          })
        });
        if (!resp.ok) throw new Error("OpenAI error");
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || "";
        return { statusCode: 200, body: JSON.stringify({ message: content }) };
      }catch(e){
        // fallthrough
      }
    }

    const proto = record["protocol_start"] || "";
    const prog  = record["progression_rule"] || "";
    const non   = record["coach_script_non_api"] || "";
    const result = [non, proto && `Protocol: ${proto}`, prog && `Progression: ${prog}`]
      .filter(Boolean).join(" — ") || "Rules-based guidance is unavailable for this item.";
    return { statusCode: 200, body: JSON.stringify({ message: result }) };
  }catch(err){
    return { statusCode: 500, body: JSON.stringify({ error: "Server error", detail: String(err) }) };
  }
}
