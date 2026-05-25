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
  list: document.getElementById("taggedList"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  clearFilterBtn: document.getElementById("clearFilterBtn"),
  colorPicker: document.getElementById("colorPicker"),
  descInput: document.getElementById("descInput"),
  filterInput: document.getElementById("filterInput"),
  formMode: document.getElementById("formMode"),
  listCount: document.getElementById("listCount"),
  resetFormBtn: document.getElementById("resetFormBtn"),
  saveBtn: document.getElementById("saveBtn"),
  saveStatus: document.getElementById("saveStatus"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  saveApiKeyBtn: document.getElementById("saveApiKeyBtn"),
  summarizeBtn: document.getElementById("summarizeBtn"),
  useSummaryBtn: document.getElementById("useSummaryBtn"),
  goodSummaryBtn: document.getElementById("goodSummaryBtn"),
  badSummaryBtn: document.getElementById("badSummaryBtn"),
  summaryOutput: document.getElementById("summaryOutput"),
  summaryStatus: document.getElementById("summaryStatus"),
};

let currentContext = null;
let taggedConversations = [];
let selectedColor = DEFAULT_TAG_COLOR;
let filterText = "";
let filterFrame = null;
let statusTimer = null;
let aiSettings = { apiKey: "" };
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
    statusTimer = window.setTimeout(() => setStatus(), 2200);
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
  return new Date(ts).toLocaleString();
}

function appendText(parent, text) {
  parent.appendChild(document.createTextNode(text));
}

function createOpenChatButton(href, className = "") {
  const safeHref = getSafeChatHref(href);
  const button = document.createElement("button");
  button.type = "button";
  button.className = className || "link-btn";
  button.textContent = "Open chat";
  button.dataset.action = "open-chat";
  button.dataset.href = safeHref || "";
  button.title = safeHref ? "Open this Reddit chat" : "Open Reddit Chat";
  button.setAttribute("aria-label", safeHref ? "Open this Reddit chat" : "Open Reddit Chat");
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

function createTaggedItem(item) {
  const listItem = document.createElement("li");
  listItem.className = "tagged-item";
  listItem.dataset.id = item.id;

  const top = document.createElement("div");
  top.className = "tagged-top";

  const pill = document.createElement("span");
  pill.className = "tag-pill";
  pill.style.background = item.color || DEFAULT_TAG_COLOR;
  pill.textContent = item.tag;

  const date = document.createElement("span");
  date.className = "date";
  date.textContent = formatDate(item.updatedAt || item.createdAt);

  top.append(pill, date);

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

  listItem.appendChild(createOpenChatButton(getBestChatHref(item), "link link-btn"));

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-btn";
  deleteButton.type = "button";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.id = item.id;
  deleteButton.textContent = "Delete";

  actions.appendChild(deleteButton);
  listItem.appendChild(actions);

  return listItem;
}

function getFilteredConversations() {
  const query = filterText.trim().toLowerCase();

  return taggedConversations
    .slice()
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    .filter((item) => {
      if (!query) return true;
      return [item.tag, item.username, item.description].some((value) =>
        (value || "").toLowerCase().includes(query)
      );
    });
}

function renderList() {
  const filtered = getFilteredConversations();
  const total = taggedConversations.length;
  els.listCount.textContent = total ? `${total} saved` : "";
  els.clearAllBtn.disabled = total === 0;
  els.clearFilterBtn.hidden = !filterText.trim();

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
    return;
  }

  els.tagInput.value = existing.tag || "";
  els.descInput.value = existing.description || "";
  autoResizeTextarea(els.descInput);
  selectedColor = existing.color || DEFAULT_TAG_COLOR;
  updateSelectedColor();
}

function resetForm() {
  const existing = getExistingTagForContext();
  els.tagInput.value = existing?.tag || "";
  els.descInput.value = existing?.description || "";
  autoResizeTextarea(els.descInput);
  selectedColor = existing?.color || DEFAULT_TAG_COLOR;
  updateSelectedColor();
  setStatus();
}

async function loadState() {
  try {
    const [state, aiData] = await Promise.all([
      getState(),
      chrome.storage.local.get(TAGGIT_KEYS.aiSettings),
    ]);
    currentContext = state.context;
    taggedConversations = state.tags;
    aiSettings = aiData[TAGGIT_KEYS.aiSettings] || { apiKey: "" };
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
  if (event.target.dataset.action === "open-chat") {
    openChat(event.target.dataset.href);
    return;
  }

  if (event.target.dataset.action !== "delete") return;
  if (!confirm("Delete this tag?")) return;

  const previousTags = taggedConversations;
  taggedConversations = taggedConversations.filter((tag) => tag.id !== event.target.dataset.id);

  try {
    await save();
    renderList();
    syncFormWithCurrentContext();
    setStatus("Tag deleted.", "success");
  } catch (error) {
    taggedConversations = previousTags;
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
  taggedConversations = [];

  try {
    await save();
    renderList();
    resetForm();
    setStatus("All tags cleared.", "success");
  } catch (error) {
    taggedConversations = previousTags;
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
els.saveApiKeyBtn.addEventListener("click", saveApiKey);
els.summarizeBtn.addEventListener("click", summarizeCurrentChat);
els.useSummaryBtn.addEventListener("click", () => {
  if (!latestSummaryNote) return;
  els.descInput.value = latestSummaryNote;
  autoResizeTextarea(els.descInput);
  els.descInput.focus();
  setStatus("Summary added to description.", "success");
});
els.goodSummaryBtn.addEventListener("click", markSummaryGood);
els.badSummaryBtn.addEventListener("click", markSummaryBad);
els.clearFilterBtn.addEventListener("click", () => {
  filterText = "";
  els.filterInput.value = "";
  renderList();
  els.filterInput.focus();
});
els.contextPreview.addEventListener("click", (event) => {
  if (event.target.dataset.action === "open-chat") {
    openChat(event.target.dataset.href);
  }
});
els.resetFormBtn.addEventListener("click", resetForm);
els.filterInput?.addEventListener("input", (event) => {
  window.cancelAnimationFrame(filterFrame);
  filterFrame = window.requestAnimationFrame(() => {
    filterText = event.target.value;
    renderList();
  });
});
els.descInput.addEventListener("input", () => autoResizeTextarea(els.descInput));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.activeElement === els.filterInput && filterText) {
    filterText = "";
    els.filterInput.value = "";
    renderList();
  }
});

buildColorPicker();
loadState();
