(function () {
  const { TAGGIT_KEYS } = globalThis.TaggitConstants;
  const { LIMITS } = globalThis.TaggitConstants;

  function cleanString(value, maxLength = 500) {
    return String(value || "").trim().slice(0, maxLength);
  }

  function cleanDate(value) {
    const date = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  }

  function parseUrl(value) {
    if (!value) return null;

    try {
      return new URL(value);
    } catch {
      try {
        const base = typeof location !== "undefined" && location?.origin ? location.origin : "https://www.reddit.com";
        return new URL(value, base);
      } catch {
        return null;
      }
    }
  }

  function normalizeUrl(value) {
    const url = parseUrl(value);
    if (!url) return "";

    const path = url.pathname.replace(/\/$/, "");
    if (path === "/chat") return "";

    url.hash = "";
    url.search = "";
    return url.href.replace(/\/$/, "").toLowerCase();
  }

  function getSafeChatHref(value) {
    if (!value) return "";

    const url = parseUrl(value);
    if (!url) return "";

    const isReddit = url.hostname === "reddit.com" || url.hostname.endsWith(".reddit.com");
    return isReddit && url.pathname.startsWith("/chat") ? url.href : "";
  }

  function getBestChatHref(input = {}) {
    return getSafeChatHref(input.href) || getSafeChatHref(input.conversationId);
  }

  function getConversationId(input = {}) {
    const hrefId = normalizeUrl(input.href);
    if (hrefId) return hrefId;

    const username = (input.username || "").trim().toLowerCase();
    return username ? `username:${username}` : "";
  }

  function normalizeStatus(value) {
    const status = cleanString(value, 32);
    return ["new", "follow-up", "waiting", "opportunity", "closed"].includes(status) ? status : "new";
  }

  function normalizeTag(item = {}) {
    if (!item || typeof item !== "object") return null;

    const conversationId = cleanString(item.conversationId, 500) || getConversationId(item);
    const tag = cleanString(item.tag, LIMITS.tagMaxLength);
    if (!conversationId || !tag) return null;

    const id = cleanString(item.id, 500) || conversationId;
    const href = getSafeChatHref(cleanString(item.href, 500));

    return {
      id,
      conversationId,
      tag,
      color: cleanString(item.color, 32) || globalThis.TaggitConstants.DEFAULT_TAG_COLOR,
      username: cleanString(item.username, 80) || "Unknown",
      href,
      description: cleanString(item.description, LIMITS.noteMaxLength),
      status: normalizeStatus(item.status),
      followUpAt: cleanDate(item.followUpAt),
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

  function getItemKey(item = {}) {
    return cleanString(item.conversationId, 500) || cleanString(item.id, 500) || "";
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
        href: normalized.href || existing.href || "",
        username: normalized.username || existing.username || "Unknown",
      };
      return tags;
    }

    return [...tags, normalized];
  }

  function createTagMap(tags) {
    return new Map(
      normalizeTags(tags)
        .filter((item) => item.conversationId || item.id)
        .map((item) => [item.conversationId || item.id, item])
    );
  }

  globalThis.TaggitStorage = {
    getConversationId,
    getSafeChatHref,
    getBestChatHref,
    normalizeTag,
    normalizeTags,
    getState,
    saveContext,
    saveTags,
    upsertTag,
    createTagMap,
  };
})();
