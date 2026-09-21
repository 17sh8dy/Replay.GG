# Replay.gg logo

The **R + Rewind** mark, redrawn as vectors from `source/replay-gg-logo-concepts.png`.
The mark is built from measured geometry (straight edges, two arcs, two rounded triangles);
the wordmark is traced from the artwork and smoothed.

Colours: red `#E6293F`, white `#FFFFFF`, background `#080808`.

## SVG (masters)

| File | Use |
| --- | --- |
| `replay-gg-mark.svg` | Mark only, transparent, white R. For dark backgrounds. |
| `replay-gg-mark-on-light.svg` | Mark only, transparent, dark R. For light backgrounds. |
| `replay-gg-icon.svg` | Mark on a `#080808` square. App / installer / social avatar. |
| `replay-gg-logo.svg` | Mark + `REPLAY.GG` lockup, for dark backgrounds. |
| `replay-gg-logo-on-light.svg` | Lockup for light backgrounds. |
| `replay-gg-wordmark.svg` | `REPLAY.GG` text only. |

## PNG (`png/`)

- `replay-gg-icon-{16,32,48,64,128,256,512,1024}.png`
- `replay-gg-mark-{…}.png` and `replay-gg-mark-on-light-{…}.png` (transparent)
- `replay-gg-logo-{512,1024}.png` and `replay-gg-logo-on-light-{512,1024}.png` (width)
- `replay-gg.ico` — 16 / 32 / 48 / 64 / 128 / 256, used by the Windows installer and exe.

## Where the app uses it

- Title bar: `src/renderer/src/components/Logo.tsx` (the mark, inlined).
- Window / tray: `assets/logo/png/replay-gg-icon-*.png`.
- Installer and exe icon: `electron-builder.yml` → `win.icon`.

If you change an SVG, re-export the PNGs and `.ico`, and update `Logo.tsx` to match.
