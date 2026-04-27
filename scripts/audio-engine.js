let audioCtx = null;
let audioBuffer = null;
let audioOnsets = [];
let audioHolds = [];
export function getAudioBuffer() { return audioBuffer; }
export function getAudioOnsets() { return audioOnsets; }
export function getAudioHolds()  { return audioHolds; }
export function ensureAudioCtx() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}
function playTone(opts) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type || "sine";
  osc.frequency.setValueAtTime(opts.startFreq, now);
  if (opts.endFreq != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), now + opts.duration);
  }
  const peak = opts.volume != null ? opts.volume : 0.18;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + opts.duration + 0.02);
}
export function sfxTick() {
  playTone({ type: "sine", startFreq: 1300, endFreq: 950, duration: 0.07, volume: 0.16 });
}
export function sfxClick() {
  playTone({ type: "triangle", startFreq: 720, endFreq: 600, duration: 0.04, volume: 0.1 });
}
export function sfxPop() {
  playTone({ type: "sine", startFreq: 580, endFreq: 180, duration: 0.1, volume: 0.18 });
}
export function detectOnsets(buffer) {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const sampleRate = buffer.sampleRate;
  const windowSize = 1024;
  const numWindows = Math.floor(ch0.length / windowSize);
  if (numWindows < 8) return [];
  const energy = new Float32Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    const off = w * windowSize;
    let sum = 0;
    if (ch1) {
      for (let i = 0; i < windowSize; i++) {
        const v = (ch0[off + i] + ch1[off + i]) * 0.5;
        sum += v * v;
      }
    } else {
      for (let i = 0; i < windowSize; i++) {
        const v = ch0[off + i];
        sum += v * v;
      }
    }
    energy[w] = Math.log1p(2000 * Math.sqrt(sum / windowSize));
  }
  const flux = new Float32Array(numWindows);
  for (let w = 1; w < numWindows; w++) {
    const d = energy[w] - energy[w - 1];
    flux[w] = d > 0 ? d : 0;
  }
  const radius = Math.max(8, Math.ceil(sampleRate / windowSize));
  const novelty = new Float32Array(numWindows);
  const tmp = [];
  for (let w = 0; w < numWindows; w++) {
    const lo = Math.max(0, w - radius);
    const hi = Math.min(numWindows - 1, w + radius);
    tmp.length = 0;
    for (let k = lo; k <= hi; k++) tmp.push(flux[k]);
    tmp.sort((a, b) => a - b);
    const median = tmp[tmp.length >> 1];
    const v = flux[w] - median * 1.5;
    novelty[w] = v > 0 ? v : 0;
  }
  const candidates = [];
  for (let w = 1; w < numWindows - 1; w++) {
    if (
      novelty[w] > 0 &&
      novelty[w] > novelty[w - 1] &&
      novelty[w] >= novelty[w + 1]
    ) {
      candidates.push({ w, strength: novelty[w] });
    }
  }
  if (candidates.length === 0) return [];
  candidates.sort((a, b) => b.strength - a.strength);
  const minSpacingW = Math.max(4, Math.ceil((0.12 * sampleRate) / windowSize));
  const songDuration = buffer.duration;
  const maxOnsets = Math.max(8, Math.floor(songDuration * 2.5));
  const blocked = new Uint8Array(numWindows);
  const taken = [];
  let maxStrength = 0;
  for (const c of candidates) {
    if (taken.length >= maxOnsets) break;
    if (blocked[c.w]) continue;
    taken.push(c);
    if (c.strength > maxStrength) maxStrength = c.strength;
    const lo = Math.max(0, c.w - minSpacingW);
    const hi = Math.min(numWindows - 1, c.w + minSpacingW);
    for (let i = lo; i <= hi; i++) blocked[i] = 1;
  }
  taken.sort((a, b) => a.w - b.w);
  const norm = maxStrength || 1;
  const result = [];
  for (let i = 0; i < taken.length; i++) {
    const time = (taken[i].w * windowSize) / sampleRate;
    const s = taken[i].strength / norm;
    let isolated = true;
    if (i > 0) {
      const prevT = (taken[i - 1].w * windowSize) / sampleRate;
      if (time - prevT < 0.35) isolated = false;
    }
    if (i < taken.length - 1) {
      const nextT = (taken[i + 1].w * windowSize) / sampleRate;
      if (nextT - time < 0.35) isolated = false;
    }
    const kind = s > 0.7 && isolated ? "flick" : "tap";
    result.push({ time, strength: s, kind });
  }
  return result;
}
export function detectHoldRegions(buffer, onsets) {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const sampleRate = buffer.sampleRate;
  const windowSize = 2048;
  const numWindows = Math.floor(ch0.length / windowSize);
  if (numWindows < 8) return [];
  const energy = new Float32Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    const off = w * windowSize;
    let sum = 0;
    if (ch1) {
      for (let i = 0; i < windowSize; i++) {
        const v = (ch0[off + i] + ch1[off + i]) * 0.5;
        sum += v * v;
      }
    } else {
      for (let i = 0; i < windowSize; i++) {
        const v = ch0[off + i];
        sum += v * v;
      }
    }
    energy[w] = Math.sqrt(sum / windowSize);
  }
  const sorted = Array.from(energy).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const p60 = sorted[Math.floor(sorted.length * 0.60)];
  const threshold = Math.min(median * 1.15, p60);
  const minWindowsForHold = Math.max(3, Math.ceil((0.3 * sampleRate) / windowSize));
  const maxGapWindows = 2;
  const onsetTimes = onsets.map((o) => o.time);
  const regions = [];
  let regionStart = -1;
  function maybeCloseRegion(endW) {
    if (regionStart < 0) return;
    if (endW - regionStart < minWindowsForHold) { regionStart = -1; return; }
    const startTime = (regionStart * windowSize) / sampleRate;
    const endTime   = (endW * windowSize) / sampleRate;
    const dur       = endTime - startTime;
    const onsetsInside = onsetTimes.filter((t) => t >= startTime && t < endTime).length;
    const allowedOnsets = Math.max(2, Math.floor(dur * 3));
    if (onsetsInside <= allowedOnsets) {
      regions.push({ time: startTime, duration: dur });
    }
    regionStart = -1;
  }
  let gapCount = 0;
  for (let w = 0; w < numWindows; w++) {
    if (energy[w] >= threshold) {
      if (regionStart < 0) regionStart = w;
      gapCount = 0;
    } else if (regionStart >= 0) {
      gapCount++;
      if (gapCount > maxGapWindows) {
        maybeCloseRegion(w - gapCount);
        gapCount = 0;
      }
    }
  }
  maybeCloseRegion(numWindows);
  return regions;
}
export async function loadAudioFile(file, state) {
  const { audio, durationInput } = state;
  audio.src = URL.createObjectURL(file);
  audio.load();
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctor();
    }
    const arrayBuffer = await file.arrayBuffer();
    audioBuffer = await new Promise((resolve, reject) => {
      try {
        const p = audioCtx.decodeAudioData(arrayBuffer.slice(0), resolve, reject);
        if (p && typeof p.then === "function") p.then(resolve, reject);
      } catch (err) { reject(err); }
    });
    audioOnsets = detectOnsets(audioBuffer);
    audioHolds  = detectHoldRegions(audioBuffer, audioOnsets);
    if (audioBuffer.duration > state.duration) {
      state.duration = Math.ceil(audioBuffer.duration);
      durationInput.value = String(state.duration);
    }
    state.renderGrid();
    state.resetScrollPosition();
  } catch (err) {
    console.warn("Could not decode audio for waveform:", err);
  }
}
