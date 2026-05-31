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
  tagCloud: document.getElementById("tagCloud"),
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  totalStat: document.getElementById("totalStat"),
  notesStat: document.getElementById("notesStat"),
  noteTemplates: document.getElementById("noteTemplates"),
  uniqueStat: document.getElementById("uniqueStat"),
  viewSelect: document.getElementById("viewSelect"),
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
const VIEW_MODES = new Set(["active", "all", "pinned", "withNotes", "withoutNotes", "archived"]);
const STATUS_TIMEOUT_MS = 2200;
const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

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
  els.themeToggleBtn.textContent = nextTheme === "light" ? "L" : "D";
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
  els.densityToggleBtn.textContent = nextDensity === "compact" ? "C" : "N";
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
  listItem.dataset.id = item.id;

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
  deleteButton.dataset.id = item.id;
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
      if (activeViewMode === "withNotes" && !item.description?.trim()) return false;
      if (activeViewMode === "withoutNotes" && item.description?.trim()) return false;
      if (tagFilter && (item.tag || "").toLowerCase() !== tagFilter) return false;
      if (!query) return true;
      return [item.tag, item.username, item.description].some((value) =>
        (value || "").toLowerCase().includes(query)
      );
    });
}

function renderStats() {
  const total = taggedConversations.length;
  const pinnedCount = taggedConversations.filter(isPinned).length;
  const notes = taggedConversations.filter((item) => item.description?.trim()).length;
  const unique = new Set(taggedConversations.map((item) => (item.tag || "").trim().toLowerCase()).filter(Boolean));

  els.totalStat.textContent = String(total);
  els.pinnedStat.textContent = String(pinnedCount);
  els.notesStat.textContent = String(notes);
  els.uniqueStat.textContent = String(unique.size);
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
    return;
  }

  const existing = getExistingTagForContext();
  els.formMode.textContent = existing ? "Editing saved tag" : "New tag";
  els.saveBtn.textContent = existing ? "Update" : "Save";

  if (!existing) {
    els.tagInput.value = "";
    els.descInput.value = "";
    autoResizeTextarea(els.descInput);
    selectedColor = DEFAULT_TAG_COLOR;
    updateSelectedColor();
    updateCounters();
    return;
  }

  els.tagInput.value = existing.tag || "";
  els.descInput.value = existing.description || "";
  autoResizeTextarea(els.descInput);
  selectedColor = existing.color || DEFAULT_TAG_COLOR;
  updateSelectedColor();
  updateCounters();
}

function resetForm() {
  const existing = getExistingTagForContext();
  els.tagInput.value = existing?.tag || "";
  els.descInput.value = existing?.description || "";
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
    aiSettings = aiData[TAGGIT_KEYS.aiSettings] || { apiKey: "" };
    uiPrefs = { ...DEFAULT_UI_PREFS, ...(prefsData[UI_PREFS_KEY] || {}) };
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

function exportTags(tags = getFilteredConversations()) {
  const exportedTags = Array.isArray(tags) ? tags : getFilteredConversations();
  if (!exportedTags.length) return;

  const payload = {
    exportedAt: new Date().toISOString(),
    count: exportedTags.length,
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
    ["tag", "username", "description", "href", "createdAt", "updatedAt", "pinned", "archived"],
    ...exportedTags.map((item) => [
      item.tag,
      item.username,
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

async function importTagsFromFile(file) {
  if (!file) return;

  try {
    const raw = await file.text();
    const payload = JSON.parse(raw);
    const incoming = normalizeTags(Array.isArray(payload) ? payload : payload.tags);
    if (!incoming.length) {
      setStatus("No valid tags found.", "error");
      return;
    }

    const byId = new Map(taggedConversations.map((tag) => [getItemKey(tag), tag]));
    incoming.forEach((tag) => byId.set(getItemKey(tag), tag));
    taggedConversations = normalizeTags([...byId.values()]);
    await save();
    renderList();
    syncFormWithCurrentContext();
    setStatus(`${incoming.length} tags imported.`, "success");
  } catch (error) {
    console.warn("[Taggit] Failed to import tags.", error);
    setStatus("Import failed.", "error");
  } finally {
    els.importFileInput.value = "";
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
  const roomId = conversation.roomId || currentContext?.conversationId || "latest";
  const data = await chrome.storage.local.get(TAGGIT_KEYS.summaries);
  const summaries = data[TAGGIT_KEYS.summaries] || {};
  summaries[roomId] = {
    roomId,
    participants: conversation.participants || [],
    messageCount: conversation.messages?.length || 0,
    summary: summary.summary,
    tags: summary.tags || [],
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
  setSaving(true);
  taggedConversations = upsertTag(taggedConversations, {
    conversationId,
    tag,
    color: selectedColor,
    username: currentContext.username || "Unknown",
    href: currentContext.href || "",
    description: els.descInput?.value.trim().slice(0, LIMITS.noteMaxLength) || "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  try {
    await save();
    if (latestConversation && els.descInput?.value.trim()) {
      await saveAiExample(els.descInput.value.trim(), "good");
    }
    setStatus(existing ? "Tag updated." : "Tag saved.", "success");
    renderList();
  } catch (error) {
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
  const deleteId = actionTarget.dataset.id;
  taggedConversations = taggedConversations.filter((tag) => tag.id !== actionTarget.dataset.id);
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
