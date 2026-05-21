const CONTEXT_KEY = "threadVaultCurrentContext";
const TAGS_KEY = "threadVaultTaggedConversations";

const COLORS = [
  { name: "Coral",   value: "#ff6b6b" },
  { name: "Sky",     value: "#74b9ff" },
  { name: "Mint",    value: "#55efc4" },
  { name: "Lavender",value: "#a29bfe" },
  { name: "Peach",   value: "#ffeaa7" },
  { name: "Rose",    value: "#fd79a8" },
];

const els = {
  contextPreview: document.getElementById("contextPreview"),
  form:           document.getElementById("tagForm"),
  tagInput:       document.getElementById("tagInput"),
  list:           document.getElementById("taggedList"),
  clearAllBtn:    document.getElementById("clearAllBtn"),
  colorPicker:    document.getElementById("colorPicker"),
  descInput:      document.getElementById("descInput"),
  filterInput:    document.getElementById("filterInput"),
};

let currentContext = null;
let taggedConversations = [];
let selectedColor = COLORS[0].value;
let filterText = "";

// --- Color picker ---
function buildColorPicker() {
  els.colorPicker.innerHTML = "";
  COLORS.forEach(c => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.title = c.name;
    btn.style.cssText = `width:20px;height:20px;border-radius:50%;background:${c.value};border:3px solid transparent;cursor:pointer;`;
    btn.addEventListener("click", () => {
      selectedColor = c.value;
      [...els.colorPicker.children].forEach(b => b.style.border = "3px solid transparent");
      btn.style.border = "3px solid white";
    });
    if (c.value === selectedColor) btn.style.border = "3px solid white";
    els.colorPicker.appendChild(btn);
  });
}

// --- Render ---
function formatDate(ts) {
  return new Date(ts).toLocaleString();
}

function appendText(parent, text) {
  parent.appendChild(document.createTextNode(text));
}

function createLink(href, text, className = "") {
  const link = document.createElement("a");
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = text;
  if (className) link.className = className;
  return link;
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function renderContext() {
  els.contextPreview.replaceChildren();

  if (!currentContext) {
    els.contextPreview.textContent = "No conversation selected yet.";
    return;
  }

  appendText(els.contextPreview, `@${currentContext.username || "Unknown"} `);
  if (currentContext.href && isValidUrl(currentContext.href)) {
    els.contextPreview.appendChild(createLink(currentContext.href, "Open chat"));
  }
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
  pill.style.background = item.color || "#ff4500";
  pill.textContent = item.tag;

  const date = document.createElement("span");
  date.className = "date";
  date.textContent = formatDate(item.createdAt);

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

  if (item.href && isValidUrl(item.href)) {
    listItem.appendChild(createLink(item.href, "Open chat", "link"));
  }

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
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((item) => {
      if (!query) return true;
      return [
        item.tag,
        item.username,
        item.description,
      ].some((value) => (value || "").toLowerCase().includes(query));
    });
}

function renderList() {
  const filtered = getFilteredConversations();

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

// --- Load / Save ---
async function loadState() {
  const data = await chrome.storage.local.get([CONTEXT_KEY, TAGS_KEY]);
  currentContext = data[CONTEXT_KEY] || null;
  taggedConversations = Array.isArray(data[TAGS_KEY]) ? data[TAGS_KEY] : [];
  renderContext();
  renderList();
}

async function save() {
  await chrome.storage.local.set({ [TAGS_KEY]: taggedConversations });
}

// --- Events ---
async function onSubmit(e) {
  e.preventDefault();
  const tag = els.tagInput.value.trim();
  if (!tag) return;
  if (!currentContext) {
    els.contextPreview.textContent = "Select a conversation first.";
    return;
  }
  taggedConversations.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    tag,
    color: selectedColor,
    username: currentContext.username || "Unknown",
    href: currentContext.href || "",
    description: els.descInput?.value.trim() || "",
    createdAt: Date.now()
  });
  await save();
  els.tagInput.value = "";
  if (els.descInput) els.descInput.value = "";
  renderList();
}

async function onClickList(e) {
  if (e.target.dataset.action !== "delete") return;
  if (!confirm("Delete this tag?")) return;
  taggedConversations = taggedConversations.filter(t => t.id !== e.target.dataset.id);
  await save();
  renderList();
}

async function clearAll() {
  if (!confirm("Clear all tags? This cannot be undone.")) return;
  taggedConversations = [];
  await save();
  renderList();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[CONTEXT_KEY]) { currentContext = changes[CONTEXT_KEY].newValue || null; renderContext(); }
  if (changes[TAGS_KEY]) { taggedConversations = Array.isArray(changes[TAGS_KEY].newValue) ? changes[TAGS_KEY].newValue : []; renderList(); }
});

els.form.addEventListener("submit", onSubmit);
els.list.addEventListener("click", onClickList);
els.clearAllBtn.addEventListener("click", clearAll);
els.filterInput?.addEventListener("input", e => { filterText = e.target.value; renderList(); });

buildColorPicker();
loadState();
