import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * Minimal atomic JSON store. Deliberately dependency-free: the persistence
 * needs here are a couple of small documents, and owning the format keeps
 * migrations under our control.
 */
export class JsonStore<T extends object> {
  private readonly file: string
  private data: T

  constructor(fileName: string, private readonly defaults: T) {
    this.file = join(app.getPath('userData'), fileName)
    this.data = this.read()
  }

  private read(): T {
    try {
      if (!existsSync(this.file)) return structuredClone(this.defaults)
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<T>
      return mergeDeep(structuredClone(this.defaults), parsed)
    } catch (err) {
      console.error(`[store] failed to read ${this.file}, using defaults`, err)
      return structuredClone(this.defaults)
    }
  }

  get(): T {
    return this.data
  }

  set(next: T): T {
    this.data = next
    this.flush()
    return this.data
  }

  /** Deep-merges a partial patch over the current document. */
  patch(patch: DeepPartial<T>): T {
    this.data = mergeDeep(this.data, patch as Partial<T>)
    this.flush()
    return this.data
  }

  reset(): T {
    this.data = structuredClone(this.defaults)
    this.flush()
    return this.data
  }

  private flush(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      // Write to a sibling temp file then rename, so a crash mid-write cannot
      // leave a truncated document behind.
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
      renameSync(tmp, this.file)
    } catch (err) {
      console.error(`[store] failed to write ${this.file}`, err)
    }
  }
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeDeep<T extends object>(base: T, patch: Partial<T>): T {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = (base as Record<string, unknown>)[key]
    if (isPlainObject(value) && isPlainObject(current)) {
      mergeDeep(current, value)
    } else {
      ;(base as Record<string, unknown>)[key] = value
    }
  }
  return base
}
