# Replay.gg

A desktop app for recording gameplay and creating clips from any PC game.

Electron + React + TypeScript, built with electron-vite.

---

## Requirements

**ffmpeg is required.** The app runs without it, but recording and clipping are
disabled and the Home screen shows a setup prompt. Resolution order:

1. `REPLAYGG_FFMPEG_DIR` environment variable
2. `resources/ffmpeg/ffmpeg.exe` next to the app
3. `ffmpeg` on your `PATH`

`ffprobe` is found the same way and is used for media metadata and thumbnails.

## Getting started

```bash
npm install
npm run dev        # hot-reloading dev build
npm run build      # typecheck + production bundles
npm run package    # unpacked Windows build
npm run dist       # Windows installer
```

---

## Architecture

```
src/
  shared/          Types + the IPC channel contract. Imported by all three
                   processes; no Node or DOM imports allowed here.
  main/
    index.ts       App lifecycle, window, tray, custom media protocol
    ipc.ts         Binds every channel to a service. Handlers stay thin.
    store.ts       Atomic JSON persistence (temp file + rename)
    services/
      ffmpeg.ts        Binary discovery, encoder probing, probe/thumbnail
      captureArgs.ts   Settings -> ffmpeg argv
      recorder.ts      Full-session recording
      replayBuffer.ts  Instant Replay (rolling segments)
      library.ts       Media index, search, clip creation
      settings.ts      Persisted preferences
      hotkeys.ts       Global shortcut registration
      games.ts         Foreground game detection
      storage.ts       Disk usage, displays, capabilities
  preload/         contextBridge surface. The renderer sees nothing else.
  renderer/        React UI
    state/         AppContext: capture status, settings, capabilities
    components/    Shell, media browser, player, UI primitives
    screens/       Home, Recordings, Clips, Library, Settings
    styles/        Design tokens (theme.css) + global styles
```

### Adding a capability

1. Add the channel to `src/shared/ipc.ts`
2. Implement it in a `src/main/services/*` module
3. Bind it in `src/main/ipc.ts`
4. Expose it on the preload API in `src/preload/index.ts`
5. Call it from the renderer via `window.replay.*`

The contract lives in one file so the three processes cannot drift.

---

## How capture works

Both the recorder and the replay buffer build their ffmpeg argv from the same
`buildCaptureArgs()`, so the capture pipeline is identical and only the muxer
differs.

**Recording** writes a single MP4. Stopping sends `q` on stdin rather than
killing the process — ffmpeg needs to flush the moov atom or the file is
unplayable.

**Instant Replay** writes a continuous stream of 5-second MPEG-TS segments to a
scratch directory and prunes anything past the configured window. Saving
concatenates the newest segments; MPEG-TS is used precisely because it joins
losslessly with `-c copy`, which makes saves near-instant. Seeks are done
before `-i` so a stream-copied clip starts on a keyframe.

**Encoder selection** actually probes. Checking `ffmpeg -encoders` only proves
the binary was *built* with an encoder, not that this machine can run it — an
NVENC-enabled build on an AMD box lists `h264_nvenc` and then fails at capture
time with `Cannot load nvcuda.dll`. `probeEncoders()` encodes three synthetic
frames with each candidate and caches the result.

**Display selection** passes an explicit region to `gdigrab`. Without one it
grabs the union of every monitor, so a dual-1080p setup would silently produce
3840x1080 files.

**Webcam overlay** adds the camera as a second dshow input (index 1, right
after the desktop capture) and composites it with `scale2ref` + `overlay` in
one `-filter_complex` graph — `scale2ref` sizes the camera as a fraction of
the *desktop* frame's width regardless of output resolution, and `overlay`'s
own `W`/`H`/`w`/`h` variables place it in a corner without either filter
needing to know the actual pixel dimensions. Enabling it switches the whole
pipeline off `-vf` and onto `-filter_complex` for both video and any audio
mix — ffmpeg allows only one — so audio input indices shift up by one to make
room for the camera at index 1.

---

## Known gaps

- **System audio on Windows** needs a loopback device (Stereo Mix, VB-Cable,
  etc.). ffmpeg has no native WASAPI loopback input, so the Audio settings list
  DirectShow devices and the user picks one.
- **Game detection** identifies the foreground process via a short PowerShell
  call and maps it through a small known-titles table. It is a thin seam:
  replacing `detectActiveGame()` swaps the whole strategy.
- **Tray icon** is an empty image pending branding art.

## Designed-for, not yet built

The seams for these exist (IPC contract, service layer, library metadata):
live streaming, cloud sync, AI highlight detection, automatic clipping,
friends/communities, shared clips, a built-in editor, performance stats,
a game launcher, and plugins.
