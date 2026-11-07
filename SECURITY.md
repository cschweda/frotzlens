# Security

Frotzlens reads story files that anyone can make, so a hostile file is something it expects. The parser treats every byte as untrusted and never throws. The site loads nothing from other origins. The Play view runs a story in a sandboxed, opaque-origin iframe ([docs/07-play.md](docs/07-play.md)).

## Reporting a problem

Please report a security problem privately, not in a public issue: use GitHub's [private vulnerability reporting](https://github.com/cschweda/frotzlens/security/advisories/new) for this repository. If that isn't available, open an issue that says only that you have a security report (no details), and you'll be given a private way to send it.

Say what you found, and how to see it: a crafted story file is welcome, attached or described. You'll get an answer within a few days.

## Supported versions

The live site ([frotzlens.frotzinc.com](https://frotzlens.frotzinc.com)) and the latest release of each package on npm.
