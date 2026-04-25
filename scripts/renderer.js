import { getAudioBuffer, getAudioOnsets, sfxTick, sfxPop } from "scripts/audio-engine.js";
import { isHorizontal, snapTime, timeFromEvent, laneFromEvent } from "scripts/utils.js";

export function recomputeNoteSizes(state) {
  const div = state.snapDivision > 0 ? state.snapDivision : 1;
  const stepPx = (60 / state.bpm / div) * state.PX_PER_SECOND;
  state.noteThickness = Math.max(6, Math.min(16, Math.floor(stepPx * 0.7)));
  state.flickThickness = Math.max(14, Math.min(30, Math.floor(stepPx * 0.9)));
}

export function applyGridSize(state) {
  const totalLen = state.duration * state.PX_PER_SECOND;
  if (isHorizontal()) {
    state.grid.style.width = totalLen + "px";
    state.grid.style.height = "";
  } else {
    state.grid.style.height = totalLen + "px";
    state.grid.style.width = "";
  }
}

export function positionNote(el, type, lane, time, noteDuration, state) {
  const horizontal = isHorizontal();
  const laneSizePct = 100 / state.LANES;

  if (horizontal) {
    if (type === "flick") {
      el.style.top = "calc(" + (lane * laneSizePct + laneSizePct / 2) + "% - " + state.flickThickness / 2 + "px)";
      el.style.height = state.flickThickness + "px";
      el.style.left = time * state.PX_PER_SECOND - state.flickThickness / 2 + "px";
      el.style.width = state.flickThickness + "px";
    } else {
      el.style.top = "calc(" + lane * laneSizePct + "% + 6px)";
      el.style.height = "calc(" + laneSizePct + "% - 12px)";
      if (type === "tap") {
        el.style.left = time * state.PX_PER_SECOND - state.noteThickness / 2 + "px";
        el.style.width = state.noteThickness + "px";
      } else if (type === "hold") {
        el.style.left = time * state.PX_PER_SECOND + "px";
        el.style.width = Math.max(8, noteDuration * state.PX_PER_SECOND) + "px";
      }
    }
  } else {
    el.style.left = "calc(" + lane * laneSizePct + "% + 6px)";
    el.style.width = "calc(" + laneSizePct + "% - 12px)";
    el.style.top = "";
    if (type === "tap") {
      el.style.bottom = time * state.PX_PER_SECOND - state.noteThickness / 2 + "px";
      el.style.height = state.noteThickness + "px";
    } else if (type === "hold") {
      el.style.bottom = time * state.PX_PER_SECOND + "px";
      el.style.height = Math.max(8, noteDuration * state.PX_PER_SECOND) + "px";
    } else if (type === "flick") {
      el.style.bottom = time * state.PX_PER_SECOND - state.flickThickness / 2 + "px";
      el.style.height = state.flickThickness + "px";
    }
  }
}

export function renderNote(note, state) {
  const el = document.createElement("div");
  el.className = "note " + note.type + " lane-" + note.lane;
  el.title =
    (note.type === "tap" ? "Tap" : note.type === "hold" ? "Hold" : note.type === "flick" ? "Flick" : "") +
    " · Lane " + (note.lane + 1) + " @ " + note.time.toFixed(3) + "s" +
    (note.type === "hold" ? " for " + note.duration.toFixed(3) + "s" : "");

  positionNote(el, note.type, note.lane, note.time, note.duration, state);

  if (note.type === "hold") {
    const head = document.createElement("div");
    head.className = "head";
    el.appendChild(head);
    const tail = document.createElement("div");
    tail.className = "tail";
    el.appendChild(tail);
  } else if (note.type === "flick") {
    el.innerHTML =
      '<svg viewBox="0 0 44 28" preserveAspectRatio="none">' +
      '<path class="arrow" d="M 22 3 L 41 17 L 31 17 L 31 24 L 13 24 L 13 17 L 3 17 Z" />' +
      '<circle class="sparkle" cx="22" cy="11.5" r="1.4" />' +
      '<circle class="sparkle" cx="36" cy="6"   r="1"   opacity="0.7" />' +
      '<circle class="sparkle" cx="8"  cy="6"   r="0.8" opacity="0.6" />' +
      "</svg>";
  }

  attachNoteDragHandlers(el, note, state);
  state.grid.appendChild(el);
}

