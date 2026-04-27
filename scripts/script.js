import { LANES, BASE_PX_PER_SECOND } from "./constants.js";
import { isHorizontal, snapTime, timeFromEvent, laneFromEvent } from "./utils.js";
import { sfxTick, sfxClick, sfxPop, loadAudioFile } from "./audio-engine.js";
import { renderGrid, renderWaveform } from "./renderer.js";
import { setZoom, updateZoomLabel, startPlayback, pausePlayback, stopPlayback, resetScrollPosition, setupZoomGestures } from "./controls.js";

const state = {
  LANES,
  notes: [],
  duration: 30,
  bpm: 120,
  snapDivision: 1,
  activeNoteType: "tap",

  zoom: 1,
  PX_PER_SECOND: BASE_PX_PER_SECOND,

  isPlaying: false,
  playStartTime: 0,
  playOffsetSeconds: 0,
  rafId: null,

  pointerStart: null,
  dragState: null,

  noteThickness: 16,
  flickThickness: 30,

  grid:          document.getElementById("grid"),
  timelineWrap:  document.getElementById("timelineWrap"),
  playhead:      document.getElementById("playhead"),
  waveformCanvas:document.getElementById("waveform"),
  noteCount:     document.getElementById("noteCount"),
  timeDisplay:   document.getElementById("timeDisplay"),
  audio:         document.getElementById("audio"),
  playBtn:       document.getElementById("playBtn"),
  zoomLabel:     document.getElementById("zoomLabel"),

  renderGrid()          { renderGrid(state); },
  resetScrollPosition() { resetScrollPosition(state); },
};

const { grid, timelineWrap } = state;

const stopBtn       = document.getElementById("stopBtn");
const clearBtn      = document.getElementById("clearBtn");
const exportBtn     = document.getElementById("exportBtn");
const durationInput = document.getElementById("durationInput");
const bpmInput      = document.getElementById("bpmInput");
const snapSelect    = document.getElementById("snapSelect");
const audioInput    = document.getElementById("audioInput");
const hint          = document.getElementById("hint");
const hintClose     = document.getElementById("hintClose");
const typeButtons   = document.querySelectorAll(".note-type-btn");
const orientationBtn  = document.getElementById("orientationBtn");
const toolsToggleBtn  = document.getElementById("toolsToggle");
const toolsShowBtn    = document.getElementById("toolsShow");
const zoomInBtn       = document.getElementById("zoomInBtn");
const zoomOutBtn      = document.getElementById("zoomOutBtn");

grid.addEventListener("pointerdown", (e) => {
  if (e.target !== grid) return;
  if (e.pointerType === "mouse" && e.button !== 0) return;

  const lane = laneFromEvent(e, state);
  const time = snapTime(timeFromEvent(e, state), state);
  state.pointerStart = { x: e.clientX, y: e.clientY, lane, time, id: e.pointerId };

  if (state.activeNoteType === "hold") {
    e.preventDefault();
    try { grid.setPointerCapture(e.pointerId); } catch (_) {}

    const preview = document.createElement("div");
    preview.className = "drag-preview";
    const laneSizePct = 100 / LANES;
    if (isHorizontal()) {
      preview.style.top    = "calc(" + lane * laneSizePct + "% + 6px)";
      preview.style.height = "calc(" + laneSizePct + "% - 12px)";
      preview.style.left   = time * state.PX_PER_SECOND + "px";
      preview.style.width  = "8px";
    } else {
      preview.style.left   = "calc(" + lane * laneSizePct + "% + 6px)";
      preview.style.width  = "calc(" + laneSizePct + "% - 12px)";
      preview.style.bottom = time * state.PX_PER_SECOND + "px";
      preview.style.height = "8px";
    }
    grid.appendChild(preview);
    state.dragState = { startTime: time, lane, currentTime: time, previewEl: preview, id: e.pointerId };
  }
});

grid.addEventListener("pointermove", (e) => {
  if (!state.dragState || e.pointerId !== state.dragState.id) return;
  const t = snapTime(timeFromEvent(e, state), state);
  state.dragState.currentTime = t;
  const start  = Math.min(state.dragState.startTime, t);
  const end    = Math.max(state.dragState.startTime, t);
  const sizePx = Math.max(8, (end - start) * state.PX_PER_SECOND);
  if (isHorizontal()) {
    state.dragState.previewEl.style.left  = start * state.PX_PER_SECOND + "px";
    state.dragState.previewEl.style.width = sizePx + "px";
  } else {
    state.dragState.previewEl.style.bottom = start * state.PX_PER_SECOND + "px";
    state.dragState.previewEl.style.height = sizePx + "px";
  }
});

