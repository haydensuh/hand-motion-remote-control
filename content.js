const SCROLL_STEP = 16;
const CURSOR_GAIN = 2.6;
const FINGER_DEADZONE = 0.004;
const FINGER_JUMP = 0.2;

let direction = "stop";
let frame = 0;
let target = null;
let cursor = null;
let lastFinger = null;
let clickWas = false;
let cursorElement = null;

if (!globalThis.__handMotionScroll) {
  globalThis.__handMotionScroll = true;

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "scroll") {
      setDirection(message.direction === "up" || message.direction === "down" ? message.direction : "stop");
      return;
    }
    if (message?.type === "pointer") {
      movePointer(message);
    }
  });
}

function setDirection(next) {
  if (next === direction) return;
  direction = next;
  target = null;
  if (direction !== "stop" && frame === 0) {
    frame = requestAnimationFrame(tick);
  }
}

function tick() {
  frame = 0;
  if (direction === "stop") return;

  if (!target || !target.isConnected || !canScroll(target, direction)) {
    target = findScrollTarget(direction);
  }

  if (target) {
    const delta = direction === "up" ? -SCROLL_STEP : SCROLL_STEP;
    target.scrollBy(0, delta);
  }

  frame = requestAnimationFrame(tick);
}

function findScrollTarget(nextDirection) {
  const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
  let node = center instanceof Element ? center : null;

  while (node) {
    if (canScroll(node, nextDirection)) return node;
    node = node.parentElement;
  }

  const root = document.scrollingElement;
  if (root && canScroll(root, nextDirection)) return root;
  return root;
}

function canScroll(element, nextDirection) {
  if (!(element instanceof Element)) return false;

  const overflow = getComputedStyle(element).overflowY;
  const scrollableOverflow = overflow === "auto" || overflow === "scroll" || overflow === "overlay";
  const isRoot = element === document.scrollingElement;
  if (!scrollableOverflow && !isRoot) return false;
  if (element.scrollHeight <= element.clientHeight + 1) return false;

  if (nextDirection === "up") return element.scrollTop > 0;
  return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
}

function movePointer(message) {
  if (!message.active || typeof message.x !== "number" || typeof message.y !== "number") {
    hideCursor();
    lastFinger = null;
    clickWas = false;
    return;
  }

  if (!cursor) {
    cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  if (message.move) {
    if (lastFinger) {
      const dx = message.x - lastFinger.x;
      const dy = message.y - lastFinger.y;
      if (Math.hypot(dx, dy) < FINGER_JUMP) {
        if (Math.abs(dx) > FINGER_DEADZONE) cursor.x += dx * window.innerWidth * CURSOR_GAIN;
        if (Math.abs(dy) > FINGER_DEADZONE) cursor.y += dy * window.innerHeight * CURSOR_GAIN;
      }
      cursor.x = clamp(cursor.x, 0, window.innerWidth - 1);
      cursor.y = clamp(cursor.y, 0, window.innerHeight - 1);
    }
    lastFinger = { x: message.x, y: message.y };
  } else {
    lastFinger = null;
  }

  showCursor();

  if (message.click && !clickWas) clickAt(cursor.x, cursor.y);
  clickWas = Boolean(message.click);
}

function showCursor() {
  const element = ensureCursor();
  element.hidden = false;
  element.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
  if (element.parentElement?.lastElementChild !== element) {
    document.documentElement.appendChild(element);
  }
}

function hideCursor() {
  if (cursorElement) cursorElement.hidden = true;
}

function ensureCursor() {
  if (cursorElement?.isConnected) return cursorElement;
  cursorElement = document.createElement("div");
  cursorElement.id = "hand-motion-cursor";
  cursorElement.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "width:18px",
    "height:18px",
    "margin:-9px 0 0 -9px",
    "border:2px solid #fff",
    "border-radius:50%",
    "background:#3182f6",
    "box-shadow:0 4px 12px rgba(49,130,246,.45)",
    "z-index:2147483647",
    "pointer-events:none",
    "transform:translate(-100px,-100px)",
  ].join(";");
  document.documentElement.appendChild(cursorElement);
  return cursorElement;
}

function clickAt(x, y) {
  const hit = document.elementFromPoint(x, y);
  if (!(hit instanceof HTMLElement)) return;

  const clickable = hit.closest("a, button, input, summary, label, [role='button'], [role='link']");
  const target = clickable instanceof HTMLElement ? clickable : hit;
  const init = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
  hit.dispatchEvent(new MouseEvent("mousemove", init));
  target.click();
  flashCursor();
}

function flashCursor() {
  if (!cursorElement) return;
  cursorElement.style.background = "#ffffff";
  setTimeout(() => {
    if (cursorElement) cursorElement.style.background = "#3182f6";
  }, 140);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
