/** One entry in AppNav: a view, by its route key. */
export interface NavView {
  key: string
  label: string
  icon: string
  /** How many things the view lists, shown at the right. */
  count?: number
  /** A word shown at the right instead of a count. */
  tag?: string
}
