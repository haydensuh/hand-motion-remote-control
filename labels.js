const LABELS = {
  Pointing_Up: "Cursor",
  Victory: "Click",
  Closed_Fist: "Back",
  Open_Palm: "Stop",
  Thumb_Up: "Scroll up",
  Thumb_Down: "Scroll down",
  ILoveYou: "Next tab",
};

export function gestureLabel(name) {
  if (!name || name === "None") return "";
  return LABELS[name] ?? name;
}
