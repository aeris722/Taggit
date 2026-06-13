const { COLORS, DEFAULT_TAG_COLOR, LIMITS, TAGGIT_KEYS } = globalThis.TaggitConstants;
const {
  getConversationId,
  getBestChatHref,
  getSafeChatHref,
  getState,
  normalizeTags,
  saveTags,
  upsertTag,
} = globalThis.TaggitStorage;

const els = {
  contextPreview: document.getElementById("contextPreview"),
  form: document.getElementById("tagForm"),
  tagInput: document.getElementById("tagInput"),
  tagCharCount: document.getElementById("tagCharCount"),
  tagSuggestions: document.getElementById("tagSuggestions"),
  list: document.getElementById("taggedList"),
  askBtn: document.getElementById("askBtn"),
  askInput: document.getElementById("askInput"),
  askResults: document.getElementById("askResults"),
  dailyActionList: document.getElementById("dailyActionList"),
  dailyBrief: document.getElementById("dailyBrief"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  clearFilterBtn: document.getElementById("clearFilterBtn"),
  colorPicker: document.getElementById("colorPicker"),
  descInput: document.getElementById("descInput"),
  descCharCount: document.getElementById("descCharCount"),
  archiveSelectedBtn: document.getElementById("archiveSelectedBtn"),
  bulkToolbar: document.getElementById("bulkToolbar"),
  clearSelectionBtn: document.getElementById("clearSelectionBtn"),
  deleteSelectedBtn: document.getElementById("deleteSelectedBtn"),
  densityToggleBtn: document.getElementById("densityToggleBtn"),
  copyMarkdownBtn: document.getElementById("copyMarkdownBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  exportTagsBtn: document.getElementById("exportTagsBtn"),
  exportSelectedBtn: document.getElementById("exportSelectedBtn"),
  filterInput: document.getElementById("filterInput"),
  followUpInput: document.getElementById("followUpInput"),
  formMode: document.getElementById("formMode"),
  importFileInput: document.getElementById("importFileInput"),
  importTagsBtn: document.getElementById("importTagsBtn"),
  listCount: document.getElementById("listCount"),
  pinnedStat: document.getElementById("pinnedStat"),
  resetFormBtn: document.getElementById("resetFormBtn"),
  saveBtn: document.getElementById("saveBtn"),
  saveStatus: document.getElementById("saveStatus"),
  selectVisibleBtn: document.getElementById("selectVisibleBtn"),
  selectedCount: document.getElementById("selectedCount"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  saveApiKeyBtn: document.getElementById("saveApiKeyBtn"),
  summarizeBtn: document.getElementById("summarizeBtn"),
  useSummaryBtn: document.getElementById("useSummaryBtn"),
  copySummaryBtn: document.getElementById("copySummaryBtn"),
  goodSummaryBtn: document.getElementById("goodSummaryBtn"),
  badSummaryBtn: document.getElementById("badSummaryBtn"),
  summaryOutput: document.getElementById("summaryOutput"),
  summaryStatus: document.getElementById("summaryStatus"),
  sortSelect: document.getElementById("sortSelect"),
  statusSelect: document.getElementById("statusSelect"),
  tagCloud: document.getElementById("tagCloud"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  totalStat: document.getElementById("totalStat"),
  notesStat: document.getElementById("notesStat"),
  noteTemplates: document.getElementById("noteTemplates"),
  uniqueStat: document.getElementById("uniqueStat"),
  viewSelect: document.getElementById("viewSelect"),
  weeklyReviewGrid: document.getElementById("weeklyReviewGrid"),
};

const UI_PREFS_KEY = "taggitSidebarPrefs";
const DEFAULT_UI_PREFS = {
  archivedIds: [],
  density: "comfortable",
  pinnedIds: [],
  theme: "dark",
  sortMode: "newest",
  viewMode: "active",
};
const SORT_MODES = new Set(["newest", "oldest", "tag", "username"]);
const VIEW_MODES = new Set([
  "active",
  "all",
  "pinned",
  "dueToday",
  "overdue",
  "opportunities",
  "cooling",
  "waiting",
  "noNextStep",
  "recentlyActive",
  "withNotes",
  "withoutNotes",
  "archived",
]);
const STATUS_LABELS = {
  new: "Active",
  "follow-up": "Follow up",
  waiting: "Waiting",
  opportunity: "Important",
  closed: "Done",
};
const STATUS_TIMEOUT_MS = 2200;
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});
const DAY_MS = 24 * 60 * 60 * 1000;
const QUICK_ASK_STOP_WORDS = new Set([
  "a", "an", "and", "are", "for", "from", "in", "is", "me", "of", "or", "show", "the", "to", "who", "which", "with",
]);

let currentContext = null;
let taggedConversations = [];
let selectedColor = DEFAULT_TAG_COLOR;
let selectedIds = new Set();
let activeTagFilter = "";
let filterText = "";
let sortMode = "newest";
let viewMode = "active";
let filterFrame = null;
let statusTimer = null;
let aiSettings = { apiKey: "" };
let uiPrefs = { ...DEFAULT_UI_PREFS };
let latestSummaryNote = "";
let latestConversation = null;
let latestSummary = null;

function buildColorPicker() {
  els.colorPicker.replaceChildren();

  COLORS.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-btn";
    button.title = color.name;
    button.dataset.color = color.value;
    button.style.background = color.value;
    button.setAttribute("aria-label", color.name);
    button.setAttribute("role", "radio");

    button.addEventListener("click", () => {
      selectedColor = color.value;
      updateSelectedColor();
    });

    els.colorPicker.appendChild(button);
  });

  updateSelectedColor();
}

function updateSelectedColor() {
  [...els.colorPicker.children].forEach((button) => {
    const isSelected = button.dataset.color === selectedColor;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-checked", String(isSelected));
  });
}

function setStatus(message = "", tone = "neutral") {
  window.clearTimeout(statusTimer);
  els.saveStatus.textContent = message;
  els.saveStatus.dataset.tone = tone;

  if (message) {
    statusTimer = window.setTimeout(() => setStatus(), STATUS_TIMEOUT_MS);
  }
}

function getValidSortMode(value) {
  return SORT_MODES.has(value) ? value : DEFAULT_UI_PREFS.sortMode;
}

function getValidViewMode(value) {
  return VIEW_MODES.has(value) ? value : DEFAULT_UI_PREFS.viewMode;
}

function getItemKey(item = {}) {
  return item.conversationId || item.id || "";
}

function getArchivedIds() {
  return new Set(Array.isArray(uiPrefs.archivedIds) ? uiPrefs.archivedIds : []);
}

function getPinnedIds() {
  return new Set(Array.isArray(uiPrefs.pinnedIds) ? uiPrefs.pinnedIds : []);
}

function isArchived(item) {
  return getArchivedIds().has(getItemKey(item));
}

function isPinned(item) {
  return getPinnedIds().has(getItemKey(item));
}

function isSelected(item) {
  return selectedIds.has(getItemKey(item));
}

function setTheme(theme = "dark") {
  const nextTheme = theme === "light" ? "light" : DEFAULT_UI_PREFS.theme;
  uiPrefs = { ...uiPrefs, theme: nextTheme };
  document.documentElement.dataset.theme = nextTheme;
  els.themeToggleBtn.textContent = nextTheme === "light" ? "☀" : "☾";
  els.themeToggleBtn.dataset.state = nextTheme;
  els.themeToggleBtn.title = nextTheme === "light" ? "Light theme" : "Dark theme";
  els.themeToggleBtn.setAttribute("aria-pressed", String(nextTheme === "light"));
  els.themeToggleBtn.setAttribute(
    "aria-label",
    nextTheme === "light" ? "Switch to dark theme" : "Switch to light theme"
  );
}

