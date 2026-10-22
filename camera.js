import {
  CAMERA_CONSTRAINTS,
  cameraErrorText,
  startSession,
} from "./recognize.js";

const video = document.querySelector("#webcam");
const startButton = document.querySelector("#start");
const settingsButton = document.querySelector("#settings");
const status = document.querySelector("#status");
const gestureOutput = document.querySelector("#gesture");

chrome.windows.getCurrent((win) => {
  if (win?.id != null) {
    chrome.storage.session.set({ cameraWindowId: win.id });
  }
});

settingsButton.addEventListener("click", () => {
  const site = encodeURIComponent(`chrome-extension://${chrome.runtime.id}/`);
  chrome.tabs.create({
    url: `chrome://settings/content/siteDetails?site=${site}`,
  });
});

let starting = false;

startButton.addEventListener("click", () => {
  requestStart();
});

function requestStart() {
  if (starting) return;
  starting = true;
  startButton.disabled = true;
  startButton.textContent = "Starting…";
  settingsButton.hidden = true;

  const cameraPromise = navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
  cameraPromise
    .then(() => {
      chrome.runtime.sendMessage({ type: "return-to-page" }).catch(() => {});
    })
    .catch(() => {});

  startSession({
    video,
    status,
    gestureOutput,
    cameraPromise,
    source: "camera-window",
  })
    .then(() => {
      startButton.textContent = "Recognizing";
    })
    .catch((error) => {
      showStartError(error);
    });
}

function showStartError(error) {
  console.error(error);
  starting = false;
  startButton.disabled = false;
  startButton.textContent = "Start camera";
  status.textContent = cameraErrorText(error);
  settingsButton.hidden = error?.name !== "NotAllowedError";
}
