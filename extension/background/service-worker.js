importScripts("../utils/constants.js", "../utils/storage.js");

const { MESSAGE_TYPES } = globalThis.TaggitConstants;
const { getBestChatHref, getConversationId, getSafeChatHref, saveContext } = globalThis.TaggitStorage;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.warn("[Taggit] Unable to set side panel behavior.", error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const isOpenSidebarMessage =
    message?.type === MESSAGE_TYPES.openSidebar;

  if (message?.type === MESSAGE_TYPES.openChat) {
    const fallbackUrl = "https://www.reddit.com/chat/";
    const url = getBestChatHref(message) || fallbackUrl;

    chrome.tabs
      .create({ url })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.warn("[Taggit] Unable to open chat.", error);
        sendResponse({ ok: false });
      });

    return true;
  }

  if (!isOpenSidebarMessage) return false;

  const tabId = sender.tab?.id;
  if (!tabId) {
    sendResponse({ ok: false });
    return false;
  }

  const context = {
    username: message.username || "Unknown",
    href: getBestChatHref(message),
    conversationId: message.conversationId || getConversationId(message),
    updatedAt: Date.now(),
  };

  Promise.all([
    chrome.sidePanel.open({ tabId }),
    saveContext(context),
  ])
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.warn("[Taggit] Unable to open side panel.", error);
      sendResponse({ ok: false });
    });

  return true;
});
