import type { Product } from './utils/product'

export default defineAppConfig({
  ui: {
    // Amber is the brand ("frotz-glow" / the forge); green & red are reserved
    // for compile status so they always read as success / failure.
    colors: {
      primary: 'amber',
      secondary: 'orange',
      success: 'green',
      info: 'sky',
      warning: 'yellow',
      error: 'red',
      neutral: 'slate',
    },
  },
})

// The app sets `product` (who it is) in its own app.config.ts; the family shell reads it with
// useProduct(). Typed here so a missing or misspelled field is a type error in the app.
declare module 'nuxt/schema' {
  interface AppConfigInput {
    product?: Product
  }
  interface AppConfig {
    product?: Product
  }
}
