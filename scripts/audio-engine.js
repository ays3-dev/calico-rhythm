let audioCtx = null;
let audioBuffer = null;
let audioOnsets = [];

export function getAudioBuffer() { return audioBuffer; }
export function getAudioOnsets() { return audioOnsets; }

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
  if (numWindows < 4) return [];

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

  const flux = new Float32Array(numWindows);
  for (let w = 1; w < numWindows; w++) {
    const d = energy[w] - energy[w - 1];
    flux[w] = d > 0 ? d : 0;
  }

  const onsets = [];
  const localR = 20;
  const minSpacingW = Math.max(2, Math.ceil((0.08 * sampleRate) / windowSize));
  let lastOnsetW = -minSpacingW;

  for (let w = 1; w < numWindows - 1; w++) {
    let s = 0, n = 0;
    const lo = Math.max(0, w - localR);
    const hi = Math.min(numWindows - 1, w + localR);
    for (let k = lo; k <= hi; k++) { s += flux[k]; n++; }
    const localMean = n ? s / n : 0;
    const threshold = Math.max(0.006, localMean * 1.7);
    if (
      flux[w] > threshold &&
      flux[w] > flux[w - 1] &&
      flux[w] >= flux[w + 1] &&
      w - lastOnsetW >= minSpacingW
    ) {
      onsets.push((w * windowSize) / sampleRate);
      lastOnsetW = w;
    }
  }
  return onsets;
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
