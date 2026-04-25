import { BASE_PX_PER_SECOND, ZOOM_MIN, ZOOM_MAX } from "scripts/constants.js";
import { isHorizontal } from "scripts/utils.js";
import { renderGrid, renderWaveform, updatePlayhead, updateInfo } from "scripts/renderer.js";

export function updateZoomLabel(state) {
  if (state.zoomLabel) state.zoomLabel.textContent = Math.round(state.zoom * 100) + "%";
}

export function setZoom(newZoom, state, anchorClientX, anchorClientY) {
  newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  if (Math.abs(newZoom - state.zoom) < 0.001) return;

  const wrapRect = state.timelineWrap.getBoundingClientRect();
  const horizontal = isHorizontal();

  if (anchorClientX === undefined) anchorClientX = wrapRect.left + wrapRect.width / 2;
  if (anchorClientY === undefined) anchorClientY = wrapRect.top + wrapRect.height / 2;

  let anchorTime;
  if (horizontal) {
    const anchorPx = anchorClientX - wrapRect.left + state.timelineWrap.scrollLeft - state.grid.offsetLeft;
    anchorTime = anchorPx / state.PX_PER_SECOND;
  } else {
    const totalH = state.duration * state.PX_PER_SECOND;
    const anchorPx = anchorClientY - wrapRect.top + state.timelineWrap.scrollTop - state.grid.offsetTop;
    anchorTime = (totalH - anchorPx) / state.PX_PER_SECOND;
  }

  state.zoom = newZoom;
  state.PX_PER_SECOND = BASE_PX_PER_SECOND * newZoom;
  renderGrid(state);
  updateZoomLabel(state);

  if (horizontal) {
    state.timelineWrap.scrollLeft = anchorTime * state.PX_PER_SECOND + state.grid.offsetLeft - (anchorClientX - wrapRect.left);
  } else {
    const totalH = state.duration * state.PX_PER_SECOND;
    state.timelineWrap.scrollTop = totalH - anchorTime * state.PX_PER_SECOND + state.grid.offsetTop - (anchorClientY - wrapRect.top);
  }
}

export function autoScrollToPlayhead(state) {
  if (isHorizontal()) {
    const playheadFromLeft = state.grid.offsetLeft + state.playOffsetSeconds * state.PX_PER_SECOND;
    const viewLeft = state.timelineWrap.scrollLeft;
    const viewRight = viewLeft + state.timelineWrap.clientWidth;
    if (playheadFromLeft > viewRight - 80) {
      state.timelineWrap.scrollLeft = playheadFromLeft - state.timelineWrap.clientWidth + 80;
    } else if (playheadFromLeft < viewLeft + 60) {
      state.timelineWrap.scrollLeft = Math.max(0, playheadFromLeft - 60);
    }
  } else {
    const totalHeight = state.duration * state.PX_PER_SECOND;
    const playheadFromTop = state.grid.offsetTop + (totalHeight - state.playOffsetSeconds * state.PX_PER_SECOND);
    const viewTop = state.timelineWrap.scrollTop;
    const viewBottom = viewTop + state.timelineWrap.clientHeight;
    if (playheadFromTop < viewTop + 60) {
      state.timelineWrap.scrollTop = Math.max(0, playheadFromTop - 60);
    } else if (playheadFromTop > viewBottom - 60) {
      state.timelineWrap.scrollTop = playheadFromTop - state.timelineWrap.clientHeight + 60;
    }
  }
}

export function startPlayback(state) {
  if (state.isPlaying) return;
  state.isPlaying = true;
  state.playStartTime = performance.now() - state.playOffsetSeconds * 1000;
  state.playBtn.textContent = "❚❚ Pause";
  if (state.audio.src) {
    state.audio.currentTime = state.playOffsetSeconds;
    state.audio.play().catch(() => {});
  }
  function tick() {
    if (!state.isPlaying) return;
    state.playOffsetSeconds = (performance.now() - state.playStartTime) / 1000;
    if (state.playOffsetSeconds >= state.duration) {
      state.playOffsetSeconds = state.duration;
      pausePlayback(state);
      return;
    }
    updatePlayhead(state);
    autoScrollToPlayhead(state);
    updateInfo(state);
    state.rafId = requestAnimationFrame(tick);
  }
  state.rafId = requestAnimationFrame(tick);
}

export function pausePlayback(state) {
  state.isPlaying = false;
  state.playBtn.textContent = "▶ Play";
  if (state.rafId) cancelAnimationFrame(state.rafId);
  if (!state.audio.paused) state.audio.pause();
}

export function resetScrollPosition(state) {
  if (isHorizontal()) {
    state.timelineWrap.scrollLeft = 0;
  } else {
    state.timelineWrap.scrollTop = state.timelineWrap.scrollHeight;
  }
}

export function stopPlayback(state) {
  pausePlayback(state);
  state.playOffsetSeconds = 0;
  updatePlayhead(state);
  if (state.audio.src) state.audio.currentTime = 0;
  state.resetScrollPosition();
  updateInfo(state);
}

function cancelActiveDrags(state) {
  if (state.dragState) {
    if (state.dragState.previewEl) state.dragState.previewEl.remove();
    state.dragState = null;
  }
  state.pointerStart = null;
  document.querySelectorAll(".note.ghost").forEach((el) => el.remove());
  document.querySelectorAll(".note.dragging").forEach((el) => el.classList.remove("dragging"));
}

export function setupZoomGestures(state) {
  const activePointers = new Map();
  let pinchInitial = null;

  function pinchMidAndDist() {
    const pts = [...activePointers.values()];
    if (pts.length < 2) return null;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return { dist: Math.sqrt(dx * dx + dy * dy), midX: (pts[0].x + pts[1].x) / 2, midY: (pts[0].y + pts[1].y) / 2 };
  }

  state.timelineWrap.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      cancelActiveDrags(state);
      const m = pinchMidAndDist();
      if (m) pinchInitial = { dist: m.dist, zoom: state.zoom };
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  state.timelineWrap.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch") return;
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchInitial && activePointers.size >= 2) {
      const m = pinchMidAndDist();
      if (!m || pinchInitial.dist < 1) return;
      setZoom(pinchInitial.zoom * (m.dist / pinchInitial.dist), state, m.midX, m.midY);
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  function endPinch(e) {
    if (e.pointerType !== "touch") return;
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchInitial = null;
  }
  state.timelineWrap.addEventListener("pointerup", endPinch, true);
  state.timelineWrap.addEventListener("pointercancel", endPinch, true);

  state.timelineWrap.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(state.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), state, e.clientX, e.clientY);
      return;
    }
    if (isHorizontal() && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      state.timelineWrap.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });
}
