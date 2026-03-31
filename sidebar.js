const CONTEXT_KEY = "threadVaultCurrentContext";
const TAGS_KEY = "threadVaultTaggedConversations";

const elements = {
  contextPreview: document.getElementById("contextPreview"),
  form: document.getElementById("tagForm"),
  tagInput: document.getElementById("tagInput"),
  list: document.getElementById("taggedList"),
  clearAllBtn: document.getElementById("clearAllBtn")
};

let currentContext = null;
let taggedConversations = [];

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function contextSummary(context) {
  if (!context) return "No conversation selected yet.";

  const text = context.conversationText || "Conversation selected";
  const page = context.page || "";
  return `${text}${page ? ` (${page})` : ""}`;
}

function renderContext() {
  elements.contextPreview.textContent = contextSummary(currentContext);
}

function renderList() {
  if (!taggedConversations.length) {
    elements.list.innerHTML = '<li class="empty">No tagged conversations yet.</li>';
    return;
  }

  const items = taggedConversations
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((item) => {
      const safeTag = escapeHtml(item.tag);
      const safeText = escapeHtml(item.conversationText || "Conversation");
      const date = formatDate(item.createdAt);
      const link = item.conversationHref
        ? `<a class="link" href="${escapeHtml(item.conversationHref)}" target="_blank" rel="noreferrer">Open conversation</a>`
        : "";

      return `
        <li class="tagged-item" data-id="${item.id}">
          <div class="tagged-top">
            <span class="tag-pill">${safeTag}</span>
            <span class="date">${date}</span>
          </div>
          <p class="text">${safeText}</p>
          ${link}
          <div class="item-actions">
            <button class="delete-btn" type="button" data-action="delete" data-id="${item.id}">Delete</button>
          </div>
        </li>
      `;
    })
    .join("");

  elements.list.innerHTML = items;
}

async function loadState() {
  const data = await chrome.storage.local.get([CONTEXT_KEY, TAGS_KEY]);
  currentContext = data[CONTEXT_KEY] || null;
  taggedConversations = Array.isArray(data[TAGS_KEY]) ? data[TAGS_KEY] : [];
  renderContext();
  renderList();
}

async function saveTaggedConversations() {
  await chrome.storage.local.set({ [TAGS_KEY]: taggedConversations });
}

async function onSubmitTag(event) {
  event.preventDefault();

  const tag = elements.tagInput.value.trim();
  if (!tag) return;

  if (!currentContext) {
    elements.contextPreview.textContent = "Select a conversation from Reddit first.";
    return;
  }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tag,
    conversationText: currentContext.conversationText || "",
    conversationHref: currentContext.conversationHref || "",
    page: currentContext.page || "",
    createdAt: Date.now()
  };

  taggedConversations.push(entry);
  await saveTaggedConversations();
  elements.tagInput.value = "";
  renderList();
}

async function onClickList(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.action !== "delete") return;

  const { id } = target.dataset;
  if (!id) return;

  taggedConversations = taggedConversations.filter((entry) => entry.id !== id);
  await saveTaggedConversations();
  renderList();
}

async function clearAll() {
  taggedConversations = [];
  await saveTaggedConversations();
  renderList();
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[CONTEXT_KEY]) {
    currentContext = changes[CONTEXT_KEY].newValue || null;
    renderContext();
  }
  if (changes[TAGS_KEY]) {
    taggedConversations = Array.isArray(changes[TAGS_KEY].newValue) ? changes[TAGS_KEY].newValue : [];
    renderList();
  }
});

elements.form.addEventListener("submit", onSubmitTag);
elements.list.addEventListener("click", onClickList);
elements.clearAllBtn.addEventListener("click", clearAll);

loadState();
