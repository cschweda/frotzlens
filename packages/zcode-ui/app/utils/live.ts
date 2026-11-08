/**
 * A running machine, as a view sees it: where it is, and what changed since it last stopped. The
 * Debugger's own type (@frotzinc/zmachine, since frotztrace Phase 3), re-exported here: every view
 * takes it as an optional `live` prop; without one (frotzlens, a story file at rest) a view renders
 * exactly as it always has.
 */
export type { MachineView } from '@frotzinc/zmachine'
