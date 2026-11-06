# Sample story files

Story files to try Frotzlens on, from tiny to large: drop one into the web app, or run the CLI on it
(`node packages/cli/dist/bin.js --objects samples/dark-cellar.z5`). They are Christopher Schweda's
own games and examples from [Frotzsmith](https://frotzsmith.com), compiled with Inform 6.44 by
`@frotzinc/inform6-wasm`; the sources are in [`src/`](src/).

To rebuild them (the bytes come out the same): `node scripts/build-samples.mjs`. Each is compiled with
`Serial "000000";`, so the serial number reads 000000.

Not here: the two *Haunted House* samples (derived from a 1979 commercial game) and Frotzsmith's ZIL
samples (from the GPL ZILF repository, and compiled by ZILF). These are for trying the tools; the test
suite builds its own fixtures (`packages/zcode/test/fixtures`).

| File | Size | Library | What it is |
|---|---|---|---|
| `minimal.z5` | 1.5 KB | none | MINIMAL — Frotzlens test fixture |
| `puny-dark-cellar.z3` | 27 KB | PunyInform | THE DARK CELLAR — Frotzsmith sample (PunyInform) |
| `puny-grammar.z3` | 27 KB | PunyInform | CUSTOM GRAMMAR — Frotzsmith sample (PunyInform) |
| `puny-locked-chest.z3` | 27 KB | PunyInform | THE LOCKED CHEST — Frotzsmith sample (PunyInform) |
| `puny-skeleton.z3` | 27 KB | PunyInform | PUNYINFORM SKELETON — Frotzsmith starter (PunyInform) |
| `puny-two-rooms.z3` | 27 KB | PunyInform | TWO ROOMS — Frotzsmith sample (PunyInform) |
| `puny-hermit.z3` | 27 KB | PunyInform | THE HERMIT — Frotzsmith sample (PunyInform) |
| `puny-switchable-lamp.z3` | 27 KB | PunyInform | SWITCHABLE LAMP — a device you turn on and off (PunyInform) |
| `puny-timed-candle.z3` | 27 KB | PunyInform | TIMED CANDLE — Frotzsmith sample (PunyInform) |
| `puny-dark-cellar.z5` | 28 KB | PunyInform | THE DARK CELLAR — Frotzsmith sample (PunyInform) |
| `puny-grammar.z5` | 28 KB | PunyInform | CUSTOM GRAMMAR — Frotzsmith sample (PunyInform) |
| `puny-locked-chest.z5` | 28 KB | PunyInform | THE LOCKED CHEST — Frotzsmith sample (PunyInform) |
| `puny-skeleton.z5` | 28 KB | PunyInform | PUNYINFORM SKELETON — Frotzsmith starter (PunyInform) |
| `puny-switchable-lamp.z5` | 28 KB | PunyInform | SWITCHABLE LAMP — a device you turn on and off (PunyInform) |
| `puny-timed-candle.z5` | 28 KB | PunyInform | TIMED CANDLE — Frotzsmith sample (PunyInform) |
| `puny-two-rooms.z5` | 28 KB | PunyInform | TWO ROOMS — Frotzsmith sample (PunyInform) |
| `puny-hermit.z5` | 28 KB | PunyInform | THE HERMIT — Frotzsmith sample (PunyInform) |
| `puny-magic-8-ball.z5` | 28 KB | PunyInform | MAGIC 8-BALL — random responses with random() (PunyInform) |
| `std-skeleton.z5` | 85 KB | Standard Library | INFORM 6 SKELETON — Frotzsmith starter (Standard Library) |
| `dark-cellar.z5` | 85 KB | Standard Library | THE DARK CELLAR — Frotzsmith sample (Inform 6 Standard Library) |
| `demo.z5` | 85 KB | Standard Library | FROTZSMITH DEMO — Standard Library two-room world |
| `grammar.z5` | 85 KB | Standard Library | CUSTOM GRAMMAR — Frotzsmith sample (Inform 6 Standard Library) |
| `hermit.z5` | 85 KB | Standard Library | THE HERMIT — Frotzsmith sample (Inform 6 Standard Library) |
| `list-exits.z5` | 85 KB | Standard Library | LIST EXITS — a std-only EXITS verb (Standard Library) |
| `locked-chest.z5` | 85 KB | Standard Library | THE LOCKED CHEST — Frotzsmith sample (Inform 6 Standard Library) |
| `magic-8-ball.z5` | 85 KB | Standard Library | MAGIC 8-BALL — random responses with random() (Standard Library) |
| `switchable-lamp.z5` | 85 KB | Standard Library | SWITCHABLE LAMP — a device you turn on and off (Standard Library) |
| `timed-candle.z5` | 85 KB | Standard Library | TIMED CANDLE — Frotzsmith sample (Inform 6 Standard Library) |
| `architect-legacy.z5` | 117 KB | Standard Library | THE ARCHITECT'S LEGACY -- Frotzsmith sample (Inform 6 Standard Library) |
| `architect-legacy.z8` | 120 KB | Standard Library | THE ARCHITECT'S LEGACY -- Frotzsmith sample (Inform 6 Standard Library) |
| `mingus-2.z5` | 123 KB | Standard Library | MINGUS II: EVERYTHING ROLLS DOWNHILL -- Frotzsmith sample (Inform 6 Std) |
| `mingus-2.z8` | 126 KB | Standard Library | MINGUS II: EVERYTHING ROLLS DOWNHILL -- Frotzsmith sample (Inform 6 Std) |
| `mingus-1.z5` | 132 KB | Standard Library | MINGUS I: ELEVATED RETURNS -- Frotzsmith sample (Inform 6 Standard Library) |
| `mingus-1.z8` | 135 KB | Standard Library | MINGUS I: ELEVATED RETURNS -- Frotzsmith sample (Inform 6 Standard Library) |

Copyright Christopher Schweda. The Inform 6 libraries compiled into them are the Inform Standard
Library (Artistic License 2.0) and PunyInform (MIT).
