import { fileLengthScale } from './address.js'
import { Bytes } from './bytes.js'
import type { Header, ParseError, Version } from './types.js'

/** The header is the first 64 bytes (§11). */
export const HEADER_SIZE = 0x40

/** Bytes as text, with anything outside printable ASCII (0x20–0x7E) as '?'. */
export function printableAscii(b: ArrayLike<number>): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += b[i]! >= 0x20 && b[i]! <= 0x7e ? String.fromCharCode(b[i]!) : '?'
  return s
}

/**
 * Parse the header (§11). Assumes at least 64 bytes; the caller checks that.
 * Validation problems are recorded, never thrown.
 */
export function parseHeader(bytes: Bytes, errors: ParseError[]): Header {
  const version = bytes.byte(0x00)
  const scale = version >= 1 && version <= 8 ? fileLengthScale(version as Version) : 2
  const stored = bytes.word(0x1a)
  const fileLength = stored * scale
  const checksum = bytes.word(0x1c)

  const h: Header = {
    version,
    flags1: bytes.byte(0x01),
    release: bytes.word(0x02),
    highMemory: bytes.word(0x04),
    initialPc: bytes.word(0x06),
    dictionary: bytes.word(0x08),
    objects: bytes.word(0x0a),
    globals: bytes.word(0x0c),
    staticMemory: bytes.word(0x0e),
    flags2: bytes.word(0x10),
    serial: printableAscii(bytes.slice(0x12, 6)),
    abbreviations: bytes.word(0x18),
    fileLength,
    checksum,
    checksumOk: false,
  }

  // §11.1.6: the checksum is the unsigned sum of bytes 0x40 up to the file
  // length, mod 0x10000. A length of 0 (some very old files) means "not given":
  // the whole file is summed. A truncated file can't be checked at all.
  if (fileLength && fileLength < HEADER_SIZE) {
    errors.push({
      code: 'bad-header',
      severity: 'error',
      message: `The header says the file is ${fileLength} bytes, shorter than the 64-byte header itself.`,
    })
  } else if (fileLength > bytes.size) {
    errors.push({ code: 'truncated', severity: 'error', message: `The header says the file is ${fileLength} bytes; it is ${bytes.size}.` })
  } else {
    let sum = 0
    const end = fileLength || bytes.size
    for (let a = HEADER_SIZE; a < end; a++) sum = (sum + bytes.data[a]!) & 0xffff
    h.checksumOk = sum === checksum
    if (!h.checksumOk) {
      errors.push({
        code: 'checksum',
        severity: 'warning',
        message: `The header checksum is ${checksum.toString(16)}, but the file sums to ${sum.toString(16)}.`,
      })
    }
  }

  if (version === 6 || version === 7) {
    h.routinesOffset = bytes.word(0x28)
    h.stringsOffset = bytes.word(0x2a)
  }
  if (version >= 5) {
    h.terminatingChars = bytes.word(0x2e)
    h.alphabetTable = bytes.word(0x34)
    if (h.terminatingChars) h.terminatingKeys = readTerminatingKeys(bytes, h.terminatingChars, errors)
  }

  // The header extension table (§11.1.7): a length word, then that many words.
  // The Standard defines it for v5+; Inform writes one in every version.
  const ext = bytes.word(0x36)
  if (ext) {
    if (bytes.has(ext, 2)) {
      const declaredLength = bytes.word(ext)
      const words: number[] = []
      for (let i = 1; i <= declaredLength && bytes.has(ext + 2 * i, 2); i++) words.push(bytes.word(ext + 2 * i))
      if (words.length < declaredLength) {
        errors.push({
          code: 'bad-address',
          severity: 'error',
          address: ext,
          message: `The header extension table says it has ${declaredLength} words; only ${words.length} are in the file.`,
        })
      }
      h.headerExtension = { address: ext, declaredLength, words }
      if (words[2]) h.headerExtension.unicodeTable = words[2]
    } else {
      errors.push({ code: 'bad-address', severity: 'error', address: ext, message: 'The header extension table is outside the file.' })
    }
  }

  // Inform writes its compiler version, e.g. "6.44", as ASCII in 0x3C–0x3F.
  // The Standard leaves 0x38–0x3F to the compiler or user (§11, "username").
  const v = String.fromCharCode(...bytes.slice(0x3c, 4))
  if (/^\d\.\d\d$/.test(v)) h.inform = { compilerVersion: v }

  return h
}

/**
 * The terminating characters table (v5+, header 0x2E; §10.5.2.1): ZSCII
 * codes, ended by a 0. At most 256 are read.
 */
function readTerminatingKeys(bytes: Bytes, address: number, errors: ParseError[]): number[] {
  const keys: number[] = []
  let a = address
  for (; bytes.has(a) && bytes.byte(a) !== 0 && keys.length < 256; a++) keys.push(bytes.byte(a))
  if (!bytes.has(a) || (keys.length === 256 && bytes.byte(a) !== 0)) {
    errors.push({
      code: 'bad-address',
      severity: 'error',
      address,
      message: bytes.has(address)
        ? 'The terminating characters table has no 0 at its end.'
        : 'The terminating characters table is outside the file.',
    })
  }
  return keys
}
