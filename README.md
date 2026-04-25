# 🐾 Calico | Rhythm Chart Editor

A lightweight, professional-grade chart editor for rhythm game development. Calico balances cute, user-centric design with high-level technical features like automated onset detection and multi-dimensional viewport control.
Built to explore real-time audio visualization, rhythm structure design, and low-level browser audio processing without external frameworks.

<p align="center">
  <img src="https://kaplumbagadeden.neocities.org/media/calico.png" alt="Screenshot of Calico" width="600"><br>
  🌐 <a href="https://calico-rhythm.netlify.app/"><b>Live Demo</b></a>
</p>

---

## **🚀 Key Features**

### 🎵 Chart Editing
- 5-lane rhythm chart system
- Tap, hold, and flick note types
- Drag-and-move notes freely
- Snap system:
  - 1 beat
  - 1/2 beat
  - 1/4 beat
  - 1/8 beat
  - 1/16 beat

### 🎧 Audio System
- Web Audio API playback engine
- Adjustable BPM and chart duration
- Supports custom audio file uploads
- Onset detection using spectral flux analysis
- Visual waveform with beat guidance markers

### 🎮 Interaction
- Zoom in/out up to 200%
- Vertical and horizontal layout modes
- Touch and mouse support
- Auto-scroll during playback
- Gesture controls (pinch, wheel, drag)

### 💾 Export
- Export chart data as JSON

### 🔊 Polish
- UI sound effects for interactions
- Responsive layout for mobile and desktop
- Toggleable interface for clean editing view

---

## **🛠️ Tech Stack**

- JavaScript (ES6+) with modular architecture
- Web Audio API (real-time playback, waveform analysis, onset detection)
- Canvas API (custom rendering engine for timeline visualization)
- HTML5 / CSS3 (responsive UI system)
- Custom event-driven architecture (state + input + rendering synchronization)

---

## ⚙️ Engineering Highlights

- Spectral flux-based onset detection for rhythm guidance
- Multi-layer rendering system (grid, notes, playhead, waveform)
- Time-synchronized state management across audio playback, input handling, and visual rendering
- High-frequency interaction handling (drag, zoom, gesture input)
- Performance-optimized canvas rendering for large chart datasets

---

## **📂 Project Structure**

calico-rhythm
├── index.html            # Entry point & UI structure
├── style.css             # UI styling and layout system
├── favicon.png           # Application icon asset
└── scripts/
    ├── script.js         # Application state, initialization, UI wiring
    ├── audio-engine.js   # Web Audio API (playback, file loading, onset detection)
    ├── renderer.js       # Canvas + DOM rendering system
    ├── controls.js       # User input, playback control, zoom, gestures
    ├── utils.js          # Pure helper functions (time, snapping, lane mapping)
    └── constants.js      # Global configuration values
    
---

## 💡 How It Works

1. The user loads an audio file into the editor  
2. Web Audio API processes playback and timing  
3. The audio engine performs onset detection using spectral flux to identify rhythmically significant peaks  
4. These onsets are visualized as beat-aligned guide markers across the timeline  
5. The renderer draws a multi-lane grid system using canvas  
6. Users place and edit notes which snap to the beat grid system  
7. The state layer synchronizes user input, audio playback, and visual rendering in real time  
8. Charts can be exported as structured JSON for external use

---

## 📄 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

