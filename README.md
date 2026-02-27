# Uinderal Music Player

A zero-dependency web-based audio/video player for synchronized A/B comparison of two tracks. Built for comparing instrumentals against vocals, reviewing mixes, karaoke practice, or any workflow where you need instant switching between two aligned audio sources. Themed with a dark red/black D&D-inspired aesthetic complete with ember particle effects.

## Quick Start

```
node server.js
```

Or double-click `start.bat` on Windows. Opens automatically at `http://localhost:3000`.

**Requirements:** Node.js (no npm install needed — uses only built-in modules).

## Features

- **Instant A/B Toggle** — Switch between Track A and Track B with zero latency
- **Auto Sync** — Cross-correlation-based automatic alignment of two tracks
- **Advanced Align** — Drag Track B's waveform to manually set a millisecond-precise offset
- **Waveform Visualization** — Audacity-style peak display with zoom, pan, and time markers
- **Trim & Loop** — Set start/end boundaries and loop a section
- **Config System** — Save/load track pairs with all settings (offset, trim, volume, loop) as `.dtp.json` files
- **Home Page** — Browse saved configs by name, search, and click to auto-load
- **Song Browser** — Built-in file browser for a local `songs/` directory with search, folder navigation, and one-click loading
- **Video Support** — Load video files and see synced dual video playback
- **Animations & Effects** — Page load animations, interactive hover effects, glowing ember particle background
- **Keyboard Shortcuts** — `Space` play/pause, `T` toggle, `Arrow` seek, `+`/`-` zoom, `0` fit, `M` mute

## Supported Formats

| Type  | Formats                                  |
|-------|------------------------------------------|
| Audio | MP3, WAV, OGG, FLAC, AAC, M4A, WMA      |
| Video | MP4, WEBM, MKV, AVI, MOV                |

## Loading Tracks

There are two ways to load audio/video files:

1. **File Picker / Drag & Drop** — Click a drop zone or drag files directly onto it
2. **Song Browser** — Click "Browse Songs" to pick from files in the `songs/` directory. Place your audio/video files in the `songs/` folder (created automatically on first run) and they'll appear in the browser with folder navigation and search.

## Project Structure

```
index.html            Main UI
server.js             Node.js HTTP server + config/songs API
start.bat             Windows launcher
configs/              Saved configurations (.dtp.json)
songs/                Local song library (gitignored)
css/
  styles.css          Dark red/black theme, animations, decorations
js/
  app.js              Entry point, module wiring
  audio-engine.js     Web Audio API dual-track playback & sync
  file-loader.js      Drag-drop and path-based file loading
  waveform.js         Peak computation, canvas drawing, zoom/pan
  timeline.js         Progress bar and seeking
  trim-controller.js  Trim marker drag handling
  ui-controls.js      Buttons, keyboard shortcuts, volume
  config-manager.js   Save/load .dtp.json configurations
  home.js             Config browser landing page
  song-browser.js     Built-in song directory browser
  video-manager.js    Dual video display
  particles.js        Floating ember particle canvas
```

## How It Works

Both tracks play simultaneously through the Web Audio API. `GainNode` controls which track is audible — the inactive track plays at -60dB to keep the browser decoding it, enabling instant switching. A `requestAnimationFrame` sync loop keeps the two media elements aligned within 20ms.

Configs store file paths, track offset, trim boundaries, volume, and loop state. The server provides API endpoints to list, read, save configs, browse the songs directory, and resolve file paths.
