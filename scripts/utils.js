export function isHorizontal() {
  return document.body.classList.contains("horizontal");
}

export function snapTime(t, state) {
  if (state.snapDivision <= 0) return t;
  const secondsPerBeat = 60 / state.bpm;
  const step = secondsPerBeat / state.snapDivision;
  return Math.round(t / step) * step;
}

export function timeFromEvent(e, state) {
  const rect = state.grid.getBoundingClientRect();
  if (isHorizontal()) {
    return Math.max(0, Math.min(state.duration, (e.clientX - rect.left) / state.PX_PER_SECOND));
  }
  return Math.max(0, Math.min(state.duration, (rect.bottom - e.clientY) / state.PX_PER_SECOND));
}

export function laneFromEvent(e, state) {
  const rect = state.grid.getBoundingClientRect();
  if (isHorizontal()) {
    const y = e.clientY - rect.top;
    const laneH = rect.height / state.LANES;
    return Math.max(0, Math.min(state.LANES - 1, Math.floor(y / laneH)));
  }
  const x = e.clientX - rect.left;
  const laneW = rect.width / state.LANES;
  return Math.max(0, Math.min(state.LANES - 1, Math.floor(x / laneW)));
}
