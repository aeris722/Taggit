importScripts("../utils/constants.js", "../utils/storage.js");

const { MESSAGE_TYPES } = globalThis.TaggitConstants;

const {
  getBestChatHref,
  getConversationId,
  saveContext,
} = globalThis.TaggitStorage;

chrome.runtime.onInstalled.addListener(() => {
  if (!chrome.sidePanel) {
    console.warn("[Taggit] Side Panel API is not available.");
    return;
  }

  chrome.sidePanel
    .setPanelBehavior({
      openPanelOnActionClick: true,
    })
    .catch((error) => {
      console.warn(
        "[Taggit] Unable to set side panel behavior.",
        error
      );
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message?.type) {
    case MESSAGE_TYPES.openChat: {
      const fallbackUrl = "https://www.reddit.com/chat/";
      const url = getBestChatHref(message) || fallbackUrl;

      chrome.tabs
        .create({ url })
        .then(() => {
          sendResponse({ ok: true });
        })
        .catch((error) => {
          console.warn("[Taggit] Unable to open chat.", error);

          sendResponse({
            ok: false,
            error: error?.message,
          });
        });

      return true;
    }

    case MESSAGE_TYPES.openSidebar: {
      if (!chrome.sidePanel) {
        sendResponse({
          ok: false,
          error: "Side Panel API not supported.",
        });
        return false;
      }

      const tabId = sender?.tab?.id;

      if (typeof tabId !== "number") {
        sendResponse({
          ok: false,
          error: "Missing tab id.",
        });
        return false;
      }

      const href = getBestChatHref(message);

      const context = {
        username: message.username || "Unknown",
        href,
        conversationId:
          message.conversationId ||
          getConversationId(message),
        updatedAt: Date.now(),
      };

      Promise.all([
        chrome.sidePanel.open({ tabId }),
        saveContext(context),
      ])
        .then(() => {
          sendResponse({ ok: true });
        })
        .catch((error) => {
          console.warn(
            "[Taggit] Unable to open side panel.",
            error
          );

          sendResponse({
            ok: false,
            error: error?.message,
          });
        });

      return true;
    }

    default:
      return false;
  }
});