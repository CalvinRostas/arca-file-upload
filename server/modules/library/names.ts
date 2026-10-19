import { InvalidInput } from '../errors'

const MAX_NAME_LENGTH = 255

/** Trim and validate a File or Folder name. Throws InvalidInput with a message fit for people. */
export function cleanName(raw: string): string {
  const name = raw.normalize('NFC').trim()
  if (!name) throw new InvalidInput('Names can’t be empty')
  if (name === '.' || name === '..') throw new InvalidInput('“.” and “..” can’t be used as names')
  if (/[/\\]/.test(name)) throw new InvalidInput('Names can’t contain / or \\')
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new InvalidInput('Names can’t contain control characters')
  if (name.length > MAX_NAME_LENGTH) throw new InvalidInput(`Names can be at most ${MAX_NAME_LENGTH} characters`)
  return name
}

/** `photo.jpg` → `photo (1).jpg`, `photo (2).jpg`, … — the first one not in `taken` (lower-cased names). */
export function freeName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name.toLowerCase())) return name
  const dot = name.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  for (let n = 1; ; n++) {
    const candidate = `${stem} (${n})${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}
