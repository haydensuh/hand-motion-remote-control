chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((error) => {
  console.error(error);
});

chrome.action.onClicked.addListener((tab) => {
  if (tab) {
    rememberFromTab(tab);
    if (typeof tab.windowId === "number") {
      chrome.storage.session.set({ browserWindowId: tab.windowId });
    }
  }
  openCameraWindow().catch((error) => console.error(error));
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
  if (message?.type === "return-to-page") {
    focusBrowserWindow().catch((error) => console.error(error));
    return;
  }

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
  const ordered = tabs.sort((a, b) => a.index - b.index);
  if (ordered.length < 2) return;

  const next = ordered.find((item) => item.index > tab.index) ?? ordered[0];
  if (!next || next.id === tab.id) return;

  await chrome.tabs.update(next.id, { active: true });
  if (next.id === ordered[0].id) {
    await chrome.windows.update(next.windowId, { focused: true });
  }
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

async function focusBrowserWindow() {
  const stored = await chrome.storage.session.get("browserWindowId");
  if (typeof stored.browserWindowId !== "number") return;
  await chrome.windows.update(stored.browserWindowId, { focused: true });
}

async function openCameraWindow() {
  const stored = await chrome.storage.session.get("cameraWindowId");
  if (typeof stored.cameraWindowId === "number") {
    try {
      await chrome.windows.update(stored.cameraWindowId, { focused: true, height: 960 });
      return;
    } catch {
      await chrome.storage.session.remove("cameraWindowId");
    }
  }

  const created = await chrome.windows.create({
    url: chrome.runtime.getURL("camera.html"),
    type: "popup",
    width: 400,
    height: 960,
    left: 24,
    top: 80,
    focused: true,
  });
  if (created?.id != null) {
    await chrome.storage.session.set({ cameraWindowId: created.id });
  }
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
