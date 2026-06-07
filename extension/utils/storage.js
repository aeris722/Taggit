(function () {
  const { TAGGIT_KEYS } = globalThis.TaggitConstants;
  const { LIMITS } = globalThis.TaggitConstants;

  const SCHEMA_VERSION = 2;
  const VALID_STATUSES = new Set(["active", "waiting", "opportunity", "done"]);
  const VALID_PRIORITIES = new Set(["low", "normal", "high"]);

  function cleanString(value, maxLength = 500) {
    return String(value || "").trim().slice(0, maxLength);
  }

  function normalizeDate(value) {
    const cleanValue = cleanString(value, 32);
    if (!cleanValue) return "";

    const match = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return "";

    const [, year, month, day] = match;
    const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return "";
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) return "";
    return `${year}-${month}-${day}`;
  }

  function normalizeStatus(value) {
    const status = cleanString(value, 32).toLowerCase().replace(/[\s-]+/g, "_");
    if (status === "follow_up" || status === "followup") return "active";
    if (status === "closed" || status === "complete" || status === "completed") return "done";
    return VALID_STATUSES.has(status) ? status : "active";
  }

  function normalizePriority(value) {
    const priority = cleanString(value, 24).toLowerCase();
    return VALID_PRIORITIES.has(priority) ? priority : "normal";
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

  function getBestChatHref(input = {}) {
    return getSafeChatHref(input.href) || getSafeChatHref(input.conversationId);
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
      status: normalizeStatus(item.status),
      followUpDate: normalizeDate(item.followUpDate || item.follow_up_date || item.followupDate),
      nextStep: cleanString(item.nextStep || item.next_step, 280),
      priority: normalizePriority(item.priority),
      relationshipType: cleanString(item.relationshipType || item.relationship_type, 80),
      lastContactedAt: Number(item.lastContactedAt || item.last_contacted_at) || null,
      schemaVersion: Number(item.schemaVersion) || SCHEMA_VERSION,
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
    getBestChatHref,
    normalizeDate,
    normalizeTag,
    normalizeTags,
    getState,
    saveContext,
    saveTags,
    upsertTag,
    createTagMap,
  };
})();
