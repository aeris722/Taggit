(function () {
  const { DEFAULT_AI_MODEL } = globalThis.TaggitConstants;

  function normalizeMessages(messages = []) {
    if (!Array.isArray(messages)) return [];

    return messages
      .map((message) => ({
        author: String(message.author || "").trim(),
        text: String(message.text || "").trim(),
        timestamp: message.timestamp || null,
      }))
      .filter((message) => message.text);
  }

  function createPrompt(messages) {
    const transcript = messages
      .map((message) => {
        const author = message.author ? `${message.author}: ` : "";
        return `${author}${message.text}`;
      })
      .join("\n");

    return [
      "You are summarizing a Reddit chat for a compact productivity sidebar.",
      "Do not write an introduction.",
      "Use exactly this format:",
      "",
      "Summary:",
      "- One or two concrete bullets about what the chat is about.",
      "",
      "Important context:",
      "- One or two concrete bullets with names, decisions, requests, or useful details.",
      "",
      "Follow-ups:",
      "- Action items or 'None'.",
      "",
      "Chat transcript:",
      transcript,
    ].join("\n");
  }

  function extractGeminiText(data) {
    return (data?.candidates || [])
      .flatMap((candidate) => candidate?.content?.parts || [])
      .map((part) => part.text || "")
      .join("\n")
      .trim();
  }

  async function summarizeConversation(messages, options = {}) {
    const normalizedMessages = normalizeMessages(messages).slice(-60);
    const apiKey = String(options.apiKey || "").trim();
    const model = String(options.model || DEFAULT_AI_MODEL).trim();

    if (!normalizedMessages.length) {
      return {
        ok: false,
        summary: "",
        reason: "No chat messages available to summarize.",
      };
    }

    if (!apiKey) {
      return {
        ok: false,
        summary: "",
        reason: "Add a Gemini API key first.",
      };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: createPrompt(normalizedMessages) }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 700,
          },
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        summary: "",
        reason: data?.error?.message || "Gemini summary request failed.",
      };
    }

    const summary = extractGeminiText(data);
    return {
      ok: Boolean(summary),
      summary,
      reason: summary ? "" : "Gemini returned an empty summary.",
    };
  }

  globalThis.TaggitAI = {
    normalizeMessages,
    summarizeConversation,
  };
})();
