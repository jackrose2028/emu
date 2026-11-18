// On-screen SNES pad for touch screens. Presses go straight to the
// emulator's input (libretro joypad ids), so they work on any core build.
(function () {
  const pad = document.getElementById("pad");
  if (!pad) return;
  const touch = window.matchMedia("(pointer: coarse)").matches;
  if (!touch) return;

  const IDS = { b: 0, y: 1, select: 2, start: 3, up: 4, down: 5, left: 6, right: 7, a: 8, x: 9, l: 10, r: 11 };
  document.getElementById("player").classList.add("touch");
  pad.hidden = false;

  // pointerId -> button element currently held by that finger.
  const active = new Map();

  function send(name, down) {
    const gm = window.EJS_emulator && window.EJS_emulator.gameManager;
    if (gm) gm.simulateInput(0, IDS[name], down ? 1 : 0);
  }

  function buttonAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const btn = el && el.closest && el.closest("[data-btn]");
    return btn && pad.contains(btn) ? btn : null;
  }

  function hold(pid, next) {
    const prev = active.get(pid) || null;
    if (prev === next) return;
    if (prev) { send(prev.dataset.btn, false); prev.classList.remove("on"); }
    if (next) { send(next.dataset.btn, true); next.classList.add("on"); active.set(pid, next); }
    else active.delete(pid);
  }

  pad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    hold(e.pointerId, buttonAt(e.clientX, e.clientY));
  });
  pad.addEventListener("pointermove", (e) => {
    if (!active.has(e.pointerId)) return;
    hold(e.pointerId, buttonAt(e.clientX, e.clientY));
  });
  const release = (e) => hold(e.pointerId, null);
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointercancel", release);
  pad.addEventListener("contextmenu", (e) => e.preventDefault());

  // Release everything if the page loses focus or hides mid-press, so no
  // button stays stuck down.
  function releaseAll() {
    for (const el of active.values()) { send(el.dataset.btn, false); el.classList.remove("on"); }
    active.clear();
  }
  window.addEventListener("blur", releaseAll);
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });
})();
