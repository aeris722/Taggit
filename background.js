const CONTEXT_KEY = "threadVaultCurrentContext";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "THREADVAULT_OPEN_SIDEBAR") return false;

  const tabId = sender.tab?.id ?? null;
  if (tabId === null) { sendResponse({ ok: false }); return false; }

  const context = {
    username: message.username || "Unknown",
    href: message.href || "",
    updatedAt: Date.now()
  };

  chrome.storage.local
    .set({ [CONTEXT_KEY]: context })
    .then(() => chrome.sidePanel.open({ tabId }))
    .then(() => sendResponse({ ok: true }))
    .catch(() => sendResponse({ ok: false }));

  return true;
});