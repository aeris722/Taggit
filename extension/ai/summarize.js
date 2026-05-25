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
      .filter((message) => message.text.length >= 2)
      .filter((message) => !/^[\W_]+$/u.test(message.text));
  }

  function normalizeConversation(input = {}) {
    const conversation = Array.isArray(input)
      ? { roomId: "", participants: [], messages: input }
      : input || {};
    const messages = normalizeMessages(conversation.messages).slice(-80);
    const participants = Array.isArray(conversation.participants)
      ? conversation.participants.map((name) => String(name || "").trim()).filter(Boolean)
      : [];

    return {
      roomId: String(conversation.roomId || "").trim(),
      participants: [...new Set(participants)],
      messages,
    };
  }

  function normalizeExamples(examples = []) {
    if (!Array.isArray(examples)) return [];

    return examples
      .map((example) => ({
        input: String(example.input || "").trim().slice(0, 900),
        output: String(example.output || "").trim().slice(0, 320),
      }))
      .filter((example) => example.input && example.output)
      .slice(-5);
  }

  function createExamplesBlock(examples) {
    const normalizedExamples = normalizeExamples(examples);
    if (!normalizedExamples.length) return "";

    return [
      "Learn from these preferred note examples:",
      ...normalizedExamples.map((example, index) =>
        [
          `Example ${index + 1} transcript:`,
          example.input,
          `Example ${index + 1} ideal note:`,
          example.output,
        ].join("\n")
      ),
      "",
    ].join("\n");
  }

  function createPrompt(conversation, examples = []) {
    const participants = conversation.participants.length
      ? conversation.participants.join(", ")
      : "Unknown";
    const transcript = conversation.messages
      .map((message, index) => {
        const author = message.author ? `${message.author}: ` : "";
        return `${index + 1}. ${author}${message.text}`;
      })
      .join("\n");

    return [
      "You are Taggit's Reddit chat summarizer.",
      "Write a useful private note for the user to save on this Reddit conversation.",
      "Summarize only the supplied conversation transcript and ground it in the actual messages.",
      "Ignore UI text, buttons, timestamps, navigation labels, and repeated noise if present.",
      "Do not write an introduction or markdown heading.",
      `Participants: ${participants}`,
      `Conversation ID: ${conversation.roomId || "unknown"}`,
      "The note must mention the other person's username/name when available.",
      "The note must say what the user asked or discussed, and what the other person advised/replied.",
      "Be specific. Avoid generic phrases like 'gave advice' unless you also say what the advice was.",
      "Write in first-person-friendly CRM note style, for example:",
      "Note: Ok-Skin39 discussed academic/JEE prep with me and suggested analyzing my texts, identifying weak areas, and improving study strategy.",
      "Output exactly two sections:",
      "",
      "Note: write at least 100 words. Include username/name, what the user asked or discussed, what the other person replied/advised, useful context, tone, and any follow-up reminders.",
      "Tags: 3-5 lowercase tags separated by commas.",
      "",
      createExamplesBlock(examples),
      "Now write the note for this current chat.",
      "Chat transcript:",
      transcript,
    ].filter(Boolean).join("\n");
  }

  function extractGeminiText(data) {
    return (data?.candidates || [])
      .flatMap((candidate) => candidate?.content?.parts || [])
      .map((part) => part.text || "")
      .join("\n")
      .trim();
  }

  async function summarizeConversation(messages, options = {}) {
    const conversation = normalizeConversation(messages);
    const apiKey = String(options.apiKey || "").trim();
    const model = String(options.model || DEFAULT_AI_MODEL).trim();
    const examples = normalizeExamples(options.examples);

    if (conversation.messages.length < 2) {
      return {
        ok: false,
        summary: "",
        tags: [],
        reason: "Not enough chat messages available to summarize.",
      };
    }

    if (!apiKey) {
      return {
        ok: false,
        summary: "",
        tags: [],
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
              parts: [{ text: createPrompt(conversation, examples) }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200,
          },
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        summary: "",
        tags: [],
        reason: data?.error?.message || "Gemini summary request failed.",
      };
    }

    const summary = extractGeminiText(data);
    const tagLine = summary.match(/Tags:\s*([\s\S]*)$/i)?.[1] || "";
    const tags = tagLine
      .split(/,|\n|-/)
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag && tag.length <= 32)
      .slice(0, 6);
    const note = (summary.match(/Note:\s*([\s\S]*?)(?:\n\s*Tags:|$)/i)?.[1] || summary)
      .replace(/Tags:\s*[\s\S]*$/i, "")
      .trim();

    return {
      ok: Boolean(summary),
      summary,
      note,
      tags,
      reason: summary ? "" : "Gemini returned an empty summary.",
    };
  }

  globalThis.TaggitAI = {
    normalizeMessages,
    normalizeConversation,
    normalizeExamples,
    summarizeConversation,
  };
})();
