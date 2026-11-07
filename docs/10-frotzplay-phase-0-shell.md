# frotzplay — Phase 0: The Family Shell into `nuxt-base`

**Document 10 · frotzplay Phase 0** (frotzplay's design: [`frotzplay-design.md`](frotzplay-design.md))
**Deliverable:** the header, footer and About menu move from Frotzlens into `@frotzinc/nuxt-base`, so frotzplay shares them; Frotzlens unchanged. The `frotzplay` npm placeholder reserved.

> **Exit criteria:** Frotzlens's Playwright + axe suite passes unchanged; `nuxt-base`'s tests (the boundary test included) and both typechecks pass; `nuxt generate` builds; the header and footer look as they did. One commit, diff reviewed before push.

---

## 1. Rules for this phase

- **Behavior-preserving.** Frotzlens looks and works exactly as before.
- **The layer never imports from an app** (`boundary.test.ts`): no `~/`, `~~/`, `#imports`. The app hands its identity in through app config; the layer reads it.
- **Relicensed to MIT** (Chris's own code): every file moved below. Noted in `LICENSING.md`.

## 2. What moves

| From `apps/web` | To `packages/nuxt-base` | Change |
|---|---|---|
| `app/components/AppHeader.vue` | `app/components/` | Logo, name (→ `homeHref`), About menu, color mode. Frotzlens's parts go in two slots: `#context` (the open file) and `#actions` (Go to…, Names, Open another file, now Frotzlens's `HeaderActions.vue`). |
| `app/components/AppFooter.vue` | `app/components/` | Name and links from `product`. |
| `app/components/AboutMenu.vue` | `app/components/` | "About {name}", the update toasts, Source from `product`. |
| `app/components/AboutDialogs.vue` | `app/components/` | `changelog` is a prop (a layer can't import the app's `CHANGELOG.md`); licences, tagline, repo from `product`. |
| `app/composables/useAbout.ts` | `app/composables/` | `technicalDetails()` names the app from `product`. |
| `app/utils/report.ts` | `app/utils/` | `issueUrl`/`issueLink` take the repository URL; `REPO_URL`, `NEW_ISSUE_URL`, `SECURITY_URL` constants gone (`securityUrl(repo)` in `product.ts`). |
| `app/utils/markdown.ts` | `app/utils/` | None. |

**Stays in Frotzlens:** `AppNav` (Frotzlens's views), `site.config.ts` (SEO, the sample, the site URL), `DropZone`.

## 3. The product parameter

`nuxt-base/app/utils/product.ts`:

```ts
export interface Product {
  name: string; tagline: string; homeHref: string
  repoUrl: string; npmUrl: string; familyUrl: string
  licences: { what: string; licence: string; href: string }[]
}
```

`nuxt-base/app/app.config.ts` declares it on Nuxt's `AppConfig`/`AppConfigInput` (`nuxt/schema`), so a misspelled field in an app's `app.config.ts` is a type error (checked: `tagLine` fails `nuxt typecheck`). `useProduct()` reads it and throws a clear error when an app hasn't set it. Frotzlens's `app/app.config.ts` builds `product` from `site.config.ts`.

## 4. Checked

- Playwright (7 tests: the sample, every view, symbols and the map, Play, the About menu with its dialogs, 400 px, light-mode axe): green before and after, unchanged.
- `nuxt-base`: 75 tests, typecheck. `apps/web`: `nuxt typecheck`, `nuxt generate`.
- Tailwind picks up the layer's components: classes used only by the moved header (`backdrop-blur`, `bg-default/90`) are in the built CSS.
- The built site's Overview, header and footer compared with the live frotzlens.frotzinc.com: the same.

## 5. Left for Chris

- Publish the `frotzplay` npm placeholder (npm 2FA).
- Frotzsmith is on `nuxt-base` 0.1.0 from npm, so nothing changes there now. When it upgrades, these components register in it too; its own components of the same names take precedence, so nothing breaks.
