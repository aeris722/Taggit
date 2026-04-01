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
function formatDate(ts) { return new Date(ts).toLocaleString(); }
function esc(v) {
  return v.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function renderContext() {
  if (!currentContext) {
    els.contextPreview.textContent = "No conversation selected yet.";
  } else {
    els.contextPreview.innerHTML = currentContext.href
      ? `@${esc(currentContext.username)} &nbsp;<a href="${esc(currentContext.href)}" target="_blank" style="color:#8dc1ff;font-size:11px;">Open chat ↗</a>`
      : `@${esc(currentContext.username)}`;
  }
}

function renderList() {
  const filtered = taggedConversations
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter(item => !filterText || item.tag.toLowerCase().includes(filterText.toLowerCase()) || (item.username||"").toLowerCase().includes(filterText.toLowerCase()));

  if (!filtered.length) {
    els.list.innerHTML = '<li class="empty">No tagged conversations yet.</li>';
    return;
  }

  els.list.innerHTML = filtered.map(item => `
    <li class="tagged-item" data-id="${item.id}">
      <div class="tagged-top">
        <span class="tag-pill" style="background:${esc(item.color||'#ff4500')}">${esc(item.tag)}</span>
        <span class="date">${formatDate(item.createdAt)}</span>
      </div>
      <p class="username">@${esc(item.username || "Unknown")}</p>
      ${item.description ? `<p class="desc">${esc(item.description)}</p>` : ""}
      ${item.href ? `<a class="link" href="${esc(item.href)}" target="_blank" rel="noreferrer">Open chat ↗</a>` : ""}
      <div class="item-actions">
        <button class="delete-btn" type="button" data-action="delete" data-id="${item.id}">Delete</button>
      </div>
    </li>
  `).join("");
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