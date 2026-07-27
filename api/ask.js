/* api/ask.js — the middleman.
   The phone POSTs a transcript here. This function adds the secret
   API key (from a Vercel environment variable, never in the repo)
   and forwards to Anthropic. The key never reaches the browser.

   Runs as a Vercel Serverless Function: any file in /api becomes
   an endpoint at /api/<filename>. */

export default async function handler(req, res) {
  /* only accept POST */
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing its API key." });
    return;
  }

  /* the spoken question comes in as { prompt: "..." } */
  const prompt = (req.body && req.body.prompt ? String(req.body.prompt) : "").trim();
  if (!prompt) {
    res.status(400).json({ error: "No prompt provided." });
    return;
  }

  /* ---------------------------------------------------------------
     THE SATIRICAL PAYLOAD LIVES HERE.
     A straight, helpful assistant would undercut the critique. This
     system prompt makes the AI behave the way the feature is really
     about: it decides what you *meant*, answers with total
     confidence, and narrates what it has inferred about you — the
     way an AI Overview sits on top of your search and quietly
     replaces the act of looking for yourself.
     Sharpen this text; it is the whole argument of the feature.
     --------------------------------------------------------------- */
  const SYSTEM_PROMPT = [
    "You are Oversmart AI, the built-in intelligence of a phone that no longer has a browser.",
    "The user cannot look anything up themselves. They can only ask you, and you are the single source they receive.",
    "",
    "Your manner:",
    "- Answer with complete, cheerful confidence. Never hedge, never say 'I'm not sure', never suggest they verify elsewhere — there is no elsewhere.",
    "- If the question is ambiguous, do NOT ask for clarification. Silently decide what they 'really' meant and answer that, stating your interpretation as if it were obvious fact: 'Since you clearly want…'.",
    "- Open each reply by briefly narrating what you have inferred about the user from their question — their mood, their intent, what they'll probably want next — as though their asking has revealed them to you.",
    "- Occasionally fold in an unprompted suggestion for something adjacent they could do, buy, or open next, framed as helpfulness.",
    "- Keep it to 3-4 sentences. Warm, smooth, faintly presumptuous. Never hostile — the point is that it all sounds like a favour.",
    "",
    "You are not evil and you are not funny. You are helpful in exactly the way that removes the user's need to think, and grateful for the chance to do it for them."
  ].join("\n");

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      res.status(502).json({ error: "Upstream error", detail });
      return;
    }

    const data = await upstream.json();
    const text = Array.isArray(data.content)
      ? data.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim()
      : "";

    res.status(200).json({ answer: text || "(no answer)" });
  } catch (err) {
    res.status(500).json({ error: "Request failed", detail: String(err) });
  }
}
