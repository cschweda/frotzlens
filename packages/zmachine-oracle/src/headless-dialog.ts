// Vendored from frotzsmith (app/modules/inform6/engine/headless-dialog.ts @ cf87b65), GPL-3.0-or-later.
// Changed: given a Map, it keeps files in it (saves write, restores read), so ZVM can save and restore
// in tests; without one it behaves as before.
/**
 * Minimal in-memory Dialog. Headless replay performs no real file I/O, so save /
 * restore / `script on` are not honored — the GlkOte answers any fileref prompt
 * with "cancelled", which games tolerate. Enough to satisfy `Glk.init`.
 */
export class HeadlessDialog {
  streaming = false
  constructor(private readonly files?: Map<string, Uint8Array>) {}
  // glkapi probes a handful of methods; these no-ops keep it happy. The spike
  // (Step 7) adds any further method glkapi calls (it throws with the name).
  init() {}
  open() {}
  file_clean_fixed_name(filename: string) {
    return filename
  }
  file_construct_ref(filename = 'save', usage = 'save', gameid = '') {
    return this.files ? { filename, usage, gameid } : null
  }
  file_ref_exists(ref?: { filename: string }) {
    return !!(this.files && ref && this.files.has(ref.filename))
  }
  file_remove_ref(ref?: { filename: string }) {
    if (this.files && ref) this.files.delete(ref.filename)
  }
  file_write(ref: { filename: string } | undefined, content: ArrayLike<number> | string) {
    if (this.files && ref) this.files.set(ref.filename, typeof content === 'string' ? new Uint8Array(0) : Uint8Array.from(content))
  }
  file_read(ref?: { filename: string }) {
    const f = this.files && ref ? this.files.get(ref.filename) : undefined
    return f ? Array.from(f) : null
  }
}
