import type { Product } from '../utils/product'

/**
 * The app's identity for the family shell, from `product` in the app's app.config.ts. Fails loudly
 * when it isn't set, so a new app finds out at once rather than showing "undefined" in its header.
 */
export function useProduct(): Product {
  const product = useAppConfig().product as Product | undefined
  if (!product) throw new Error('@frotzinc/nuxt-base: set `product` in your app.config.ts (see the nuxt-base README).')
  return product
}
