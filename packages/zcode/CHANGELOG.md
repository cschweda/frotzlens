# Changelog

All notable changes to `@frotzinc/zcode`. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

- `parseStory(bytes)`: the header (§11), memory map (§1), text with abbreviations, custom alphabets and the Unicode table (§3), dictionary (§13), object table (§12) and globals (§6.2), for Z-machine versions 3, 4, 5 and 8. Never throws: problems come back in `errors`.
- `@frotzinc/zcode/format`: infodump-format text for the header, abbreviations, objects, object tree and dictionary, byte-identical to Ztools' `infodump` on every test fixture.
