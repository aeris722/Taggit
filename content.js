const BUTTON_CLASS = "threadvault-tag-btn";
const BUTTON_ATTR = "data-threadvault-btn";
const CHAIN_POLL_MS = 1000;

function isTargetPage() {
  const host = window.location.hostname || "";
  const path = window.location.pathname || "";
  const isReddit = host === "reddit.com" || host.endsWith(".reddit.com");
  return isReddit && path.startsWith("/chat/");
}

class RedditChatTagInjector {
  constructor() {
    this.scheduled = false;
    this.observedRoots = new WeakSet();
    this.observedRooms = new WeakSet();
    this.start();
  }

  start() {
    this.observeRoot(document.documentElement);
    this.scheduleScan();
    setInterval(() => this.scheduleScan(), CHAIN_POLL_MS);
  }

  observeRoot(rootNode) {
    if (!rootNode || this.observedRoots.has(rootNode)) return;
    this.observedRoots.add(rootNode);
    const observer = new MutationObserver(() => this.scheduleScan());
    observer.observe(rootNode, { childList: true, subtree: true });
  }

  scheduleScan() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.scanAndInject();
    });
  }

  scanAndInject() {
    const app = document.querySelectorAll("rs-app")[0];
    if (!app || !app.shadowRoot) return;
    this.observeRoot(app.shadowRoot);

    const roomsNav = app.shadowRoot.querySelector("rs-rooms-nav");
    if (!roomsNav || !roomsNav.shadowRoot) return;
    this.observeRoot(roomsNav.shadowRoot);

    const virtualScroll = roomsNav.shadowRoot.querySelector("rs-virtual-scroll");
    if (!virtualScroll || !virtualScroll.shadowRoot) return;
    this.observeRoot(virtualScroll.shadowRoot);

    const rooms = virtualScroll.shadowRoot.querySelectorAll("rs-rooms-nav-room");
    rooms.forEach((room) => {
      if (!room.shadowRoot) return;
      this.observeRoom(room);
      this.ensureButton(room);
    });
  }

  observeRoom(room) {
    if (this.observedRooms.has(room)) return;
    this.observedRooms.add(room);
    const observer = new MutationObserver(() => this.scheduleScan());
    observer.observe(room.shadowRoot, { childList: true, subtree: true, attributes: true });
  }

  getContext(roomShadowRoot) {
    const anchor = roomShadowRoot.querySelector("a[aria-label*='Direct chat']");
    if (!anchor) return { username: "", href: "" };

    const ariaLabel = anchor.getAttribute("aria-label") || "";
    const username = ariaLabel
      .replace(/^Direct chat(?: with)?\s*/i, "")
      .replace(/\s*\(.*\)\s*$/, "")
      .trim();

    // Fix href — use full absolute URL
    const rawHref = anchor.getAttribute("href") || "";
    const href = rawHref.startsWith("http")
      ? rawHref
      : `https://www.reddit.com/chat${rawHref}`;

    return { username: username || ariaLabel, href };
  }

  ensureButton(room) {
    const root = room.shadowRoot;
    const target = root.querySelector("div.relative");
    if (!target) return;

    let button = target.querySelector(`button.${BUTTON_CLASS}[${BUTTON_ATTR}="1"]`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = BUTTON_CLASS;
      button.setAttribute(BUTTON_ATTR, "1");
      button.textContent = "Tag";

      Object.assign(button.style, {
        position: "absolute",
        right: "8px",
        top: "50%",
        transform: "translateY(-50%)",
        background: "#ff8c00",
        color: "#111",
        border: "none",
        borderRadius: "9999px",
        padding: "2px 8px",
        fontSize: "11px",
        lineHeight: "1.2",
        cursor: "pointer",
        zIndex: "20"
      });

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const { username, href } = this.getContext(root);
        chrome.runtime.sendMessage({
          type: "THREADVAULT_OPEN_SIDEBAR",
          username,
          href
        });
      });

      target.appendChild(button);
    }

    // Update button label if this username is already tagged
    chrome.storage.local.get(['threadVaultTaggedConversations'], (data) => {
      const tags = data.threadVaultTaggedConversations || [];
      const { username } = this.getContext(root);
      const existing = tags.find(t => t.username === username);
      if (existing) {
        button.textContent = existing.tag;
        button.style.background = existing.color || "#ff8c00";
      } else {
        button.textContent = "Tag";
        button.style.background = "#ff8c00";
      }
    });

    if (window.getComputedStyle(target).position === "static") {
      target.style.position = "relative";
    }
  }
}

if (isTargetPage()) {
  new RedditChatTagInjector();
}