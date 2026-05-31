const { DEFAULT_TAG_COLOR, MESSAGE_TYPES, TAGGIT_KEYS } = globalThis.TaggitConstants;
const { createTagMap, getConversationId, getSafeChatHref } = globalThis.TaggitStorage;

const BUTTON_CLASS = "taggit-tag-btn";
const BUTTON_ATTR = "data-taggit-btn";
const BUTTON_BOUND_ATTR = "data-taggit-bound";
const STARTUP_RETRY_MS = 350;
const MAX_STARTUP_RETRIES = 25;
const BUTTON_RESERVED_SPACE = 76;

const SELECTORS = {
  app: "rs-app",
  roomsNav: "rs-rooms-nav",
  virtualScroll: "rs-virtual-scroll",
  room: "rs-rooms-nav-room",
  chatSurface: [
    "rs-room",
    "rs-conversation",
    "rs-chat-room",
    "rs-chat",
    "[aria-label*='Messages']",
    "[aria-label*='messages']",
    "main",
  ],
  messageCandidate: [
    "[data-testid*='message']",
    "[class*='message']",
    "[part*='message']",
    "[aria-label*='message']",
    "li",
    "p",
  ],
  chatAnchor: [
    "a[aria-label*='Direct chat']",
    "a[href*='/chat/channel/']",
    "a[href*='/chat/']",
  ],
  injectionTarget: [
    "a",
    "[role='link']",
    "[part='container']",
    "div[class*='relative']",
  ],
};

const JUNK_TEXT_PATTERNS = [
  /^tag$/i,
  /^save$/i,
  /^update$/i,
  /^open chat$/i,
  /^delete$/i,
  /^reddit$/i,
  /^search$/i,
  /^send$/i,
  /^message$/i,
  /^type a message$/i,
  /^online$/i,
  /^offline$/i,
  /^new chat$/i,
  /^settings$/i,
  /^premium$/i,
  /^advertise$/i,
  /^explore reddit communities$/i,
  /^page not found$/i,
  /^\d{1,2}:\d{2}\s*(am|pm)?$/i,
];
const MESSAGE_MIN_LENGTH = 2;
const MESSAGE_MAX_LENGTH = 1200;
const SUMMARY_MESSAGE_LIMIT = 80;

function hasExtensionContext() {
  try {
    return Boolean(globalThis.chrome?.runtime?.id);
  } catch {
    return false;
  }
}

function isContextInvalidatedError(error) {
  return /Extension context invalidated/i.test(String(error?.message || error || ""));
}

async function safeChromeCall(label, callback, fallback = null) {
  if (!hasExtensionContext()) return fallback;

  try {
    return await callback();
  } catch (error) {
    if (!isContextInvalidatedError(error)) {
      console.warn(`[Taggit] ${label} failed.`, error);
    }
    return fallback;
  }
}

window.addEventListener("error", (event) => {
  if (isContextInvalidatedError(event.error || event.message)) {
    globalThis.__taggitInjector?.shutdownFromInvalidContext?.();
    event.preventDefault();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (isContextInvalidatedError(event.reason)) {
    globalThis.__taggitInjector?.shutdownFromInvalidContext?.();
    event.preventDefault();
  }
});

async function sendRuntimeMessageSafe(message, retries = 1) {
  return safeChromeCall("Runtime message", async () => {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (retries <= 0) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      return sendRuntimeMessageSafe(message, retries - 1);
    }
  });
}

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

function getDeepElements(root, selectors, results = [], options = {}) {
  if (!root) return results;

  selectors.forEach((selector) => {
    try {
      root.querySelectorAll(selector).forEach((element) => results.push(element));
    } catch {
      // Ignore Reddit selector/runtime changes.
    }
  });

  root.querySelectorAll("*").forEach((element) => {
    if (options.skipElement?.(element)) return;
    if (element.shadowRoot) getDeepElements(element.shadowRoot, selectors, results, options);
  });

  return results;
}

function getElementText(element) {
  return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
}

