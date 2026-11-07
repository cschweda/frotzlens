# Conformance suites

Two standard Z-machine test suites, unchanged, compiled at test time by `@frotzinc/inform6-wasm` (`../conformance.test.ts`). Each must pass, and print exactly what ZVM prints.

| File | What | From | Licence |
|---|---|---|---|
| `czech.inf` | **Czech 0.8**, the Comprehensive Z-machine Emulation CHecker, by Amir Karger: 349–406 tests, no input. Built as v3, v4, v5 and v8. | IF Archive, `infocom/interpreters/tools/czech_0_8.zip` (2003) | © 2003 Amir Karger. *"The copyright holder hereby grants the rights of usage, distribution and modification of this software to everyone and for any purpose, as long as this license and the copyright notice above are preserved and not modified."* The full README, with the licence, is `czech-README.txt`. |
| `praxix.inf` | **Praxix**, a Z-code interpreter unit test, by Zarf and Dannii. Run with `all`. Built as v5. | IF Archive, `infocom/interpreters/tools/praxix.zip` (2019) | *"Public domain, but please share your changes so we can improve the tests."* Its indirect-variable test is © 2003 Amir Karger (Czech's licence, above). |

Not covered by them: Standard 1.2 (`@gestalt` and the rest); Praxix stops there, since this interpreter is 1.1.