function attachNoteDragHandlers(el, note, state) {
  let drag = null;

  el.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (state.dragState) return;
    e.preventDefault();

    const ghost = document.createElement("div");
    ghost.className = el.className + " ghost";
    ghost.innerHTML = el.innerHTML;
    positionNote(ghost, note.type, note.lane, note.time, note.duration, state);
    state.grid.appendChild(ghost);
    el.classList.add("dragging");

    drag = { ghostEl: ghost, startX: e.clientX, startY: e.clientY, lane: note.lane, time: note.time, moved: false, id: e.pointerId };
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  });

  el.addEventListener("pointermove", (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.sqrt(dx * dx + dy * dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    drag.lane = laneFromEvent(e, state);
    drag.time = snapTime(timeFromEvent(e, state), state);
    positionNote(drag.ghostEl, note.type, drag.lane, drag.time, note.duration, state);
  });

  function endDrag(e, cancel) {
    if (!drag || drag.id !== e.pointerId) return;
    drag.ghostEl.remove();
    el.classList.remove("dragging");
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}

    if (cancel) { drag = null; return; }

    if (!drag.moved) {
      state.notes = state.notes.filter((n) => n !== note);
      sfxPop();
      renderGrid(state);
    } else {
      const newLane = drag.lane;
      const newTime = drag.time;
      const dur = note.type === "hold"
        ? Math.max(0.05, Math.min(note.duration, state.duration - newTime))
        : 0;
      const isDuplicate = state.notes.some(
        (n) => n !== note && n.lane === newLane && n.type === note.type && Math.abs(n.time - newTime) < 0.001
      );
      if (!isDuplicate) {
        note.lane = newLane;
        note.time = newTime;
        if (note.type === "hold") note.duration = dur;
        state.notes.sort((a, b) => a.time - b.time);
        sfxTick();
      }
      renderGrid(state);
    }
    drag = null;
  }

  el.addEventListener("pointerup", (e) => endDrag(e, false));
  el.addEventListener("pointercancel", (e) => endDrag(e, true));
}

export function renderWaveform(state) {
  const audioBuffer = getAudioBuffer();
  const horizontal = isHorizontal();
  const totalLen = state.duration * state.PX_PER_SECOND;
  const dpr = window.devicePixelRatio || 1;

  const w = horizontal ? totalLen : state.grid.clientWidth || 1;
  const h = horizontal ? state.grid.clientHeight || 1 : totalLen;

  state.waveformCanvas.width = Math.max(1, Math.floor(w * dpr));
  state.waveformCanvas.height = Math.max(1, Math.floor(h * dpr));
  state.waveformCanvas.style.width = w + "px";
  state.waveformCanvas.style.height = h + "px";

  const ctx2d = state.waveformCanvas.getContext("2d");
  ctx2d.setTransform(1, 0, 0, 1, 0, 0);
  ctx2d.scale(dpr, dpr);
  ctx2d.clearRect(0, 0, w, h);

  if (!audioBuffer) return;

  const numCh = audioBuffer.numberOfChannels;
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = numCh > 1 ? audioBuffer.getChannelData(1) : null;
  const sampleRate = audioBuffer.sampleRate;
  const songDur = audioBuffer.duration;
  const samplesPerPixel = sampleRate / state.PX_PER_SECOND;

  function ampAtPixel(p) {
    const time = horizontal ? p / state.PX_PER_SECOND : (h - p) / state.PX_PER_SECOND;
    const sStart = Math.max(0, Math.floor(time * sampleRate));
    const sEnd = Math.min(ch0.length, Math.floor(sStart + samplesPerPixel));
    let max = 0;
    if (ch1) {
      for (let i = sStart; i < sEnd; i++) {
        const v = Math.abs((ch0[i] + ch1[i]) * 0.5);
        if (v > max) max = v;
      }
    } else {
      for (let i = sStart; i < sEnd; i++) {
        const v = Math.abs(ch0[i]);
        if (v > max) max = v;
      }
    }
    return max;
  }

  if (horizontal) {
    const pixels = Math.floor(Math.min(w, songDur * state.PX_PER_SECOND));
    const centerY = h / 2;
    const halfH = Math.max(2, h / 2 - 6);
    const amps = new Float32Array(pixels);
    for (let x = 0; x < pixels; x++) amps[x] = ampAtPixel(x);
    ctx2d.beginPath();
    ctx2d.moveTo(0, centerY);
    for (let x = 0; x < pixels; x++) ctx2d.lineTo(x, centerY - amps[x] * halfH);
    for (let x = pixels - 1; x >= 0; x--) ctx2d.lineTo(x, centerY + amps[x] * halfH);
    ctx2d.closePath();
    ctx2d.fillStyle = "rgba(232, 155, 92, 0.14)";
    ctx2d.fill();
  } else {
    const pixels = Math.floor(Math.min(h, songDur * state.PX_PER_SECOND));
    const centerX = w / 2;
    const halfW = Math.max(2, w / 2 - 6);
    const amps = new Float32Array(pixels);
    for (let y = 0; y < pixels; y++) amps[y] = ampAtPixel(y);
    ctx2d.beginPath();
    ctx2d.moveTo(centerX, 0);
    for (let y = 0; y < pixels; y++) ctx2d.lineTo(centerX + amps[y] * halfW, y);
    for (let y = pixels - 1; y >= 0; y--) ctx2d.lineTo(centerX - amps[y] * halfW, y);
    ctx2d.closePath();
    ctx2d.fillStyle = "rgba(232, 155, 92, 0.14)";
    ctx2d.fill();
  }
}