function isJunkText(text) {
  if (!text) return true;
  if (text.length < MESSAGE_MIN_LENGTH || text.length > MESSAGE_MAX_LENGTH) return true;
  if (/^[\W_]+$/u.test(text)) return true;
  if (JUNK_TEXT_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return false;
}

function isInteractiveOrNavigation(element) {
  const tagName = element.tagName?.toLowerCase() || "";
  const role = element.getAttribute?.("role") || "";
  const text = getElementText(element).toLowerCase();

  if (["button", "input", "textarea", "select", "nav"].includes(tagName)) return true;
  if (["button", "navigation", "searchbox", "textbox"].includes(role)) return true;
  if (text === "tag" || text === "open chat") return true;
  return false;
}

function findConversationRoot() {
  const app = document.querySelector(SELECTORS.app);
  const appRoot = app?.shadowRoot || document.body;
  const surfaces = getDeepElements(appRoot, SELECTORS.chatSurface, [], {
    skipElement: (element) => element.matches?.(SELECTORS.roomsNav),
  })
    .filter((element) => isVisibleElement(element))
    .filter((element) => !element.closest?.(SELECTORS.roomsNav));

  return surfaces.sort((a, b) => getElementText(b).length - getElementText(a).length)[0] || appRoot;
}

function inferAuthor(element, fallbackUsername = "") {
  const container = element.closest?.("[data-author], [author], [aria-label], [data-testid*='message']");
  const directAuthor =
    container?.getAttribute?.("data-author") ||
    container?.getAttribute?.("author") ||
    "";
  const ariaLabel = container?.getAttribute?.("aria-label") || "";
  const ariaAuthor = ariaLabel.match(/(?:from|by)\s+([^,]+)/i)?.[1] || "";
  return (directAuthor || ariaAuthor || fallbackUsername || "Unknown").trim();
}

function getActiveRoomContext() {
  const selected =
    document.querySelector(`${SELECTORS.room}[aria-selected='true']`) ||
    document.querySelector(`${SELECTORS.room}[active]`);

  if (selected?.shadowRoot) {
    const injector = globalThis.__taggitInjector;
    return injector?.getContext?.(selected.shadowRoot) || {};
  }

  return {};
}

function extractConversation() {
  const root = findConversationRoot();
  const context = getActiveRoomContext();
  const candidates = getDeepElements(root, SELECTORS.messageCandidate, [], {
    skipElement: (element) => element.matches?.(SELECTORS.roomsNav),
  })
    .filter((element) => isVisibleElement(element))
    .filter((element) => !isInteractiveOrNavigation(element));
  const seen = new Set();
  const messages = [];

  candidates.forEach((element) => {
    const text = getElementText(element);
    if (isJunkText(text)) return;

    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    messages.push({
      author: inferAuthor(element, context.username),
      text,
      timestamp: element.querySelector?.("time")?.getAttribute("datetime") || null,
    });
  });

  const cleanMessages = messages.slice(-SUMMARY_MESSAGE_LIMIT);
  const participants = [...new Set(cleanMessages.map((message) => message.author).filter(Boolean))];

  return {
    roomId: context.conversationId || getConversationId(context) || window.location.href,
    participants,
    messages: cleanMessages,
  };
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
    this.instanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.onStorageChanged = this.handleStorageChange.bind(this);
    this.start();
  }

  start() {
    this.loadTags();
    this.observeRoot(document.documentElement);
    if (hasExtensionContext()) {
      chrome.storage.onChanged.addListener(this.onStorageChanged);
    }
    this.scheduleScan();
    this.scheduleStartupRetry();
  }

  stop() {
    this.active = false;
    window.clearTimeout(this.retryTimer);
    if (hasExtensionContext()) {
      chrome.storage.onChanged.removeListener(this.onStorageChanged);
    }
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
  }

  shutdownFromInvalidContext() {
    try {
      this.stop();
    } catch {
      this.active = false;
    }
  }

  handleStorageChange(changes, area) {
    if (!this.active || area !== "local") return;

    const tagsChange = changes[TAGGIT_KEYS.tags];
    if (!tagsChange) return;

    this.tagMap = createTagMap(tagsChange.newValue);
    this.scheduleScan();
  }

  async loadTags() {
    return safeChromeCall("Load tags", async () => {
      const data = await chrome.storage.local.get(TAGGIT_KEYS.tags);
      this.tagMap = createTagMap(data[TAGGIT_KEYS.tags]);
      this.scheduleScan();
    });
  }

  observeRoot(rootNode) {
    if (!rootNode || this.observedRoots.has(rootNode)) return;

    this.observedRoots.add(rootNode);
    const observer = new MutationObserver(() => {
      try {
        this.scheduleScan();
      } catch (error) {
        if (isContextInvalidatedError(error)) this.shutdownFromInvalidContext();
      }
    });
    observer.observe(rootNode, { childList: true, subtree: true });
    this.observers.push(observer);
  }

  scheduleStartupRetry() {
    if (this.retryCount >= MAX_STARTUP_RETRIES) return;

    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      try {
        if (!this.active) return;
        this.retryCount += 1;
        if (!this.scanAndInject()) {
          this.scheduleStartupRetry();
        }
      } catch (error) {
        if (isContextInvalidatedError(error)) this.shutdownFromInvalidContext();
      }
    }, STARTUP_RETRY_MS);
  }

  scheduleScan() {
    if (!this.active || this.scheduled || !hasExtensionContext() || !isTargetPage()) return;

    this.scheduled = true;
    requestAnimationFrame(() => {
      try {
        if (!this.active || !hasExtensionContext()) return;
        this.scheduled = false;
        this.scanAndInject();
      } catch (error) {
        this.scheduled = false;
        if (isContextInvalidatedError(error)) {
          this.shutdownFromInvalidContext();
          return;
        }
        console.warn("[Taggit] Scan frame failed.", error);
      }
    });
  }

  scanAndInject() {
    if (!this.active || !hasExtensionContext() || !isTargetPage()) return false;

    try {
      const virtualScroll = this.findRoomsRoot();
      if (!virtualScroll?.shadowRoot) return false;

      const rooms = virtualScroll.shadowRoot.querySelectorAll(SELECTORS.room);
      rooms.forEach((room) => this.prepareRoom(room));
      return rooms.length > 0;
    } catch (error) {
      if (isContextInvalidatedError(error)) {
        this.shutdownFromInvalidContext();
        return false;
      }
      console.warn("[Taggit] Failed to scan Reddit chat DOM.", error);
      return false;
    }
  }

  findRoomsRoot() {
    try {
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
    } catch (error) {
      if (isContextInvalidatedError(error)) this.shutdownFromInvalidContext();
      return null;
    }
  }

  prepareRoom(room) {
    if (!room?.shadowRoot) return;

    this.observeRoom(room);
    this.ensureButton(room);
  }

  observeRoom(room) {
    if (this.observedRooms.has(room)) return;

    this.observedRooms.add(room);
    const observer = new MutationObserver(() => {
      try {
        this.scheduleScan();
      } catch (error) {
        if (isContextInvalidatedError(error)) this.shutdownFromInvalidContext();
      }
    });
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
    const href =
      getSafeChatHref(getAbsoluteHref(rawHref)) ||
      getSafeChatHref(window.location.href) ||
      "";
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
    const color = existing?.color || DEFAULT_TAG_COLOR;

    button.textContent = existing?.tag || "Tag";
    button.style.background = `linear-gradient(135deg, ${color}, ${color})`;
    button.style.boxShadow = `0 8px 20px ${color}33, 0 2px 8px rgba(0,0,0,0.18)`;
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
    if (button && button.getAttribute(BUTTON_BOUND_ATTR) !== this.instanceId) {
      button.remove();
      button = null;
    }

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = BUTTON_CLASS;
      button.setAttribute(BUTTON_ATTR, "1");
      button.setAttribute(BUTTON_BOUND_ATTR, this.instanceId);

      Object.assign(button.style, {
        position: "absolute",
        right: "10px",
        top: "50%",
        transform: "translateY(-50%)",
        color: "#0b1018",
        border: "1px solid rgba(255,255,255,0.42)",
        borderRadius: "9999px",
        padding: "3px 9px",
        maxWidth: "68px",
        fontSize: "11px",
        fontWeight: "700",
        lineHeight: "1.2",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        cursor: "pointer",
        opacity: "0.94",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        transition: "opacity 120ms ease, transform 120ms ease, box-shadow 120ms ease",
        zIndex: "20",
      });

      button.addEventListener("mouseenter", () => {
        button.style.opacity = "1";
        button.style.transform = "translateY(-50%) scale(1.04)";
      });

      button.addEventListener("mouseleave", () => {
        button.style.opacity = "0.94";
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

        safeChromeCall("Save selected chat", () =>
          chrome.storage.local.set({ [TAGGIT_KEYS.context]: selectedContext })
        );

        sendRuntimeMessageSafe({
          type: MESSAGE_TYPES.openSidebar,
          ...selectedContext,
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
  try {
    if (!hasExtensionContext()) {
      globalThis.__taggitInjector?.stop?.();
      globalThis.__taggitInjector = null;
      return;
    }

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
  } catch (error) {
    if (!isContextInvalidatedError(error)) {
      console.warn("[Taggit] Route sync failed.", error);
    }
  }
}

watchRedditRouteChanges();
window.addEventListener("taggit:location-change", () => {
  try {
    syncInjectorWithRoute();
  } catch (error) {
    if (!isContextInvalidatedError(error)) {
      console.warn("[Taggit] Route change failed.", error);
    }
  }
});

if (hasExtensionContext()) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== MESSAGE_TYPES.collectChatMessages) return false;

    try {
      const conversation = extractConversation();
      sendResponse({ ok: true, conversation, messages: conversation.messages });
    } catch (error) {
      console.warn("[Taggit] Failed to collect chat messages.", error);
      sendResponse({ ok: false, conversation: null, messages: [] });
    }

    return false;
  });
}
syncInjectorWithRoute();
