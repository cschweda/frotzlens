/**
 * Phase 6, decompiling to Inform 6: where it stands. The Source view shows this until the routines read
 * well (step 6c); then the view shows the source itself. Update it as each step lands.
 */
export const DECOMPILER_DESIGN_URL = 'https://github.com/cschweda/frotzlens/blob/main/docs/09-decompiler.md'

export type StepState = 'done' | 'working' | 'planned'

export const DECOMPILER_STEPS: { id: string; title: string; detail: string; state: StepState }[] = [
  { id: '6a', title: 'Declarations', detail: 'The library left out as an Include; objects, classes, attributes, properties, globals, arrays and grammar written as Inform declares them; routines as Inform assembly. Done, with or without the story\'s debug file: every test game compiles again to an equivalent story, most to the same bytes.', state: 'done' },
  { id: '6b', title: 'Expressions', detail: 'The stack followed through each routine, so pushes and pulls become expressions, calls and prints.', state: 'planned' },
  { id: '6c', title: 'Control flow', detail: 'if, while, for and switch rebuilt from the branches; a jump only where nothing fits.', state: 'planned' },
  { id: '6d', title: 'Idioms and names', detail: 'obj.prop(), ofclass and the rest turned back from veneer calls; the source’s names from a debug file, or names made up from the story.', state: 'planned' },
  { id: '6e', title: 'In the app', detail: 'A Download .inf button; this view finished, for one routine or the whole game (it starts showing source at 6c); and frotzlens --inform in the CLI.', state: 'planned' },
]

export const STEP_LABEL: Record<StepState, string> = { done: 'Done', working: 'In progress', planned: 'Planned' }