export function renderOnsets(state) {
  const audioOnsets = getAudioOnsets();
  if (!audioOnsets || audioOnsets.length === 0) return;
  const horizontal = isHorizontal();
  for (const t of audioOnsets) {
    if (t > state.duration) continue;
    const line = document.createElement("div");
    line.className = "onset-line";
    if (horizontal) line.style.left = t * state.PX_PER_SECOND + "px";
    else line.style.bottom = t * state.PX_PER_SECOND + "px";
    state.grid.appendChild(line);
  }
}

export function renderGrid(state) {
  recomputeNoteSizes(state);
  applyGridSize(state);
  state.grid
    .querySelectorAll(".beat-line, .beat-label, .note, .onset-line")
    .forEach((el) => el.remove());
  renderWaveform(state);
  renderOnsets(state);

  const horizontal = isHorizontal();
  const secondsPerBeat = 60 / state.bpm;
  const totalBeats = Math.floor(state.duration / secondsPerBeat);

  for (let b = 0; b <= totalBeats; b++) {
    const t = b * secondsPerBeat;
    const line = document.createElement("div");
    line.className = "beat-line" + (b % 4 === 0 ? " major" : "");
    if (horizontal) line.style.left = t * state.PX_PER_SECOND + "px";
    else line.style.bottom = t * state.PX_PER_SECOND + "px";
    state.grid.appendChild(line);

    if (b % 4 === 0) {
      const label = document.createElement("div");
      label.className = "beat-label";
      if (horizontal) label.style.left = t * state.PX_PER_SECOND + "px";
      else label.style.bottom = t * state.PX_PER_SECOND + "px";
      label.textContent = t.toFixed(1) + "s";
      state.grid.appendChild(label);
    }
  }

  state.notes.forEach((note) => renderNote(note, state));
  updatePlayhead(state);
  updateInfo(state);
}

export function updatePlayhead(state) {
  if (isHorizontal()) {
    state.playhead.style.bottom = "";
    state.playhead.style.left = state.playOffsetSeconds * state.PX_PER_SECOND + "px";
  } else {
    state.playhead.style.left = "";
    state.playhead.style.bottom = state.playOffsetSeconds * state.PX_PER_SECOND + "px";
  }
}

export function updateInfo(state) {
  state.noteCount.textContent = state.notes.length + " note" + (state.notes.length === 1 ? "" : "s");
  state.timeDisplay.textContent = state.playOffsetSeconds.toFixed(2) + "s";
}
