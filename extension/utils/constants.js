(function () {
  const TAGGIT_KEYS = {
    context: "taggitCurrentContext",
    tags: "taggitTaggedConversations",
    aiSettings: "taggitAiSettings",
    summaries: "taggitSummaries",
    aiExamples: "taggitAiExamples",
  };

  const MESSAGE_TYPES = {
    openSidebar: "TAGGIT_OPEN_SIDEBAR",
    openChat: "TAGGIT_OPEN_CHAT",
    collectChatMessages: "TAGGIT_COLLECT_CHAT_MESSAGES",
  };

  const LIMITS = {
    tagMaxLength: 28,
    noteMaxLength: 1600,
  };

  const COLORS = [
    { name: "Coral", value: "#ff6b6b" },
    { name: "Sky", value: "#74b9ff" },
    { name: "Mint", value: "#55efc4" },
    { name: "Lavender", value: "#a29bfe" },
    { name: "Peach", value: "#ffeaa7" },
    { name: "Rose", value: "#fd79a8" },
  ];

  const DEFAULT_TAG_COLOR = COLORS[0].value;
  const DEFAULT_AI_MODEL = "gemini-2.5-flash";

  globalThis.TaggitConstants = {
    TAGGIT_KEYS,
    MESSAGE_TYPES,
    COLORS,
    DEFAULT_TAG_COLOR,
    DEFAULT_AI_MODEL,
    LIMITS,
  };
})();