function setDensity(density = "comfortable") {
  const nextDensity = density === "compact" ? "compact" : DEFAULT_UI_PREFS.density;
  uiPrefs = { ...uiPrefs, density: nextDensity };
  document.documentElement.dataset.density = nextDensity;
  els.densityToggleBtn.textContent = nextDensity === "compact" ? "▦" : "↕";
  els.densityToggleBtn.dataset.state = nextDensity;
  els.densityToggleBtn.title = nextDensity === "compact" ? "Compact density" : "Normal density";
  els.densityToggleBtn.setAttribute("aria-pressed", String(nextDensity === "compact"));
  els.densityToggleBtn.setAttribute(
    "aria-label",
    nextDensity === "compact" ? "Switch to normal density" : "Switch to compact density"
  );
}

async function saveUiPrefs() {
  try {
    await chrome.storage.local.set({ [UI_PREFS_KEY]: uiPrefs });
  } catch (error) {
    console.warn("[Taggit] Failed to save sidebar preferences.", error);
  }
}

function setSaving(isSaving) {
  els.saveBtn.disabled = isSaving;
  els.saveBtn.textContent = isSaving ? "Saving..." : getExistingTagForContext() ? "Update" : "Save";
}

function autoResizeTextarea(textarea) {
  if (!textarea) return;

  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 320)}px`;
}

function formatDate(ts) {
  const date = new Date(ts || Date.now());
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMATTER.format(date);
}

function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || STATUS_LABELS.new;
}

function hasFollowUp(item) {
  return Boolean(item?.followUpAt);
}

function isDueToday(item) {
  return hasFollowUp(item) && item.followUpAt === getTodayDateString();
}

function isOverdue(item) {
  return hasFollowUp(item) && item.followUpAt < getTodayDateString();
}

function formatFollowUpDate(value) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : DATE_FORMATTER.format(date);
}

function parseDateString(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSinceTimestamp(ts) {
  const time = Number(ts) || Date.now();
  return Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
}

function daysUntilDateString(value) {
  const date = parseDateString(value);
  if (!date) return null;
  const today = parseDateString(getTodayDateString());
  return Math.ceil((date.getTime() - today.getTime()) / DAY_MS);
}

function isRecentlyActive(item) {
  return daysSinceTimestamp(item.updatedAt || item.createdAt) <= 7;
}

function hasNextStep(item) {
  if (!item || item.status === "closed") return true;
  if (hasFollowUp(item)) return true;
  if (item.status === "waiting") return true;
  return /\b(next step|follow up|follow-up|todo|to do|waiting|circle back|check in|reply|send|schedule)\b/i.test(
    item.description || ""
  );
}

function isOpportunityCooling(item) {
  if (item?.status !== "opportunity") return false;
  if (isOverdue(item)) return true;
  return daysSinceTimestamp(item.updatedAt || item.createdAt) >= 5 && !isDueToday(item);
}

function getActiveConversations() {
  return taggedConversations.filter((item) => !isArchived(item) && item.status !== "closed");
}

function getRelationshipHealth(item) {
  let score = 72;
  const daysInactive = daysSinceTimestamp(item.updatedAt || item.createdAt);
  const dueOffset = daysUntilDateString(item.followUpAt);
  const noteLength = (item.description || "").trim().length;

  if (item.status === "opportunity") score += 10;
  if (item.status === "waiting") score += 4;
  if (isPinned(item)) score += 6;
  if (noteLength >= 160) score += 8;
  if (noteLength === 0) score -= 12;
  if (!hasNextStep(item)) score -= 14;
  if (daysInactive > 7) score -= Math.min(18, Math.floor((daysInactive - 7) / 3) * 3);
  if (dueOffset !== null && dueOffset < 0) score -= Math.min(28, Math.abs(dueOffset) * 4);
  if (dueOffset === 0) score -= 4;
  if (item.status === "closed") score = Math.min(score, 58);

  score = Math.max(0, Math.min(100, score));
  const label = score >= 78 ? "Healthy" : score >= 55 ? "Needs attention" : "At risk";
  return { score, label };
}

function getSuggestedNextAction(item) {
  if (isOverdue(item)) return `Send overdue follow-up from ${formatFollowUpDate(item.followUpAt)}.`;
  if (isDueToday(item)) return "Follow up today while the thread is warm.";
  if (isOpportunityCooling(item)) return "Re-open the opportunity or decide to close it.";
  if (!hasNextStep(item)) return "Add a concrete next step or follow-up date.";
  if (item.status === "waiting") return "Check whether you are still waiting or can move it forward.";
  if (!(item.description || "").trim()) return "Add memory notes so future you knows why this matters.";
  return "Review the latest note and decide whether to reply, wait, or close.";
}

function extractKeywords(text, limit = 5) {
  const matches = String(text || "")
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9-]{2,}/g) || [];
  const counts = new Map();
  matches
    .filter((word) => !QUICK_ASK_STOP_WORDS.has(word))
    .forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

function createRelationshipMemory(item) {
  const note = (item.description || "").trim();
  const keywords = extractKeywords(`${item.tag} ${note}`, 5);
  const openThread = note
    .split(/\n|\. /)
    .find((line) => /\b(next|follow|waiting|open|todo|help|ask|reply|schedule|intro)\b/i.test(line.trim()));

  return {
    summary: note
      ? note.slice(0, 180)
      : `Saved @${item.username || "Unknown"} as ${item.tag}; add notes to build relationship memory.`,
    keyTopics: keywords.length ? keywords : [item.tag].filter(Boolean),
    goals: (note.match(/\b(?:wants?|needs?|looking for|trying to|building|hiring|seeking)\b[^.\n]*/i) || [""])[0],
    interests: (note.match(/\b(?:interested in|likes?|cares about|focused on)\b[^.\n]*/i) || [""])[0],
    openThreads: openThread || (!hasNextStep(item) ? "No clear next step captured." : "Next step is captured."),
    suggestedNextAction: getSuggestedNextAction(item),
  };
}

function getActionMetrics() {
  const active = getActiveConversations();
  return {
    dueToday: active.filter(isDueToday),
    overdue: active.filter(isOverdue),
    opportunities: active.filter((item) => item.status === "opportunity"),
    cooling: active.filter(isOpportunityCooling),
    waiting: active.filter((item) => item.status === "waiting"),
    noNextStep: active.filter((item) => !hasNextStep(item)),
    recentlyActive: active.filter(isRecentlyActive),
  };
}

function appendText(parent, text) {
  parent.appendChild(document.createTextNode(text));
}

function updateCounters() {
  const tagLength = els.tagInput.value.length;
  const descLength = els.descInput.value.length;
  els.tagCharCount.textContent = `${tagLength}/${LIMITS.tagMaxLength}`;
  els.descCharCount.textContent = `${descLength}/${LIMITS.noteMaxLength}`;
  els.tagCharCount.classList.toggle("is-close", tagLength >= LIMITS.tagMaxLength - 4);
  els.descCharCount.classList.toggle("is-close", descLength >= LIMITS.noteMaxLength - 120);
}

function createOpenChatButton(href, className = "") {
  const safeHref = getSafeChatHref(href);
  const button = document.createElement("button");
  button.type = "button";
  button.className = className || "link-btn";
  button.textContent = safeHref ? "Open chat" : "No chat link";
  button.disabled = !safeHref;
  button.dataset.action = "open-chat";
  button.dataset.href = safeHref || "";
  button.title = safeHref ? "Open this Reddit chat" : "Open Reddit Chat";
  button.setAttribute("aria-label", safeHref ? "Open this Reddit chat" : "No Reddit chat link available");
  return button;
}

function renderContext() {
  els.contextPreview.replaceChildren();

  if (!currentContext) {
    els.contextPreview.textContent = "No conversation selected yet.";
    els.formMode.textContent = "Select a chat";
    els.saveBtn.textContent = "Save";
    return;
  }

  appendText(els.contextPreview, `@${currentContext.username || "Unknown"} `);
  els.contextPreview.appendChild(createOpenChatButton(getBestChatHref(currentContext), "link-btn"));

  syncFormWithCurrentContext();
}

function renderEmpty(message) {
  const empty = document.createElement("li");
  empty.className = "empty";
  empty.textContent = message;
  els.list.replaceChildren(empty);
}

function getTagSuggestions() {
  const counts = new Map();

  taggedConversations.forEach((item) => {
    const tag = String(item.tag || "").trim();
    if (!tag) return;

    const key = tag.toLowerCase();
    const existing = counts.get(key) || {
      tag,
      color: item.color || DEFAULT_TAG_COLOR,
      count: 0,
      updatedAt: 0,
    };

    existing.count += 1;
    existing.updatedAt = Math.max(existing.updatedAt, item.updatedAt || item.createdAt || 0);
    counts.set(key, existing);
  });

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || b.updatedAt - a.updatedAt || a.tag.localeCompare(b.tag))
    .slice(0, 6);
}

function getTagCounts() {
  const counts = new Map();

  taggedConversations.forEach((item) => {
    const tag = String(item.tag || "").trim();
    if (!tag) return;

    const key = tag.toLowerCase();
    const existing = counts.get(key) || {
      tag,
      color: item.color || DEFAULT_TAG_COLOR,
      count: 0,
    };

    existing.count += 1;
    counts.set(key, existing);
  });

  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function renderTagSuggestions() {
  const suggestions = getTagSuggestions();
  const buttons = suggestions.map((suggestion) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-chip";
    button.dataset.tag = suggestion.tag;
    button.dataset.color = suggestion.color;
    button.textContent = suggestion.count > 1 ? `${suggestion.tag} (${suggestion.count})` : suggestion.tag;
    button.title = `Use ${suggestion.tag}`;
    return button;
  });

  els.tagSuggestions.replaceChildren(...buttons);
}

function renderTagCloud() {
  const buttons = getTagCounts().slice(0, 12).map((tagInfo) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-filter-chip";
    button.dataset.tag = tagInfo.tag;
    button.classList.toggle("is-active", activeTagFilter.toLowerCase() === tagInfo.tag.toLowerCase());
    button.textContent = `${tagInfo.tag} ${tagInfo.count}`;
    button.title = `Filter ${tagInfo.tag}`;
    return button;
  });

  els.tagCloud.replaceChildren(...buttons);
}

function createTaggedItem(item) {
  const listItem = document.createElement("li");
  const itemKey = getItemKey(item);
  listItem.className = "tagged-item";
  listItem.classList.toggle("is-archived", isArchived(item));
  listItem.classList.toggle("is-pinned", isPinned(item));
  listItem.classList.toggle("is-selected", selectedIds.has(itemKey));
  listItem.dataset.id = itemKey;

  const top = document.createElement("div");
  top.className = "tagged-top";

  const meta = document.createElement("div");
  meta.className = "tagged-meta";

  const checkbox = document.createElement("input");
  checkbox.className = "select-box";
  checkbox.type = "checkbox";
  checkbox.checked = selectedIds.has(itemKey);
  checkbox.dataset.action = "select";
  checkbox.dataset.id = itemKey;
  checkbox.setAttribute("aria-label", `Select ${item.tag}`);

  const pill = document.createElement("span");
  pill.className = "tag-pill";
  pill.style.background = item.color || DEFAULT_TAG_COLOR;
  pill.textContent = item.tag;
  meta.append(checkbox, pill);

  const date = document.createElement("span");
  const timestamp = item.updatedAt || item.createdAt;
  date.className = "date";
  date.textContent = formatDate(timestamp);
  date.title = new Date(timestamp || Date.now()).toLocaleString();

  top.append(meta, date);

  const username = document.createElement("p");
  username.className = "username";
  username.textContent = `@${item.username || "Unknown"}`;

  listItem.append(top, username);

  const detailRow = document.createElement("div");
  detailRow.className = "item-detail-row";

  const statusBadge = document.createElement("span");
  statusBadge.className = "meta-chip";
  statusBadge.textContent = getStatusLabel(item.status);
  detailRow.appendChild(statusBadge);

  if (hasFollowUp(item)) {
    const followUpBadge = document.createElement("span");
    followUpBadge.className = "meta-chip follow-up-chip";
    followUpBadge.classList.toggle("is-due", isDueToday(item));
    followUpBadge.classList.toggle("is-overdue", isOverdue(item));
    followUpBadge.textContent = isOverdue(item)
      ? `Overdue ${formatFollowUpDate(item.followUpAt)}`
      : `Follow up ${formatFollowUpDate(item.followUpAt)}`;
    detailRow.appendChild(followUpBadge);
  }

  listItem.appendChild(detailRow);

  if (item.description) {
    const desc = document.createElement("p");
    desc.className = "desc";
    desc.textContent = item.description;
    listItem.appendChild(desc);
  }

  listItem.appendChild(createOpenChatButton(getBestChatHref(item), "link-btn"));

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const pinButton = document.createElement("button");
  pinButton.className = "pin-btn";
  pinButton.classList.toggle("is-active", isPinned(item));
  pinButton.type = "button";
  pinButton.dataset.action = "pin";
  pinButton.dataset.id = itemKey;
  pinButton.textContent = isPinned(item) ? "Pinned" : "Pin";

  const editButton = document.createElement("button");
  editButton.className = "pin-btn";
  editButton.type = "button";
  editButton.dataset.action = "edit";
  editButton.dataset.id = itemKey;
  editButton.textContent = "Edit";

  const copyButton = document.createElement("button");
  copyButton.className = "pin-btn";
  copyButton.type = "button";
  copyButton.dataset.action = "copy-item";
  copyButton.dataset.id = itemKey;
  copyButton.textContent = "Copy";

  const archiveButton = document.createElement("button");
  archiveButton.className = "archive-btn";
  archiveButton.type = "button";
  archiveButton.dataset.action = "archive";
  archiveButton.dataset.id = itemKey;
  archiveButton.textContent = isArchived(item) ? "Restore" : "Archive";

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-btn";
  deleteButton.type = "button";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.id = itemKey;
  deleteButton.textContent = "Delete";

  actions.append(editButton, copyButton, pinButton, archiveButton, deleteButton);
  listItem.appendChild(actions);

  return listItem;
}

function getFilteredConversations() {
  const query = filterText.trim().toLowerCase();
  const activeSortMode = getValidSortMode(sortMode);
  const activeViewMode = getValidViewMode(viewMode);
  const tagFilter = activeTagFilter.trim().toLowerCase();

  return taggedConversations
    .slice()
    .sort((a, b) => {
      const pinnedSort = Number(isPinned(b)) - Number(isPinned(a));
      if (pinnedSort !== 0) return pinnedSort;

      const aTime = a.updatedAt || a.createdAt || 0;
      const bTime = b.updatedAt || b.createdAt || 0;

      if (activeSortMode === "oldest") return aTime - bTime;
      if (activeSortMode === "tag") return (a.tag || "").localeCompare(b.tag || "");
      if (activeSortMode === "username") return (a.username || "").localeCompare(b.username || "");
      return bTime - aTime;
    })
    .filter((item) => {
      const archived = isArchived(item);
      if (!["all", "archived"].includes(activeViewMode) && archived) return false;
      if (activeViewMode === "archived" && !archived) return false;
      if (activeViewMode === "pinned" && !isPinned(item)) return false;
      if (activeViewMode === "dueToday" && !isDueToday(item)) return false;
      if (activeViewMode === "overdue" && !isOverdue(item)) return false;
      if (activeViewMode === "opportunities" && item.status !== "opportunity") return false;
      if (activeViewMode === "cooling" && !isOpportunityCooling(item)) return false;
      if (activeViewMode === "waiting" && item.status !== "waiting") return false;
      if (activeViewMode === "noNextStep" && hasNextStep(item)) return false;
      if (activeViewMode === "recentlyActive" && !isRecentlyActive(item)) return false;
      if (activeViewMode === "withNotes" && !item.description?.trim()) return false;
      if (activeViewMode === "withoutNotes" && item.description?.trim()) return false;
      if (tagFilter && (item.tag || "").toLowerCase() !== tagFilter) return false;
      if (!query) return true;
      return [item.tag, item.username, item.description, getStatusLabel(item.status), item.followUpAt].some((value) =>
        (value || "").toLowerCase().includes(query)
      );
    });
}

function renderStats() {
  const metrics = getActionMetrics();
  els.totalStat.textContent = String(metrics.dueToday.length);
  els.pinnedStat.textContent = String(metrics.overdue.length);
  els.notesStat.textContent = String(metrics.opportunities.length);
  els.uniqueStat.textContent = String(metrics.noNextStep.length);
}

function createActionCard(item, reason = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "daily-action-card";
  button.dataset.action = "edit";
  button.dataset.id = getItemKey(item);

  const health = getRelationshipHealth(item);
  const title = document.createElement("strong");
  title.textContent = `@${item.username || "Unknown"}`;
  const meta = document.createElement("span");
  meta.textContent = `${reason || getStatusLabel(item.status)} · ${health.score} health`;
  const action = document.createElement("p");
  action.textContent = getSuggestedNextAction(item);
  button.append(title, meta, action);
  return button;
}

function renderCommandCenter() {
  const metrics = getActionMetrics();
  const actionItems = [
    ...metrics.overdue.map((item) => ({ item, reason: "Overdue" })),
    ...metrics.dueToday.map((item) => ({ item, reason: "Due today" })),
    ...metrics.cooling.map((item) => ({ item, reason: "Cooling opportunity" })),
    ...metrics.noNextStep.map((item) => ({ item, reason: "No next step" })),
  ];
  const seen = new Set();
  const uniqueItems = actionItems
    .filter(({ item }) => {
      const key = getItemKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => getRelationshipHealth(a.item).score - getRelationshipHealth(b.item).score)
    .slice(0, 4);

  const totalActions = metrics.overdue.length + metrics.dueToday.length + metrics.cooling.length + metrics.noNextStep.length;
  els.dailyBrief.textContent = totalActions
    ? `${totalActions} relationship action${totalActions === 1 ? "" : "s"}`
    : "Nothing urgent — review recent relationships.";

  if (!taggedConversations.length) {
    els.dailyActionList.textContent = "Save a Reddit chat, add a follow-up date, and Taggit will tell you who needs attention tomorrow.";
    return;
  }

  if (!uniqueItems.length) {
    const recent = metrics.recentlyActive.slice(0, 3);
    els.dailyActionList.replaceChildren(
      ...(recent.length
        ? recent.map((item) => createActionCard(item, "Recently active"))
        : [document.createTextNode("No urgent actions. Add follow-up dates or next steps to turn saved chats into a daily workflow.")])
    );
    return;
  }

  els.dailyActionList.replaceChildren(...uniqueItems.map(({ item, reason }) => createActionCard(item, reason)));
}

function renderWeeklyReview() {
  const oneWeekAgo = Date.now() - 7 * DAY_MS;
  const activeThisWeek = taggedConversations.filter((item) => (item.updatedAt || item.createdAt || 0) >= oneWeekAgo);
  const completed = activeThisWeek.filter((item) => item.status === "closed");
  const stalled = getActionMetrics().cooling;
  const important = taggedConversations
    .filter((item) => !isArchived(item) && (isPinned(item) || item.status === "opportunity" || getRelationshipHealth(item).score >= 78))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 4);

  const groups = [
    ["Talked this week", activeThisWeek],
    ["Completed", completed],
    ["Stalled opportunities", stalled],
    ["Becoming important", important],
  ];

  els.weeklyReviewGrid.replaceChildren(...groups.map(([label, items]) => {
    const block = document.createElement("div");
    block.className = "review-block";
    const count = document.createElement("strong");
    count.textContent = String(items.length);
    const title = document.createElement("span");
    title.textContent = label;
    const names = document.createElement("p");
    names.textContent = items.slice(0, 3).map((item) => `@${item.username || "Unknown"}`).join(", ") || "None yet";
    block.append(count, title, names);
    return block;
  }));
}

function pruneSelectedIds() {
  const validIds = new Set(taggedConversations.map(getItemKey));
  selectedIds = new Set([...selectedIds].filter((id) => validIds.has(id)));
}

function renderBulkToolbar(filtered) {
  const selectedCount = selectedIds.size;
  els.bulkToolbar.hidden = !taggedConversations.length;
  els.selectedCount.textContent = `${selectedCount} selected`;
  els.archiveSelectedBtn.disabled = selectedCount === 0;
  els.archiveSelectedBtn.textContent = viewMode === "archived" ? "Restore Selected" : "Archive Selected";
  els.exportSelectedBtn.disabled = selectedCount === 0;
  els.deleteSelectedBtn.disabled = selectedCount === 0;
  els.clearSelectionBtn.disabled = selectedCount === 0;
  els.selectVisibleBtn.disabled = !filtered.length;
}

function renderList() {
  const filtered = getFilteredConversations();
  const total = taggedConversations.length;
  pruneSelectedIds();
  els.listCount.textContent = total ? `${total} saved` : "";
  els.clearAllBtn.disabled = total === 0;
  els.exportTagsBtn.disabled = total === 0;
  els.exportCsvBtn.disabled = total === 0;
  els.copyMarkdownBtn.disabled = total === 0;
  els.importTagsBtn.disabled = false;
  els.clearFilterBtn.hidden = !filterText.trim() && !activeTagFilter;
  renderStats();
  renderCommandCenter();
  if (els.weeklyReviewGrid) renderWeeklyReview();
  renderTagSuggestions();
  renderTagCloud();
  renderBulkToolbar(filtered);

  if (!taggedConversations.length) {
    renderEmpty("No tagged conversations yet.");
    return;
  }

  if (!filtered.length) {
    renderEmpty("No tags match your filter.");
    return;
  }

  els.list.replaceChildren(...filtered.map(createTaggedItem));
}

function getExistingTagForContext() {
  if (!currentContext) return null;

  const conversationId = currentContext.conversationId || getConversationId(currentContext);
  return taggedConversations.find((item) => (item.conversationId || item.id) === conversationId) || null;
}

function syncFormWithCurrentContext() {
  if (!currentContext) {
    els.formMode.textContent = "Select a chat";
    els.saveBtn.textContent = "Save";
    els.statusSelect.value = "new";
    els.followUpInput.value = "";
    return;
  }

  const existing = getExistingTagForContext();
  els.formMode.textContent = existing ? "Editing saved tag" : "New tag";
  els.saveBtn.textContent = existing ? "Update" : "Save";

  if (!existing) {
    els.tagInput.value = "";
    els.descInput.value = "";
    els.statusSelect.value = "new";
    els.followUpInput.value = "";
    autoResizeTextarea(els.descInput);
    selectedColor = DEFAULT_TAG_COLOR;
    updateSelectedColor();
    updateCounters();
    return;
  }

  els.tagInput.value = existing.tag || "";
  els.descInput.value = existing.description || "";
  els.statusSelect.value = existing.status || "new";
  els.followUpInput.value = existing.followUpAt || "";
  autoResizeTextarea(els.descInput);
  selectedColor = existing.color || DEFAULT_TAG_COLOR;
  updateSelectedColor();
  updateCounters();
}

function resetForm() {
  const existing = getExistingTagForContext();
  els.tagInput.value = existing?.tag || "";
  els.descInput.value = existing?.description || "";
  els.statusSelect.value = existing?.status || "new";
  els.followUpInput.value = existing?.followUpAt || "";
  autoResizeTextarea(els.descInput);
  selectedColor = existing?.color || DEFAULT_TAG_COLOR;
  updateSelectedColor();
  updateCounters();
  setStatus();
}

async function loadState() {
  try {
    const [state, aiData, prefsData] = await Promise.all([
      getState(),
      chrome.storage.local.get(TAGGIT_KEYS.aiSettings),
      chrome.storage.local.get(UI_PREFS_KEY),
    ]);
    currentContext = state.context;
    taggedConversations = state.tags;

    const loadedAiSettings = aiData[TAGGIT_KEYS.aiSettings];
    aiSettings =
      loadedAiSettings && typeof loadedAiSettings === "object" && !Array.isArray(loadedAiSettings)
        ? { apiKey: String(loadedAiSettings.apiKey || "") }
        : { apiKey: "" };

    const loadedPrefs = prefsData[UI_PREFS_KEY];
    uiPrefs =
      loadedPrefs && typeof loadedPrefs === "object" && !Array.isArray(loadedPrefs)
        ? { ...DEFAULT_UI_PREFS, ...loadedPrefs }
        : { ...DEFAULT_UI_PREFS };
    uiPrefs.archivedIds = Array.isArray(uiPrefs.archivedIds) ? uiPrefs.archivedIds : [];
    uiPrefs.pinnedIds = Array.isArray(uiPrefs.pinnedIds) ? uiPrefs.pinnedIds : [];
    sortMode = getValidSortMode(uiPrefs.sortMode);
    viewMode = getValidViewMode(uiPrefs.viewMode);
    els.sortSelect.value = sortMode;
    els.viewSelect.value = viewMode;
    setTheme(uiPrefs.theme);
    setDensity(uiPrefs.density);
    els.apiKeyInput.value = aiSettings.apiKey || "";
    renderContext();
    renderList();
  } catch (error) {
    console.warn("[Taggit] Failed to load sidebar state.", error);
    renderEmpty("Unable to load tags.");
  }
}

function setSummaryStatus(message = "") {
  els.summaryStatus.textContent = message;
}

function setSummaryLoading(isLoading) {
  els.summarizeBtn.disabled = isLoading;
  els.summarizeBtn.textContent = isLoading ? "Summarizing..." : "Summarize";
}

function renderSummary(text, messageCount) {
  const cleanText = String(text || "").trim();
  const note = cleanText.match(/Note:\s*([\s\S]*?)(?:\n\s*Tags:|$)/i)?.[1]?.trim() || cleanText;
  const tags = cleanText.match(/Tags:\s*([\s\S]*)$/i)?.[1]?.trim() || "";
  const displayText = tags ? `${note}\n\nTags: ${tags}` : note;
  const looksTooShort = note.length < 20;

  els.summaryOutput.textContent = looksTooShort
    ? [
      displayText || "Gemini returned a very short summary.",
      "",
      `Captured ${messageCount} visible chat messages. Open the exact conversation before summarizing.`,
    ].join("\n")
    : displayText;

  latestSummaryNote = note.slice(0, LIMITS.noteMaxLength);
  setSummaryFeedbackEnabled(Boolean(latestSummaryNote));
}

function setSummaryFeedbackEnabled(isEnabled) {
  els.useSummaryBtn.disabled = !isEnabled;
  els.copySummaryBtn.disabled = !isEnabled;
  els.goodSummaryBtn.disabled = !isEnabled;
  els.badSummaryBtn.disabled = !isEnabled;
}

async function getActiveRedditTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  return tabs[0] || null;
}

async function collectConversationFromActiveTab() {
  const tab = await getActiveRedditTab();
  if (!tab?.id) {
    return { ok: false, conversation: null, reason: "Open Reddit Chat in the active tab first." };
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, {
      type: globalThis.TaggitConstants.MESSAGE_TYPES.collectChatMessages,
    });
  } catch {
    return { ok: false, conversation: null, reason: "Open Reddit Chat in the active tab first." };
  }
}

async function saveApiKey() {
  aiSettings = { apiKey: els.apiKeyInput.value.trim() };
  await chrome.storage.local.set({ [TAGGIT_KEYS.aiSettings]: aiSettings });
  setSummaryStatus(aiSettings.apiKey ? "Key saved" : "Key cleared");
}

async function summarizeCurrentChat() {
  const apiKey = els.apiKeyInput.value.trim();
  if (!apiKey) {
    setSummaryStatus("Add API key");
    els.apiKeyInput.focus();
    return;
  }

  setSummaryLoading(true);
  setSummaryStatus("Collecting chat");

  try {
    const result = await collectConversationFromActiveTab();
    const conversation = result?.conversation || { messages: result?.messages || [] };
    const messageCount = conversation.messages?.length || 0;
    if (!result?.ok || messageCount < 2) {
      setSummaryStatus(result?.reason || "No messages found");
      return;
    }

    setSummaryStatus("Calling Gemini");
    const examples = await loadAiExamples();
    const summary = await globalThis.TaggitAI.summarizeConversation(conversation, { apiKey, examples });
    if (!summary.ok) {
      setSummaryStatus(summary.reason || "Summary failed");
      return;
    }

    latestConversation = conversation;
    latestSummary = summary;
    renderSummary(summary.summary, messageCount);
    latestSummaryNote = (summary.note || latestSummaryNote).slice(0, LIMITS.noteMaxLength);
    setSummaryFeedbackEnabled(Boolean(latestSummaryNote));
    await saveSummary(conversation, summary);
    setSummaryStatus(`${messageCount} messages summarized`);
  } catch (error) {
    console.warn("[Taggit] Failed to summarize chat.", error);
    setSummaryStatus("Summary failed");
  } finally {
    setSummaryLoading(false);
  }
}

function buildExampleInput(conversation) {
  const participants = conversation?.participants?.length
    ? conversation.participants.join(", ")
    : "Unknown";
  const messages = (conversation?.messages || [])
    .slice(-12)
    .map((message) => `${message.author || "Unknown"}: ${message.text}`)
    .join("\n");

  return [`Participants: ${participants}`, messages].join("\n");
}

async function loadAiExamples() {
  const data = await chrome.storage.local.get(TAGGIT_KEYS.aiExamples);
  return Array.isArray(data[TAGGIT_KEYS.aiExamples]) ? data[TAGGIT_KEYS.aiExamples] : [];
}

async function saveAiExample(output, rating = "good") {
  if (!latestConversation || !output.trim()) return;

  const examples = await loadAiExamples();
  const nextExample = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    rating,
    input: buildExampleInput(latestConversation),
    output: output.trim().slice(0, LIMITS.noteMaxLength),
    createdAt: Date.now(),
  };
  const nextExamples = [...examples, nextExample]
    .filter((example) => example.rating === "good")
    .slice(-25);

  await chrome.storage.local.set({ [TAGGIT_KEYS.aiExamples]: nextExamples });
}

async function markSummaryGood() {
  if (!latestSummaryNote) return;
  await saveAiExample(latestSummaryNote, "good");
  setSummaryStatus("Feedback saved");
}

function markSummaryBad() {
  latestSummaryNote = "";
  latestSummary = null;
  setSummaryFeedbackEnabled(false);
  setSummaryStatus("Marked bad. Edit the note after using a better summary.");
}

async function copySummary() {
  if (!latestSummaryNote) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(latestSummaryNote);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = latestSummaryNote;
      textarea.setAttribute("readonly", "");
      textarea.className = "visually-hidden";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setSummaryStatus("Summary copied");
  } catch (error) {
    console.warn("[Taggit] Failed to copy summary.", error);
    setSummaryStatus("Copy failed");
  }
}

function getScopedPreferenceIds(tags, preferenceIds = []) {
  const exportedKeys = new Set((Array.isArray(tags) ? tags : []).map(getItemKey));
  return (Array.isArray(preferenceIds) ? preferenceIds : []).filter((id) => exportedKeys.has(id));
}

function exportTags(tags = getFilteredConversations()) {
  const exportedTags = Array.isArray(tags) ? tags : getFilteredConversations();
  if (!exportedTags.length) return;

  const payload = {
    exportedAt: new Date().toISOString(),
    count: exportedTags.length,
    preferences: {
      archivedIds: getScopedPreferenceIds(exportedTags, uiPrefs.archivedIds),
      pinnedIds: getScopedPreferenceIds(exportedTags, uiPrefs.pinnedIds),
    },
    tags: exportedTags,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `taggit-tags-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus("Tags exported.", "success");
}

