import {
  FilesetResolver,
  GestureRecognizer,
} from "./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs";

export const CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: "user",
    width: { ideal: 640 },
    height: { ideal: 480 },
  },
};

const MISSING_FRAME_LIMIT = 10;
const STABLE_FRAME_COUNT = 4;
const CLICK_GESTURE = "Victory";
const CURSOR_EXIT = new Set([
  "Closed_Fist",
  "Open_Palm",
  "Thumb_Up",
  "Thumb_Down",
  "ILoveYou",
]);

let recognizerPromise = null;
let sessionPromise = null;
let candidateGesture = null;
let candidateFrames = 0;
let stableGesture = null;
let missingFrames = 0;
let lastTimestamp = -1;
let cursorMode = false;
let pointerSilent = false;

export function cameraErrorText(error) {
  if (error?.name === "NotAllowedError") {
    return "카메라 권한이 거부되었습니다. 크롬 안내에서 허용을 선택해 주세요. macOS라면 시스템 설정 → 개인 정보 보호 및 보안 → 카메라에서 Google Chrome이 켜져 있어야 합니다.";
  }

  const detail = [error?.name, error?.message].filter(Boolean).join(": ");
  return detail ? `시작하지 못했습니다. ${detail}` : "시작하지 못했습니다.";
}

export function startSession({ video, status, gestureOutput, cameraPromise, source }) {
  if (!sessionPromise) {
    sessionPromise = runSession({
      video,
      status,
      gestureOutput,
      cameraPromise,
      source,
    }).catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

async function runSession({ video, status, gestureOutput, cameraPromise, source }) {
  status.textContent = "카메라를 연결하는 중입니다.";
  const stream = await cameraPromise;
  video.srcObject = stream;
  await video.play();

  status.textContent = "손 인식 모델을 불러오는 중입니다.";
  const recognizer = await getRecognizer();

  status.textContent =
    "검지로 커서를 움직이고, 브이를 하면 클릭합니다. 주먹은 아래로, 엄지 위는 위로 스크롤되고 손바닥은 멈춥니다.";
  video.addEventListener("pause", () => {
    if (video.srcObject && document.visibilityState === "visible") {
      video.play().catch(() => {});
    }
  });
  schedulePredict(video, recognizer, gestureOutput, source);
}

function getRecognizer() {
  if (!recognizerPromise) {
    recognizerPromise = createRecognizer().catch((error) => {
      recognizerPromise = null;
      throw error;
    });
  }
  return recognizerPromise;
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

function schedulePredict(video, recognizer, gestureOutput, source) {
  let ran = false;
  const run = () => {
    if (ran) return;
    ran = true;
    predict(video, recognizer, gestureOutput, source);
  };
  const timer = setTimeout(run, 80);
  if (video.requestVideoFrameCallback) {
    video.requestVideoFrameCallback(() => {
      clearTimeout(timer);
      run();
    });
  }
}

function predict(video, recognizer, gestureOutput, source) {
  const sample = readHand(video, recognizer);

  if (sample?.index) {
    missingFrames = 0;
    if (sample.name && sample.name !== "None") {
      if (gestureOutput) gestureOutput.textContent = sample.name;
      noteGesture(sample.name, source);
    }
  } else if (++missingFrames === MISSING_FRAME_LIMIT + 1) {
    if (gestureOutput) gestureOutput.textContent = "";
    settleGesture(null, source);
  }

  publishPointer(sample, source);
  schedulePredict(video, recognizer, gestureOutput, source);
}

function readHand(video, recognizer) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) {
    return null;
  }

  try {
    const result = recognizer.recognizeForVideo(video, nextTimestamp());
    const landmarks = result.landmarks?.[0];
    const indexTip = landmarks?.[8];
    return {
      name: result.gestures?.[0]?.[0]?.categoryName ?? null,
      index: indexTip ? { x: 1 - indexTip.x, y: indexTip.y } : null,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}

function noteGesture(name, source) {
  if (name === candidateGesture) {
    candidateFrames += 1;
  } else {
    candidateGesture = name;
    candidateFrames = 1;
  }

  if (candidateFrames < STABLE_FRAME_COUNT) return;
  settleGesture(candidateGesture, source);
}

function settleGesture(name, source) {
  candidateGesture = name;
  candidateFrames = STABLE_FRAME_COUNT;
  if (name === stableGesture) return;
  stableGesture = name;
  publishGesture(stableGesture, source);
}

function publishGesture(name, source) {
  if (name === "Open_Palm") {
    console.log("Open_Palm");
  }

  chrome.runtime.sendMessage({ type: "gesture", name, source }).catch(() => {});
}

function publishPointer(sample, source) {
  const name = sample?.name ?? null;
  const active = updateCursorMode(name, Boolean(sample?.index));
  if (!active) {
    if (pointerSilent) return;
    pointerSilent = true;
    chrome.runtime.sendMessage({ type: "pointer", source, active: false }).catch(() => {});
    return;
  }

  pointerSilent = false;
  chrome.runtime
    .sendMessage({
      type: "pointer",
      source,
      active: true,
      x: sample.index.x,
      y: sample.index.y,
      move: name === "Pointing_Up",
      click: stableGesture === CLICK_GESTURE,
    })
    .catch(() => {});
}

function updateCursorMode(name, hasHand) {
  if (!hasHand) {
    cursorMode = false;
    return false;
  }
  if (name === "Pointing_Up") cursorMode = true;
  else if (name && CURSOR_EXIT.has(name)) cursorMode = false;
  return cursorMode;
}

function nextTimestamp() {
  const now = Math.round(performance.now());
  lastTimestamp = now <= lastTimestamp ? lastTimestamp + 1 : now;
  return lastTimestamp;
}
