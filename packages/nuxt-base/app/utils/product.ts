/**
 * Who the app is, for the family shell (AppHeader, AppFooter, AboutMenu, AboutDialogs, useAbout):
 * each app sets it as `product` in its own app.config.ts, and the shell reads it from there with
 * useProduct(). This is how the layer stays free of the app (boundary.test.ts): the app hands its
 * identity in; the layer never imports it.
 */
export interface Product {
  /** The app's name, as the header, the About menu and the dialogs say it: 'frotzlens'. */
  name: string
  /** One line on what it is, for the About dialog: 'See inside a Z-machine story file'. */
  tagline: string
  /** Where the logo and name in the header link to: '#overview' in a hash-routed app, or '/'. */
  homeHref: string
  /** The GitHub repository, with no trailing slash: report links, the changelog's file links, Source. */
  repoUrl: string
  /** The app's packages on npm, for the footer. */
  npmUrl: string
  /** frotz, inc.'s home. */
  familyUrl: string
  /** The About dialog's licences, in order: what, its licence, and a link to the licence text. */
  licences: ProductLicence[]
}

export interface ProductLicence {
  what: string
  licence: string
  href: string
}

/** A security report goes here, never to a public issue. */
export const securityUrl = (repoUrl: string) => `${repoUrl}/blob/main/SECURITY.md`
