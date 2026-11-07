# Fonts

**OpenDyslexic** (Regular, Bold, Italic, Bold Italic), the player's dyslexia-friendly font setting. © Abbie Gonzalez, with Reserved Font Name OpenDyslexic, under the **SIL Open Font License 1.1** (`OFL.txt`, unchanged). From [antijingoist/opendyslexic](https://github.com/antijingoist/opendyslexic) `compiled/`, commit `1824da5` (2025-08-11), unmodified.

They aren't in the CSS: a host serves this folder (the player's `fontBase`, default `/fonts/`), and the player loads a face only when someone chooses that font, so a strict CSP needs only `font-src 'self'`.