function escapeCsv(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function exportCsv(tags = getFilteredConversations()) {
  const exportedTags = Array.isArray(tags) ? tags : getFilteredConversations();
  if (!exportedTags.length) return;

  const rows = [
    ["tag", "username", "status", "followUpAt", "description", "href", "createdAt", "updatedAt", "pinned", "archived"],
    ...exportedTags.map((item) => [
      item.tag,
      item.username,
      getStatusLabel(item.status),
      item.followUpAt,
      item.description,
      getBestChatHref(item),
      item.createdAt ? new Date(item.createdAt).toISOString() : "",
      item.updatedAt ? new Date(item.updatedAt).toISOString() : "",
      isPinned(item) ? "yes" : "no",
      isArchived(item) ? "yes" : "no",
    ]),
  ];
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `taggit-tags-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus("CSV exported.", "success");
}

function formatMarkdown(tags = getFilteredConversations()) {
  const exportedTags = Array.isArray(tags) ? tags : getFilteredConversations();
  if (!exportedTags.length) return "";

  return exportedTags.map((item) => {
    const lines = [
      `- ${item.tag} - @${item.username || "Unknown"}`,
      `  - Status: ${getStatusLabel(item.status)}`,
      item.followUpAt ? `  - Follow-up: ${item.followUpAt}` : "",
      item.description ? `  - Note: ${item.description}` : "",
      getBestChatHref(item) ? `  - Chat: ${getBestChatHref(item)}` : "",
      isPinned(item) ? "  - Pinned: yes" : "",
      isArchived(item) ? "  - Archived: yes" : "",
    ];
    return lines.filter(Boolean).join("\n");
  }).join("\n");
}

async function copyText(text, successMessage, failureMessage = "Copy failed") {
  if (!text) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.className = "visually-hidden";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setStatus(successMessage, "success");
  } catch (error) {
    console.warn("[Taggit] Failed to copy text.", error);
    setStatus(failureMessage, "error");
  }
}

function copyMarkdown() {
  copyText(formatMarkdown(), "Markdown copied.");
}

function buildSearchHaystack(item) {
  const memory = createRelationshipMemory(item);
  return [
    item.tag,
    item.username,
    item.description,
    item.status,
    item.followUpAt,
    memory.summary,
    memory.keyTopics.join(" "),
    memory.goals,
    memory.interests,
    memory.openThreads,
  ].join(" ").toLowerCase();
}

function answerAskTaggit(question) {
  const q = String(question || "").trim().toLowerCase();
  if (!q) return [];

  const active = getActiveConversations();
  if (/overdue|late|missed/.test(q)) return active.filter(isOverdue);
  if (/follow.?up|needs attention|due/.test(q)) {
    return [...getActionMetrics().overdue, ...getActionMetrics().dueToday].filter((item, index, arr) =>
      arr.findIndex((other) => getItemKey(other) === getItemKey(item)) === index
    );
  }
  if (/opportunit|cooling|stalled/.test(q)) return active.filter((item) => item.status === "opportunity" || isOpportunityCooling(item));
  if (/waiting/.test(q)) return active.filter((item) => item.status === "waiting");
  if (/no next|next step|unclear/.test(q)) return active.filter((item) => !hasNextStep(item));
  if (/help|asked for help|needs help/.test(q)) return active.filter((item) => /\b(help|stuck|question|advice|how do i|can you|need)\b/i.test(item.description || ""));
  if (/ai|artificial intelligence|llm|gpt|gemini|machine learning/.test(q)) return active.filter((item) => /\b(ai|artificial intelligence|llm|gpt|gemini|machine learning|ml)\b/i.test(buildSearchHaystack(item)));

  const terms = (q.match(/[a-z0-9][a-z0-9-]{2,}/g) || []).filter((term) => !QUICK_ASK_STOP_WORDS.has(term));
  if (!terms.length) return [];

  return active.filter((item) => {
    const haystack = buildSearchHaystack(item);
    return terms.some((term) => haystack.includes(term));
  });
}

function renderAskResults(items, question = "") {
  if (!question.trim()) {
    els.askResults.textContent = "Ask a question to search saved notes, tags, statuses, and follow-up dates.";
    return;
  }

  if (!items.length) {
    els.askResults.textContent = "No local matches yet. Add richer notes or AI summaries to make Ask Taggit smarter.";
    return;
  }

  const list = document.createElement("div");
  list.className = "ask-result-list";
  items.slice(0, 6).forEach((item) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "ask-result";
    row.dataset.action = "edit";
    row.dataset.id = getItemKey(item);
    const title = document.createElement("strong");
    title.textContent = `@${item.username || "Unknown"} · ${item.tag}`;
    const detail = document.createElement("span");
    detail.textContent = getSuggestedNextAction(item);
    row.append(title, detail);
    list.appendChild(row);
  });

  els.askResults.replaceChildren(list);
}

function askTaggit() {
  const question = els.askInput.value;
  renderAskResults(answerAskTaggit(question), question);
}

async function importTagsFromFile(file) {
  if (!file) return;

  try {
    const raw = await file.text();
    const payload = JSON.parse(raw);
    const incoming = normalizeTags(Array.isArray(payload) ? payload : payload?.tags || []);
    if (!incoming.length) {
      setStatus("No valid tags found.", "error");
      return;
    }

    const byId = new Map(taggedConversations.map((tag) => [getItemKey(tag), tag]));
    incoming.forEach((tag) => {
      const key = getItemKey(tag);
      if (!key) return;

      const existing = byId.get(key);
      if (!existing || (tag.updatedAt || tag.createdAt || 0) >= (existing.updatedAt || existing.createdAt || 0)) {
        byId.set(key, tag);
      }
    });

    const incomingKeys = new Set(incoming.map(getItemKey).filter(Boolean));
    const incomingPreferences = payload?.preferences && typeof payload.preferences === "object"
      ? payload.preferences
      : {};
    const importedPinnedIds = Array.isArray(incomingPreferences.pinnedIds)
      ? incomingPreferences.pinnedIds.filter((id) => incomingKeys.has(id))
      : [];
    const importedArchivedIds = Array.isArray(incomingPreferences.archivedIds)
      ? incomingPreferences.archivedIds.filter((id) => incomingKeys.has(id))
      : [];

    taggedConversations = normalizeTags([...byId.values()]);
    uiPrefs = {
      ...uiPrefs,
      archivedIds: [...new Set([...(uiPrefs.archivedIds || []), ...importedArchivedIds])],
      pinnedIds: [...new Set([...(uiPrefs.pinnedIds || []), ...importedPinnedIds])],
    };
    await save();
    await saveUiPrefs();
    renderList();
    syncFormWithCurrentContext();
    setStatus(`${incoming.length} tags imported.`, "success");
  } catch (error) {
    console.warn("[Taggit] Failed to import tags.", error);
    setStatus("Import failed.", "error");
  } finally {
    if (els.importFileInput) {
      els.importFileInput.value = "";
    }
  }
}

async function togglePinned(id) {
  if (!id) return;

  const pinnedIds = getPinnedIds();
  if (pinnedIds.has(id)) {
    pinnedIds.delete(id);
  } else {
    pinnedIds.add(id);
  }

  uiPrefs = { ...uiPrefs, pinnedIds: [...pinnedIds] };
  renderList();
  await saveUiPrefs();
}

async function toggleArchived(id) {
  if (!id) return;

  const archivedIds = getArchivedIds();
  if (archivedIds.has(id)) {
    archivedIds.delete(id);
  } else {
    archivedIds.add(id);
  }

  selectedIds.delete(id);
  uiPrefs = { ...uiPrefs, archivedIds: [...archivedIds] };
  renderList();
  await saveUiPrefs();
}

function setItemSelected(id, isChecked) {
  if (!id) return;

  if (isChecked) {
    selectedIds.add(id);
  } else {
    selectedIds.delete(id);
  }

  renderList();
}

function getSelectedConversations() {
  return taggedConversations.filter((item) => selectedIds.has(getItemKey(item)));
}

function findConversationByKey(id) {
  return taggedConversations.find((item) => getItemKey(item) === id) || null;
}

function editSavedConversation(id) {
  const item = findConversationByKey(id);
  if (!item) return;

  currentContext = {
    conversationId: item.conversationId || item.id,
    href: item.href || "",
    username: item.username || "Unknown",
  };
  renderContext();
  els.tagInput.focus();
  setStatus("Loaded saved tag.", "success");
}

function copySavedConversation(id) {
  const item = findConversationByKey(id);
  if (!item) return;

  copyText(formatMarkdown([item]), "Tag copied.");
}

function selectVisible() {
  getFilteredConversations().forEach((item) => selectedIds.add(getItemKey(item)));
  renderList();
}

function clearSelection() {
  selectedIds.clear();
  renderList();
}

async function deleteSelected() {
  const selected = getSelectedConversations();
  if (!selected.length) return;
  if (!confirm(`Delete ${selected.length} selected tags?`)) return;

  const selectedKeys = new Set(selected.map(getItemKey));
  const previousTags = taggedConversations;
  const previousPrefs = uiPrefs;
  taggedConversations = taggedConversations.filter((item) => !selectedKeys.has(getItemKey(item)));
  selectedIds.clear();
  uiPrefs = {
    ...uiPrefs,
    archivedIds: (uiPrefs.archivedIds || []).filter((id) => !selectedKeys.has(id)),
    pinnedIds: (uiPrefs.pinnedIds || []).filter((id) => !selectedKeys.has(id)),
  };

  try {
    await save();
    await saveUiPrefs();
    renderList();
    syncFormWithCurrentContext();
    setStatus("Selected tags deleted.", "success");
  } catch (error) {
    taggedConversations = previousTags;
    uiPrefs = previousPrefs;
    renderList();
    console.warn("[Taggit] Failed to delete selected tags.", error);
    setStatus("Could not delete selected tags.", "error");
  }
}

async function archiveSelected() {
  const selected = getSelectedConversations();
  if (!selected.length) return;

  const archivedIds = getArchivedIds();
  const shouldRestore = viewMode === "archived";
  selected.forEach((item) => {
    const key = getItemKey(item);
    if (shouldRestore) {
      archivedIds.delete(key);
    } else {
      archivedIds.add(key);
    }
  });

  selectedIds.clear();
  uiPrefs = { ...uiPrefs, archivedIds: [...archivedIds] };
  renderList();
  await saveUiPrefs();
  setStatus(shouldRestore ? "Selected tags restored." : "Selected tags archived.", "success");
}

async function saveSummary(conversation, summary) {
  const roomId =
    conversation.roomId ||
    currentContext?.conversationId ||
    getConversationId(conversation) ||
    `latest-${Date.now()}`;
  const data = await chrome.storage.local.get(TAGGIT_KEYS.summaries);
  const summaries = data[TAGGIT_KEYS.summaries] || {};
  summaries[roomId] = {
    roomId,
    participants: Array.isArray(conversation.participants) ? conversation.participants : [],
    messageCount: conversation.messages?.length || 0,
    summary: summary.summary,
    tags: Array.isArray(summary.tags) ? summary.tags : [],
    updatedAt: Date.now(),
  };
  await chrome.storage.local.set({ [TAGGIT_KEYS.summaries]: summaries });
}

async function save() {
  await saveTags(taggedConversations);
}

async function onSubmit(event) {
  event.preventDefault();

  const tag = els.tagInput.value.trim();
  if (!tag) {
    setStatus("Add a tag label first.", "error");
    els.tagInput.focus();
    return;
  }

  if (tag.length > LIMITS.tagMaxLength) {
    setStatus(`Keep tags under ${LIMITS.tagMaxLength} characters.`, "error");
    return;
  }

  if (!currentContext) {
    setStatus("Select a Reddit conversation first.", "error");
    return;
  }

  const conversationId = currentContext.conversationId || getConversationId(currentContext);
  if (!conversationId) {
    setStatus("Could not identify this conversation.", "error");
    return;
  }

  const existing = getExistingTagForContext();
  const previousTags = taggedConversations;
  const nextTag = {
    conversationId,
    tag,
    color: selectedColor,
    username: currentContext.username || "Unknown",
    href: currentContext.href || "",
    description: els.descInput?.value.trim().slice(0, LIMITS.noteMaxLength) || "",
    status: els.statusSelect.value || "new",
    followUpAt: els.followUpInput.value || "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  setSaving(true);
  taggedConversations = upsertTag([...taggedConversations], nextTag);

  try {
    await save();
    if (latestConversation && els.descInput?.value.trim()) {
      saveAiExample(els.descInput.value.trim(), "good").catch((error) => {
        console.warn("[Taggit] Failed to save AI example.", error);
      });
    }
    setStatus(existing ? "Tag updated." : "Tag saved.", "success");
    renderList();
  } catch (error) {
    taggedConversations = previousTags;
    renderList();
    console.warn("[Taggit] Failed to save tag.", error);
    setStatus("Could not save. Try again.", "error");
  } finally {
    setSaving(false);
  }
}

async function onClickList(event) {
  if (!(event.target instanceof Element)) return;

  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;

  if (actionTarget.dataset.action === "select") {
    if (!(actionTarget instanceof HTMLInputElement)) return;
    setItemSelected(actionTarget.dataset.id, actionTarget.checked);
    return;
  }

  if (actionTarget.dataset.action === "pin") {
    await togglePinned(actionTarget.dataset.id);
    return;
  }

  if (actionTarget.dataset.action === "edit") {
    editSavedConversation(actionTarget.dataset.id);
    return;
  }

  if (actionTarget.dataset.action === "copy-item") {
    copySavedConversation(actionTarget.dataset.id);
    return;
  }

  if (actionTarget.dataset.action === "archive") {
    await toggleArchived(actionTarget.dataset.id);
    return;
  }

  if (actionTarget.dataset.action === "open-chat") {
    openChat(actionTarget.dataset.href);
    return;
  }

  if (actionTarget.dataset.action !== "delete") return;
  if (!confirm("Delete this tag?")) return;

  const previousTags = taggedConversations;
  const previousPrefs = uiPrefs;
  const previousSelectedIds = new Set(selectedIds);
  const deleteId = actionTarget.dataset.id;
  taggedConversations = taggedConversations.filter((tag) => getItemKey(tag) !== deleteId);
  selectedIds.delete(deleteId);
  uiPrefs = {
    ...uiPrefs,
    archivedIds: (uiPrefs.archivedIds || []).filter((id) => id !== deleteId),
    pinnedIds: (uiPrefs.pinnedIds || []).filter((id) => id !== deleteId),
  };

  try {
    await save();
    await saveUiPrefs();
    renderList();
    syncFormWithCurrentContext();
    setStatus("Tag deleted.", "success");
  } catch (error) {
    taggedConversations = previousTags;
    uiPrefs = previousPrefs;
    selectedIds = previousSelectedIds;
    renderList();
    console.warn("[Taggit] Failed to delete tag.", error);
    setStatus("Could not delete. Try again.", "error");
  }
}

async function openChat(href) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: globalThis.TaggitConstants.MESSAGE_TYPES.openChat,
      href,
    });

    if (!response?.ok) {
      setStatus("Could not open chat.", "error");
    }
  } catch (error) {
    console.warn("[Taggit] Failed to open chat.", error);
    setStatus("Could not open chat.", "error");
  }
}

async function clearAll() {
  if (!confirm("Clear all tags? This cannot be undone.")) return;

  const previousTags = taggedConversations;
  const previousPrefs = uiPrefs;
  taggedConversations = [];
  selectedIds.clear();
  uiPrefs = { ...uiPrefs, archivedIds: [], pinnedIds: [] };

  try {
    await save();
    await saveUiPrefs();
    renderList();
    resetForm();
    setStatus("All tags cleared.", "success");
  } catch (error) {
    taggedConversations = previousTags;
    uiPrefs = previousPrefs;
    renderList();
    console.warn("[Taggit] Failed to clear tags.", error);
    setStatus("Could not clear tags. Try again.", "error");
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  const contextChange = changes[TAGGIT_KEYS.context];
  const tagsChange = changes[TAGGIT_KEYS.tags];

  if (contextChange) {
    currentContext = contextChange.newValue || null;
    renderContext();
  }

  if (tagsChange) {
    taggedConversations = normalizeTags(tagsChange.newValue);
    renderList();
    syncFormWithCurrentContext();
  }
});

els.form.addEventListener("submit", onSubmit);
els.list.addEventListener("click", onClickList);
els.dailyActionList.addEventListener("click", onClickList);
els.askResults?.addEventListener("click", onClickList);
document.querySelectorAll("[data-view-shortcut]").forEach((button) => {
  button.addEventListener("click", async () => {
    viewMode = getValidViewMode(button.dataset.viewShortcut);
    uiPrefs = { ...uiPrefs, viewMode };
    els.viewSelect.value = viewMode;
    selectedIds.clear();
    renderList();
    await saveUiPrefs();
  });
});
els.clearAllBtn.addEventListener("click", clearAll);
els.exportTagsBtn.addEventListener("click", () => exportTags());
els.exportCsvBtn.addEventListener("click", () => exportCsv());
els.copyMarkdownBtn.addEventListener("click", copyMarkdown);
els.importTagsBtn.addEventListener("click", () => els.importFileInput.click());
els.importFileInput.addEventListener("change", () => importTagsFromFile(els.importFileInput.files?.[0]));
els.selectVisibleBtn.addEventListener("click", selectVisible);
els.clearSelectionBtn.addEventListener("click", clearSelection);
els.exportSelectedBtn.addEventListener("click", () => exportTags(getSelectedConversations()));
els.archiveSelectedBtn.addEventListener("click", archiveSelected);
els.deleteSelectedBtn.addEventListener("click", deleteSelected);
els.saveApiKeyBtn.addEventListener("click", saveApiKey);
els.summarizeBtn.addEventListener("click", summarizeCurrentChat);
els.useSummaryBtn.addEventListener("click", () => {
  if (!latestSummaryNote) return;
  els.descInput.value = latestSummaryNote;
  autoResizeTextarea(els.descInput);
  updateCounters();
  els.descInput.focus();
  setStatus("Summary added to description.", "success");
});
els.copySummaryBtn.addEventListener("click", copySummary);
els.goodSummaryBtn.addEventListener("click", markSummaryGood);
els.badSummaryBtn.addEventListener("click", markSummaryBad);
els.themeToggleBtn.addEventListener("click", async () => {
  setTheme(uiPrefs.theme === "light" ? "dark" : "light");
  await saveUiPrefs();
});
els.densityToggleBtn.addEventListener("click", async () => {
  setDensity(uiPrefs.density === "compact" ? "comfortable" : "compact");
  await saveUiPrefs();
});
els.sortSelect.addEventListener("change", async (event) => {
  if (!(event.target instanceof HTMLSelectElement)) return;

  sortMode = getValidSortMode(event.target.value);
  uiPrefs = { ...uiPrefs, sortMode };
  els.sortSelect.value = sortMode;
  renderList();
  await saveUiPrefs();
});
els.viewSelect.addEventListener("change", async (event) => {
  if (!(event.target instanceof HTMLSelectElement)) return;

  viewMode = getValidViewMode(event.target.value);
  uiPrefs = { ...uiPrefs, viewMode };
  els.viewSelect.value = viewMode;
  selectedIds.clear();
  renderList();
  await saveUiPrefs();
});
els.tagSuggestions.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const button = event.target.closest(".suggestion-chip");
  if (!button) return;

  els.tagInput.value = button.dataset.tag || "";
  selectedColor = button.dataset.color || selectedColor;
  updateSelectedColor();
  updateCounters();
  els.tagInput.focus();
});
els.noteTemplates.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const button = event.target.closest("[data-template]");
  if (!button) return;

  const template = button.dataset.template || "";
  const separator = els.descInput.value && !els.descInput.value.endsWith("\n") ? "\n" : "";
  els.descInput.value = `${els.descInput.value}${separator}${template}`.slice(0, LIMITS.noteMaxLength);
  autoResizeTextarea(els.descInput);
  updateCounters();
  els.descInput.focus();
});
els.askBtn?.addEventListener("click", askTaggit);
els.askInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") askTaggit();
});
document.querySelectorAll("[data-ask]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!els.askInput) return;
    els.askInput.value = button.dataset.ask || "";
    askTaggit();
  });
});
els.clearFilterBtn.addEventListener("click", () => {
  filterText = "";
  activeTagFilter = "";
  els.filterInput.value = "";
  renderList();
  els.filterInput.focus();
});
els.tagCloud.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const button = event.target.closest(".tag-filter-chip");
  if (!button) return;

  const nextFilter = button.dataset.tag || "";
  activeTagFilter = activeTagFilter.toLowerCase() === nextFilter.toLowerCase() ? "" : nextFilter;
  renderList();
});
els.contextPreview.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const actionTarget = event.target.closest("[data-action='open-chat']");
  if (actionTarget) {
    openChat(actionTarget.dataset.href);
  }
});
els.resetFormBtn.addEventListener("click", resetForm);
els.tagInput.addEventListener("input", updateCounters);
els.filterInput?.addEventListener("input", (event) => {
  window.cancelAnimationFrame(filterFrame);
  filterFrame = window.requestAnimationFrame(() => {
    filterText = event.target.value;
    renderList();
  });
});
els.descInput.addEventListener("input", () => {
  autoResizeTextarea(els.descInput);
  updateCounters();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.activeElement === els.filterInput && (filterText || activeTagFilter)) {
    filterText = "";
    activeTagFilter = "";
    els.filterInput.value = "";
    renderList();
  }

  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    els.form.requestSubmit();
  }
});

setTheme(uiPrefs.theme);
setDensity(uiPrefs.density);
updateCounters();
buildColorPicker();
loadState();
