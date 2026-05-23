const { DEFAULT_TAG_COLOR, MESSAGE_TYPES, TAGGIT_KEYS } = globalThis.TaggitConstants;
const { createTagMap, getConversationId, getSafeChatHref } = globalThis.TaggitStorage;

const BUTTON_CLASS = "taggit-tag-btn";
const BUTTON_ATTR = "data-taggit-btn";
const STARTUP_RETRY_MS = 350;
const MAX_STARTUP_RETRIES = 25;
const BUTTON_RESERVED_SPACE = 76;

const SELECTORS = {
  app: "rs-app",
  roomsNav: "rs-rooms-nav",
  virtualScroll: "rs-virtual-scroll",
  room: "rs-rooms-nav-room",
  chatAnchor: [
    "a[aria-label*='Direct chat']",
    "a[href*='/chat/channel/']",
    "a[href*='/chat/']",
    "a",
  ],
  injectionTarget: [
    "[role='link']",
    "a",
    "[part='container']",
    "div[class*='relative']",
    "div",
  ],
};

const MESSAGE_TEXT_SKIP_PATTERNS = [
  /^tag$/i,
  /^open chat$/i,
  /^delete$/i,
  /^reddit$/i,
  /^search$/i,
  /^send$/i,
  /^message$/i,
];

function isTargetPage() {
  const host = window.location.hostname || "";
  const path = window.location.pathname || "";
  const isReddit = host === "reddit.com" || host.endsWith(".reddit.com");
  return isReddit && path.startsWith("/chat");
}

function queryFirst(root, selectors) {
  for (const selector of selectors) {
    const match = root.querySelector(selector);
    if (match) return match;
  }

  return null;
}

function getAbsoluteHref(rawHref) {
  if (!rawHref) return "";

  try {
    return new URL(rawHref, window.location.origin).href;
  } catch {
    return "";
  }
}

function isVisibleElement(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function collectVisibleText(root, lines = []) {
  if (!root) return lines;

  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.replace(/\s+/g, " ").trim();
      if (
        text.length > 1 &&
        !MESSAGE_TEXT_SKIP_PATTERNS.some((pattern) => pattern.test(text))
      ) {
        lines.push(text);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node;
    if (!isVisibleElement(element)) return;

    if (element.shadowRoot) {
      collectVisibleText(element.shadowRoot, lines);
    }

    collectVisibleText(element, lines);
  });

  return lines;
}

function collectChatMessages() {
  const app = document.querySelector(SELECTORS.app);
  const root = app?.shadowRoot || document.body;
  const uniqueLines = [];
  const seen = new Set();

  collectVisibleText(root).forEach((line) => {
    const normalized = line.toLowerCase();
    if (seen.has(normalized)) return;
    seen.add(normalized);
    uniqueLines.push({ author: "", text: line });
  });

  return uniqueLines.slice(-80);
}

class RedditChatTagInjector {
  constructor() {
    this.active = true;
    this.scheduled = false;
    this.retryCount = 0;
    this.retryTimer = null;
    this.observers = [];
    this.observedRoots = new WeakSet();
    this.observedRooms = new WeakSet();
    this.tagMap = new Map();
    this.onStorageChanged = this.handleStorageChange.bind(this);
    this.start();
  }

  start() {
    this.loadTags();
    this.observeRoot(document.documentElement);
    chrome.storage.onChanged.addListener(this.onStorageChanged);
    this.scheduleScan();
    this.scheduleStartupRetry();
  }

  stop() {
    this.active = false;
    window.clearTimeout(this.retryTimer);
    chrome.storage.onChanged.removeListener(this.onStorageChanged);
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
  }

  handleStorageChange(changes, area) {
    if (!this.active || area !== "local") return;

    const tagsChange = changes[TAGGIT_KEYS.tags];
    if (!tagsChange) return;

    this.tagMap = createTagMap(tagsChange.newValue);
    this.scheduleScan();
  }

  async loadTags() {
    try {
      const data = await chrome.storage.local.get(TAGGIT_KEYS.tags);
      this.tagMap = createTagMap(data[TAGGIT_KEYS.tags]);
      this.scheduleScan();
    } catch (error) {
      console.warn("[Taggit] Failed to load tags.", error);
    }
  }

