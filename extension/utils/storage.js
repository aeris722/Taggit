(function () {
  const { TAGGIT_KEYS } = globalThis.TaggitConstants;
  const { LIMITS } = globalThis.TaggitConstants;

  function cleanString(value, maxLength = 500) {
    return String(value || "").trim().slice(0, maxLength);
  }

  function normalizeUrl(value) {
    if (!value) return "";

    try {
      const url = new URL(value);
      const path = url.pathname.replace(/\/$/, "");
      if (path === "/chat") return "";

      url.hash = "";
      url.search = "";
      return url.href.replace(/\/$/, "").toLowerCase();
    } catch {
      return "";
    }
  }

  function getSafeChatHref(value) {
    if (!value) return "";

    try {
      const url = new URL(value);
      const isReddit = url.hostname === "reddit.com" || url.hostname.endsWith(".reddit.com");
      return isReddit && url.pathname.startsWith("/chat") ? url.href : "";
    } catch {
      return "";
    }
  }

  function getConversationId(input = {}) {
    const hrefId = normalizeUrl(input.href);
    if (hrefId) return hrefId;

    const username = (input.username || "").trim().toLowerCase();
    return username ? `username:${username}` : "";
  }

  function normalizeTag(item = {}) {
    if (!item || typeof item !== "object") return null;

    const conversationId = cleanString(item.conversationId, 500) || getConversationId(item);
    const tag = cleanString(item.tag, LIMITS.tagMaxLength);
    if (!conversationId || !tag) return null;

    return {
      id: cleanString(item.id, 500) || conversationId,
      conversationId,
      tag,
      color: cleanString(item.color, 32) || globalThis.TaggitConstants.DEFAULT_TAG_COLOR,
      username: cleanString(item.username, 80) || "Unknown",
      href: getSafeChatHref(cleanString(item.href, 500)),
      description: cleanString(item.description, LIMITS.noteMaxLength),
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Number(item.createdAt) || Date.now(),
    };
  }

  function normalizeTags(value) {
    if (!Array.isArray(value)) return [];

    const byConversation = new Map();
    value.map(normalizeTag).filter(Boolean).forEach((item) => {
      const key = item.conversationId || item.id;
      const existing = byConversation.get(key);
      if (!existing || item.updatedAt >= existing.updatedAt) {
        byConversation.set(key, item);
      }
    });

    return [...byConversation.values()];
  }

  async function getState() {
    const data = await chrome.storage.local.get([
      TAGGIT_KEYS.context,
      TAGGIT_KEYS.tags,
    ]);

    const context = data[TAGGIT_KEYS.context] || null;
    const tags = normalizeTags(data[TAGGIT_KEYS.tags]);

    return { context, tags };
  }

  async function saveContext(context) {
    await chrome.storage.local.set({ [TAGGIT_KEYS.context]: context });
  }

  async function saveTags(tags) {
    await chrome.storage.local.set({ [TAGGIT_KEYS.tags]: normalizeTags(tags) });
  }

  function upsertTag(tags, nextTag) {
    const normalized = normalizeTag(nextTag);
    if (!normalized) return tags;

    const key = normalized.conversationId || normalized.id;
    const index = tags.findIndex((item) => (item.conversationId || item.id) === key);

    if (index >= 0) {
      const existing = tags[index];
      tags[index] = {
        ...existing,
        ...normalized,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      };
      return tags;
    }

    return [...tags, normalized];
  }

  function createTagMap(tags) {
    return new Map(normalizeTags(tags).map((item) => [item.conversationId || item.id, item]));
  }

  globalThis.TaggitStorage = {
    getConversationId,
    getSafeChatHref,
    normalizeTag,
    normalizeTags,
    getState,
    saveContext,
    saveTags,
    upsertTag,
    createTagMap,
  };
})();
