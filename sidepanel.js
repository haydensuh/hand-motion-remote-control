const startButton = document.querySelector("#start");
const status = document.querySelector("#status");
const gestureOutput = document.querySelector("#gesture");

let cameraPermission = "unknown";

startButton.disabled = true;
status.textContent = "카메라 권한을 확인하는 중입니다.";

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
      "카메라가 차단되어 있습니다. 열린 설정에서 이 확장 프로그램의 카메라를 허용한 뒤 다시 눌러 주세요.";
    return;
  }

  openCameraWindow()
    .then(() => {
      status.textContent =
        "카메라 창은 열어 두세요. 웹페이지 탭으로 돌아가면 검지로 커서를 움직이고, 브이를 하면 클릭합니다.";
    })
    .catch((error) => {
      console.error(error);
      status.textContent = "카메라 창을 열지 못했습니다.";
    });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "gesture" || message.source === "sidepanel") return;
  gestureOutput.textContent = message.name ?? "";
  if (message.name === "Open_Palm") console.log("Open_Palm");
});

function describePermission() {
  status.textContent =
    cameraPermission === "granted"
      ? "카메라 시작을 누르면 작은 카메라 창이 열립니다. 탭을 바꿔도 그 창의 카메라는 유지됩니다."
      : "카메라 시작을 누르면 카메라 창이 열립니다. 그 창에서 카메라를 허용해 주세요.";
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
    height: 620,
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
