// Downloads the pinned FFmpeg build into resources/ffmpeg so `npm run dist` can bundle it.
// The binaries are ~210 MB, so they are gitignored; run this once on a fresh checkout.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const VERSION = '9.0.2'
const NAME = `ffmpeg-${VERSION}-essentials_build`
const URL = `https://www.gyan.dev/ffmpeg/builds/packages/${NAME}.zip`
const SHA256 = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba'
const dest = join(import.meta.dirname, '..', 'resources', 'ffmpeg')

if (existsSync(join(dest, 'ffmpeg.exe')) && existsSync(join(dest, 'ffprobe.exe'))) {
  console.log('ffmpeg already present in resources/ffmpeg')
  process.exit(0)
}
const work = join(tmpdir(), `replaygg-ffmpeg-${Date.now()}`)
mkdirSync(work, { recursive: true })
const zip = join(work, 'ffmpeg.zip')
console.log(`Downloading ${URL}`)
writeFileSync(zip, Buffer.from(await (await fetch(URL)).arrayBuffer()))
const sha = createHash('sha256').update(readFileSync(zip)).digest('hex')
if (sha !== SHA256) throw new Error(`Checksum mismatch: ${sha}`)
execFileSync('tar', ['-xf', zip, '-C', work])
mkdirSync(dest, { recursive: true })
for (const f of ['ffmpeg.exe', 'ffprobe.exe']) copyFileSync(join(work, NAME, 'bin', f), join(dest, f))
copyFileSync(join(work, NAME, 'LICENSE'), join(dest, 'LICENSE.txt'))
writeFileSync(join(dest, 'SOURCE.txt'), `Unmodified FFmpeg ${VERSION} essentials build (GPL v3) by gyan.dev. Source: https://www.gyan.dev/ffmpeg/builds/ and https://ffmpeg.org/download.html\n`)
rmSync(work, { recursive: true, force: true })
console.log('ffmpeg ready in resources/ffmpeg')