  observeRoot(rootNode) {
    if (!rootNode || this.observedRoots.has(rootNode)) return;

    this.observedRoots.add(rootNode);
    const observer = new MutationObserver(() => this.scheduleScan());
    observer.observe(rootNode, { childList: true, subtree: true });
    this.observers.push(observer);
  }

  scheduleStartupRetry() {
    if (this.retryCount >= MAX_STARTUP_RETRIES) return;

    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      if (!this.active) return;
      this.retryCount += 1;
      if (!this.scanAndInject()) {
        this.scheduleStartupRetry();
      }
    }, STARTUP_RETRY_MS);
  }

  scheduleScan() {
    if (!this.active || this.scheduled || !isTargetPage()) return;

    this.scheduled = true;
    requestAnimationFrame(() => {
      if (!this.active) return;
      this.scheduled = false;
      this.scanAndInject();
    });
  }

  scanAndInject() {
    if (!this.active || !isTargetPage()) return false;

    try {
      const virtualScroll = this.findRoomsRoot();
      if (!virtualScroll?.shadowRoot) return false;

      const rooms = virtualScroll.shadowRoot.querySelectorAll(SELECTORS.room);
      rooms.forEach((room) => this.prepareRoom(room));
      return rooms.length > 0;
    } catch (error) {
      console.warn("[Taggit] Failed to scan Reddit chat DOM.", error);
      return false;
    }
  }

  findRoomsRoot() {
    const app = document.querySelector(SELECTORS.app);
    if (!app?.shadowRoot) return null;
    this.observeRoot(app.shadowRoot);

    const roomsNav = app.shadowRoot.querySelector(SELECTORS.roomsNav);
    if (!roomsNav?.shadowRoot) return null;
    this.observeRoot(roomsNav.shadowRoot);

    const virtualScroll = roomsNav.shadowRoot.querySelector(SELECTORS.virtualScroll);
    if (!virtualScroll?.shadowRoot) return null;
    this.observeRoot(virtualScroll.shadowRoot);

    return virtualScroll;
  }

  prepareRoom(room) {
    if (!room?.shadowRoot) return;

    this.observeRoom(room);
    this.ensureButton(room);
  }

  observeRoom(room) {
    if (this.observedRooms.has(room)) return;

    this.observedRooms.add(room);
    const observer = new MutationObserver(() => this.scheduleScan());
    observer.observe(room.shadowRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "href", "class"],
    });
    this.observers.push(observer);
  }

  getContext(roomShadowRoot) {
    const anchor = queryFirst(roomShadowRoot, SELECTORS.chatAnchor);
    if (!anchor) return { username: "", href: "", conversationId: "" };

    const ariaLabel = anchor.getAttribute("aria-label") || "";
    const rawHref = anchor.getAttribute("href") || "";
    const href = getSafeChatHref(getAbsoluteHref(rawHref)) || "https://www.reddit.com/chat/";
    const usernameFromLabel = ariaLabel
      .replace(/^Direct chat(?: with)?\s*/i, "")
      .replace(/\s*\(.*\)\s*$/, "")
      .trim();
    const username = usernameFromLabel || anchor.textContent.trim() || ariaLabel || "Unknown";
    const conversationId = getConversationId({ href, username });

    return { username, href, conversationId };
  }

  findInjectionTarget(root) {
    const target = queryFirst(root, SELECTORS.injectionTarget);
    return target || root;
  }

  updateRoomButton(room) {
    const button = room.shadowRoot?.querySelector(`button.${BUTTON_CLASS}[${BUTTON_ATTR}="1"]`);
    if (button) this.updateButton(button, room.shadowRoot);
  }

  updateButton(button, root) {
    const context = this.getContext(root);
    const existing = this.tagMap.get(context.conversationId);

    button.textContent = existing?.tag || "Tag";
    button.style.background = existing?.color || DEFAULT_TAG_COLOR;
    button.title = existing ? `Tagged: ${existing.tag}` : "Tag this Reddit chat";
    button.setAttribute(
      "aria-label",
      existing ? `Open Taggit for ${existing.username || context.username}` : "Add Taggit tag"
    );
  }

  ensureButton(room) {
    const root = room.shadowRoot;
    const target = this.findInjectionTarget(root);
    if (!target) return;

    let button = root.querySelector(`button.${BUTTON_CLASS}[${BUTTON_ATTR}="1"]`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = BUTTON_CLASS;
      button.setAttribute(BUTTON_ATTR, "1");

      Object.assign(button.style, {
        position: "absolute",
        right: "10px",
        top: "50%",
        transform: "translateY(-50%)",
        color: "#111",
        border: "none",
        borderRadius: "9999px",
        padding: "2px 8px",
        maxWidth: "68px",
        fontSize: "11px",
        fontWeight: "700",
        lineHeight: "1.2",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        cursor: "pointer",
        opacity: "0.92",
        zIndex: "20",
      });

      button.addEventListener("mouseenter", () => {
        button.style.opacity = "1";
        button.style.transform = "translateY(-50%) scale(1.04)";
      });

      button.addEventListener("mouseleave", () => {
        button.style.opacity = "0.92";
        button.style.transform = "translateY(-50%)";
      });

      button.addEventListener("focus", () => {
        button.style.outline = "2px solid rgba(255,255,255,0.75)";
        button.style.outlineOffset = "2px";
      });

      button.addEventListener("blur", () => {
        button.style.outline = "none";
      });

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const context = this.getContext(root);
        const existing = this.tagMap.get(context.conversationId);
        const selectedContext = {
          username: existing?.username || context.username,
          href: existing?.href || context.href,
          conversationId: existing?.conversationId || context.conversationId,
          updatedAt: Date.now(),
        };

        chrome.storage.local.set({ [TAGGIT_KEYS.context]: selectedContext }).catch((error) => {
          console.warn("[Taggit] Failed to save selected chat.", error);
        });

        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.openSidebar,
          ...selectedContext,
        }).catch((error) => {
          console.warn("[Taggit] Failed to open sidebar.", error);
        });
      });
    }

    if (!button.isConnected || button.parentElement !== target) {
      target.appendChild(button);
    }

    this.updateButton(button, root);

    if (target instanceof HTMLElement && window.getComputedStyle(target).position === "static") {
      target.style.position = "relative";
    }

    if (target instanceof HTMLElement) {
      const currentPadding = Number.parseFloat(window.getComputedStyle(target).paddingRight) || 0;
      if (currentPadding < BUTTON_RESERVED_SPACE) {
        target.style.paddingRight = `${BUTTON_RESERVED_SPACE}px`;
      }
    }
  }
}

