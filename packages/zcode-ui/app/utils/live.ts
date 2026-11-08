/**
 * A running machine, as a view sees it: where it is, and what changed since it last stopped.
 *
 * A placeholder until frotztrace's Phase 3, when @frotzinc/zmachine exports the real type and this
 * file re-exports it. Every view takes it as an optional `live` prop; without one (frotzlens, a
 * story file at rest) a view renders exactly as it always has.
 */
export interface MachineView {
  /** The program counter: the next instruction to run. */
  pc?: number
  /** Index of the frame being looked at (0 = the outermost). */
  frame?: number
  /** What the machine wrote since the last stop. */
  changed?: {
    addresses: ReadonlySet<number>
    objects: ReadonlySet<number>
    globals: ReadonlySet<number>
  }
}
