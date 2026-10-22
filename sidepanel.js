import {
  FilesetResolver,
  GestureRecognizer,
} from "./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs";

const video = document.querySelector("#webcam");
const startButton = document.querySelector("#start");
const status = document.querySelector("#status");
const gestureOutput = document.querySelector("#gesture");

const MISSING_FRAME_LIMIT = 10;

let recognizer;
let lastGesture = null;
let missingFrames = 0;
let lastTimestamp = -1;
let running = false;

startButton.addEventListener("click", () => {
  start().catch((error) => {
    console.error(error);
    status.textContent =
      "카메라를 시작하지 못했습니다. 카메라 권한을 허용했는지 확인해 주세요.";
    startButton.disabled = false;
  });
});

async function start() {
  startButton.disabled = true;
  status.textContent = "손 인식 모델을 불러오는 중입니다.";

  if (!recognizer) {
    recognizer = await createRecognizer();
  }

  status.textContent = "카메라 연결을 요청합니다.";
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
  });
  video.srcObject = stream;
  await video.play();

  status.textContent =
    "손을 카메라에 보여 주세요. 손바닥을 펴면 이 패널의 콘솔에 Open_Palm이 표시됩니다.";

  if (!running) {
    running = true;
    requestAnimationFrame(predict);
  }
}

async function createRecognizer() {
  const fileset = await FilesetResolver.forVisionTasks(
    chrome.runtime.getURL("node_modules/@mediapipe/tasks-vision/wasm"),
  );

  return GestureRecognizer.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: chrome.runtime.getURL("models/gesture_recognizer.task"),
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
    cannedGesturesClassifierOptions: {
      scoreThreshold: 0.5,
    },
  });
}

function predict() {
  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0
  ) {
    const category = recognizeCurrentFrame();
    const name = category?.categoryName ?? null;

    if (name && name !== "None") {
      gestureOutput.textContent = name;
      missingFrames = 0;
      if (name === "Open_Palm" && lastGesture !== "Open_Palm") {
        console.log("Open_Palm");
      }
      lastGesture = name;
    } else if (++missingFrames > MISSING_FRAME_LIMIT) {
      gestureOutput.textContent = "";
      lastGesture = null;
    }
  }

  requestAnimationFrame(predict);
}

function recognizeCurrentFrame() {
  try {
    const result = recognizer.recognizeForVideo(video, nextTimestamp());
    return result.gestures[0]?.[0] ?? null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function nextTimestamp() {
  const now = Math.round(performance.now());
  lastTimestamp = now <= lastTimestamp ? lastTimestamp + 1 : now;
  return lastTimestamp;
}
