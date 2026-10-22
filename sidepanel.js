import { gestureLabel } from "./labels.js";

const startButton = document.querySelector("#start");
const status = document.querySelector("#status");
const gestureOutput = document.querySelector("#gesture");

let cameraPermission = "unknown";

startButton.disabled = true;
status.textContent = "Checking camera permission.";

navigator.permissions
  .query({ name: "camera" })
  .then((result) => {
    cameraPermission = result.state;
    result.onchange = () => {
      cameraPermission = result.state;
      describePermission();
    };
    describePermission();
  })
  .catch(() => {
    cameraPermission = "prompt";
    describePermission();
  })
  .finally(() => {
    startButton.disabled = false;
  });

startButton.addEventListener("click", () => {
  if (cameraPermission === "denied") {
    openCameraSettings();
    status.textContent =
      "Camera is blocked. Allow this extension on the settings page, then try again.";
    return;
  }

  openCameraWindow()
    .then(() => {
      status.textContent =
        "Keep the camera window open, then go back to a web page.";
    })
    .catch((error) => {
      console.error(error);
      status.textContent = "Couldn't open the camera window.";
    });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "gesture" || message.source === "sidepanel") return;
  gestureOutput.textContent = gestureLabel(message.name);
  if (message.name === "Open_Palm") console.log("Open_Palm");
});

function describePermission() {
  status.textContent =
    cameraPermission === "granted"
      ? "Start camera opens a small window. It stays on when you switch tabs."
      : "Start camera opens a window. Allow the camera there.";
}

async function openCameraWindow() {
  const stored = await chrome.storage.session.get("cameraWindowId");
  if (typeof stored.cameraWindowId === "number") {
    try {
      await chrome.windows.update(stored.cameraWindowId, { focused: true });
      return;
    } catch {
      await chrome.storage.session.remove("cameraWindowId");
    }
  }

  const created = await chrome.windows.create({
    url: chrome.runtime.getURL("camera.html"),
    type: "popup",
    width: 400,
    height: 760,
    left: 24,
    top: 80,
    focused: true,
  });
  if (created?.id != null) {
    await chrome.storage.session.set({ cameraWindowId: created.id });
  }
}

function openCameraSettings() {
  const site = encodeURIComponent(`chrome-extension://${chrome.runtime.id}/`);
  chrome.tabs.create({
    url: `chrome://settings/content/siteDetails?site=${site}`,
  });
}
