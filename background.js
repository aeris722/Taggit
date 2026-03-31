const CONTEXT_KEY = "threadVaultCurrentContext";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "THREADVAULT_OPEN_SIDEBAR") {
    return false;
  }

  const tabId = sender.tab && typeof sender.tab.id === "number" ? sender.tab.id : null;
  if (tabId === null) {
    sendResponse({ ok: false, error: "No sender tab available." });
    return false;
  }

  const context = {
    page: message.context?.page || message.context?.url || "",
    conversationText:
      message.context?.conversationText ||
      message.context?.label ||
      message.context?.username ||
      "",
    conversationHref: message.context?.conversationHref || message.context?.url || "",
    roomId: message.context?.roomId || "",
    username: message.context?.username || "",
    updatedAt: Date.now()
  };

  chrome.storage.local
    .set({ [CONTEXT_KEY]: context })
    .then(() => chrome.sidePanel.open({ tabId }))
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : "Failed to open side panel."
      });
    });

  return true;
});
