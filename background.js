chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => {
    console.error(error);
  });

chrome.tabs.onActivated.addListener((info) => {
  rememberWebTab(info.tabId);
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === "complete")) {
    rememberFromTab(tab);
  }
});

chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
  if (tabs[0]) rememberFromTab(tabs[0]);
});

const injecting = new Set();

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "gesture") {
    const senderTabId = sender.tab?.id;
    deliver(senderTabId, { type: "scroll", direction: scrollDirection(message.name) }).catch((error) => {
      console.error(error);
    });
    if (message.name === "Closed_Fist") {
      goBack(senderTabId).catch((error) => console.error(error));
    } else if (message.name === "ILoveYou") {
      activateNextTab(senderTabId).catch((error) => console.error(error));
    }
    return;
  }

  if (message?.type === "pointer") {
    deliver(sender.tab?.id, {
      type: "pointer",
      active: message.active,
      x: message.x,
      y: message.y,
      move: message.move,
      click: message.click,
    }).catch((error) => {
      console.error(error);
    });
  }
});

function scrollDirection(name) {
  if (name === "Thumb_Up") return "up";
  if (name === "Thumb_Down") return "down";
  return "stop";
}

async function goBack(senderTabId) {
  const tab = await browserTab(senderTabId);
  if (!tab) return;
  await chrome.tabs.goBack(tab.id);
}

async function activateNextTab(senderTabId) {
  const tab = await browserTab(senderTabId);
  if (!tab) return;

  const tabs = await chrome.tabs.query({ windowId: tab.windowId });
  if (tabs.length < 2) return;

  tabs.sort((a, b) => a.index - b.index);
  const index = Math.max(0, tabs.findIndex((item) => item.id === tab.id));
  const next = tabs[(index + 1) % tabs.length];
  if (!next || next.id === tab.id) return;
  await chrome.tabs.update(next.id, { active: true });
}

async function browserTab(senderTabId) {
  const anchorId = await scrollTargetTabId(senderTabId);
  if (anchorId == null) return null;

  const anchor = await chrome.tabs.get(anchorId);
  const [active] = await chrome.tabs.query({ windowId: anchor.windowId, active: true });
  return active ?? anchor;
}

async function deliver(senderTabId, message) {
  const tabId = await scrollTargetTabId(senderTabId);
  if (tabId == null || injecting.has(tabId)) return;

  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    injecting.add(tabId);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      await chrome.tabs.sendMessage(tabId, message);
    } finally {
      injecting.delete(tabId);
    }
  }
}

async function scrollTargetTabId(senderTabId) {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (isWebTab(active) && active.id !== senderTabId) return active.id;

  const stored = await chrome.storage.session.get("scrollTabId");
  if (typeof stored.scrollTabId === "number" && stored.scrollTabId !== senderTabId) {
    return stored.scrollTabId;
  }

  if (isWebTab(active)) return active.id;
  return null;
}

function rememberWebTab(tabId) {
  chrome.tabs.get(tabId).then(rememberFromTab).catch(() => {});
}

function rememberFromTab(tab) {
  if (!isWebTab(tab)) return;
  chrome.storage.session.set({ scrollTabId: tab.id });
}

function isWebTab(tab) {
  return Boolean(tab?.id && tab.url && /^https?:/i.test(tab.url));
}