function finishPointer(e) {
  if (state.dragState && e.pointerId === state.dragState.id) {
    const start = Math.min(state.dragState.startTime, state.dragState.currentTime);
    const end   = Math.max(state.dragState.startTime, state.dragState.currentTime);
    state.dragState.previewEl.remove();
    try { grid.releasePointerCapture(e.pointerId); } catch (_) {}

    const minHoldDuration = state.snapDivision > 0 ? 60 / state.bpm / state.snapDivision : 0.25;
    const lane = state.dragState.lane;
    const isDuplicate = state.notes.some(
      (n) => n.lane === lane && n.type === "hold" && Math.abs(n.time - start) < 0.001
    );
    if (!isDuplicate) {
      state.notes.push({ time: start, lane, type: "hold", duration: Math.max(minHoldDuration, end - start) });
      state.notes.sort((a, b) => a.time - b.time);
      sfxTick();
      renderGrid(state);
    }
    state.dragState = null;
    state.pointerStart = null;
    return;
  }

  if (state.pointerStart && e.pointerId === state.pointerStart.id) {
    const dx = e.clientX - state.pointerStart.x;
    const dy = e.clientY - state.pointerStart.y;
    if (Math.sqrt(dx * dx + dy * dy) < 10 && state.activeNoteType !== "hold") {
      const { lane, time } = state.pointerStart;
      const isDuplicate = state.notes.some(
        (n) => n.lane === lane && n.type === state.activeNoteType && Math.abs(n.time - time) < 0.001
      );
      if (!isDuplicate) {
        state.notes.push({ time, lane, type: state.activeNoteType });
        state.notes.sort((a, b) => a.time - b.time);
        sfxTick();
        renderGrid(state);
      }
    }
    state.pointerStart = null;
  }
}

grid.addEventListener("pointerup", finishPointer);
grid.addEventListener("pointercancel", (e) => {
  if (state.dragState && e.pointerId === state.dragState.id) {
    state.dragState.previewEl.remove();
    state.dragState = null;
  }
  state.pointerStart = null;
});

typeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    typeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeNoteType = btn.dataset.type;
    grid.classList.toggle("hold-mode", state.activeNoteType === "hold");
    sfxClick();
  });
});

state.playBtn.addEventListener("click", () => {
  if (state.isPlaying) pausePlayback(state);
  else startPlayback(state);
});
stopBtn.addEventListener("click", () => stopPlayback(state));

clearBtn.addEventListener("click", () => {
  if (state.notes.length === 0 || confirm("Clear all " + state.notes.length + " notes?")) {
    state.notes = [];
    renderGrid(state);
  }
});

exportBtn.addEventListener("click", () => {
  const chart = { duration: state.duration, bpm: state.bpm, lanes: LANES, notes: state.notes };
  const json = JSON.stringify(chart, null, 2);
  console.log("=== Chart Export ===\n" + json);
  try {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chart.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (_) {}
});

durationInput.addEventListener("change", () => {
  const v = parseInt(durationInput.value, 10);
  if (!isNaN(v) && v > 0) {
    state.duration = v;
    state.notes = state.notes.filter((n) => n.time <= state.duration);
    for (const n of state.notes) {
      if (n.type === "hold" && n.time + n.duration > state.duration) {
        n.duration = Math.max(0.05, state.duration - n.time);
      }
    }
    renderGrid(state);
    resetScrollPosition(state);
  }
});

bpmInput.addEventListener("change", () => {
  const v = parseInt(bpmInput.value, 10);
  if (!isNaN(v) && v > 0) { state.bpm = v; renderGrid(state); }
});

snapSelect.addEventListener("change", () => {
  state.snapDivision = parseInt(snapSelect.value, 10);
  renderGrid(state);
});

audioInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  state.durationInput = durationInput;
  loadAudioFile(file, state);
});

if (hintClose) hintClose.addEventListener("click", () => hint.classList.add("hidden"));

let resizeTimer = null;
window.addEventListener("resize", () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderWaveform(state), 120);
});

if (orientationBtn) {
  function syncOrientationLabel() {
    orientationBtn.textContent = isHorizontal() ? "↔ Horizontal" : "↕ Vertical";
  }
  orientationBtn.addEventListener("click", () => {
    document.body.classList.toggle("horizontal");
    document.body.classList.remove("tools-collapsed");
    syncOrientationLabel();
    renderGrid(state);
    resetScrollPosition(state);
  });
  if (window.matchMedia("(orientation: landscape) and (max-height: 540px)").matches) {
    document.body.classList.add("horizontal");
  }
  syncOrientationLabel();
}

function setToolsCollapsed(collapsed) {
  document.body.classList.toggle("tools-collapsed", collapsed);
  requestAnimationFrame(() => { renderGrid(state); resetScrollPosition(state); });
}
if (toolsToggleBtn) toolsToggleBtn.addEventListener("click", () => setToolsCollapsed(true));
if (toolsShowBtn)   toolsShowBtn.addEventListener("click", () => setToolsCollapsed(false));

if (zoomInBtn)        zoomInBtn.addEventListener("click", () => setZoom(state.zoom * 1.25, state));
if (zoomOutBtn)       zoomOutBtn.addEventListener("click", () => setZoom(state.zoom / 1.25, state));
if (state.zoomLabel)  state.zoomLabel.addEventListener("dblclick", () => setZoom(1, state));

setupZoomGestures(state);
updateZoomLabel(state);
grid.classList.toggle("hold-mode", state.activeNoteType === "hold");
renderGrid(state);
resetScrollPosition(state);