function watchRedditRouteChanges() {
  if (globalThis.__taggitRouteWatcherInstalled) return;
  globalThis.__taggitRouteWatcherInstalled = true;

  const notifyRouteChange = () => {
    window.dispatchEvent(new Event("taggit:location-change"));
  };

  ["pushState", "replaceState"].forEach((methodName) => {
    const originalMethod = history[methodName];
    history[methodName] = function (...args) {
      const result = originalMethod.apply(this, args);
      notifyRouteChange();
      return result;
    };
  });

  window.addEventListener("popstate", notifyRouteChange);
}

function syncInjectorWithRoute() {
  if (isTargetPage()) {
    if (!globalThis.__taggitInjector) {
      globalThis.__taggitInjector = new RedditChatTagInjector();
    }
    return;
  }

  if (globalThis.__taggitInjector) {
    globalThis.__taggitInjector.stop();
    globalThis.__taggitInjector = null;
  }
}

watchRedditRouteChanges();
window.addEventListener("taggit:location-change", syncInjectorWithRoute);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== MESSAGE_TYPES.collectChatMessages) return false;

  try {
    sendResponse({ ok: true, messages: collectChatMessages() });
  } catch (error) {
    console.warn("[Taggit] Failed to collect chat messages.", error);
    sendResponse({ ok: false, messages: [] });
  }

  return false;
});
syncInjectorWithRoute();
