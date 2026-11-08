# frotztrace (the site)

The site at [frotztrace.frotzinc.com](https://frotztrace.frotzinc.com): a debugger for Z-machine stories, in the browser. For now a page saying what it will do; the debugger arrives in Phase 4 of [its design](../../docs/frotztrace-design.md). Part of [frotz, Inc.](https://frotzinc.com). GPL-3.0-or-later.

It extends [`@frotzinc/nuxt-base`](../../packages/nuxt-base) and defines no colours, fonts or chrome of its own, so it looks exactly like frotzsmith, frotzlens and frotzplay.

```sh
pnpm --filter "frotztrace-web^..." run build   # the libraries it's built from
pnpm --filter frotztrace-web run dev            # http://localhost:3002
pnpm --filter frotztrace-web run generate       # the static site, in .output/public (dist on Netlify)
pnpm --filter frotztrace-web run test:e2e       # the generated site, served with netlify.toml's headers
```

**Netlify:** the site `frotztrace` (frotztrace.netlify.app) on Chris's personal team, the third on this repository: base directory `apps/trace`, production branch `main`; everything else is in [`netlify.toml`](netlify.toml). Node is pinned by [`.nvmrc`](.nvmrc) (22). Production deploys cost credits and Deploy Previews are free, so changes go through pull requests. The domain frotztrace.frotzinc.com is added once the site first deploys.
