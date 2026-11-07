// Vendored from Frotzsmith (app/modules/inform6/engine/ZmachineEngine.ts @ cf87b65), GPL-3.0-or-later.
// Changed: boot() keeps the VM so header() can read back what ZVM wrote into the header.
import type { EngineTarget, TurnRecord } from './StoryEngine.js'
import { createGlk } from './glk.js'
import { HeadlessGlkOte } from './headless-glkote.js'
import { HeadlessDialog } from './headless-dialog.js'
import { normalizeTurnOutput } from './normalizeTurnOutput.js'
// @ts-expect-error — ifvms ships no types.
import ZVMm from 'ifvms'

const ZVM = (ZVMm as { ZVM: new () => unknown }).ZVM

export class ZmachineEngine {
  readonly target: EngineTarget = 'zmachine'
  private story!: Uint8Array
  private glkote!: HeadlessGlkOte
  private _awaitingLine = false
  private vm: { m: { getUint8Array(offset: number, length: number): Uint8Array } } | null = null

  get awaitingLine(): boolean { return this._awaitingLine }

  async boot(story: Uint8Array): Promise<string> {
    this.story = story
    this.glkote = new HeadlessGlkOte()
    // Fresh Glk per boot — glkapi is a singleton; see glk.ts.
    const Glk = await createGlk()
    const vm = new ZVM() as { prepare(data: Uint8Array, opts: unknown): void }
    const options = { vm, Dialog: new HeadlessDialog(), Glk, GlkOte: this.glkote }
    vm.prepare(story, options)
    this.vm = vm as unknown as typeof this.vm
    Glk.init(options)
    const turn = await this.glkote.nextTurn()
    this._awaitingLine = turn.wantsLine
    return normalizeTurnOutput(turn.buffer, this.target)
  }

  async send(command: string): Promise<TurnRecord> {
    this.glkote.sendLine(command)
    const turn = await this.glkote.nextTurn()
    this._awaitingLine = turn.wantsLine
    const out = normalizeTurnOutput(turn.buffer, this.target)
    // glkapi echoes the accepted input line into the buffer; drop a leading echo
    // of the command (the UI already shows it as the `>` prompt header).
    const nl = out.indexOf('\n')
    const firstLine = (nl === -1 ? out : out.slice(0, nl)).trim()
    const output = firstLine === command.trim() ? out.slice(nl === -1 ? out.length : nl + 1).replace(/^\n+/, '') : out
    return { command, output, status: turn.grid || undefined }
  }

  /** The first 64 bytes of memory as ZVM has them now (after boot: the header as ZVM set it). */
  header(): Uint8Array {
    if (!this.vm) throw new Error('not booted')
    return this.vm.m.getUint8Array(0, 64).slice()
  }

  async reset(): Promise<string> {
    return this.boot(this.story)
  }
}
