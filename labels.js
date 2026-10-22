const LABELS = {
  Pointing_Up: "Cursor",
  Victory: "Click",
  Closed_Fist: "Scroll down",
  Open_Palm: "Stop",
  Thumb_Up: "Scroll up",
  Thumb_Down: "Thumb down",
  ILoveYou: "Open hand",
};

export function gestureLabel(name) {
  if (!name || name === "None") return "";
  return LABELS[name] ?? name;
}
