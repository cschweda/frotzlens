/**
 * The view is the URL hash, so every view can be bookmarked and shared: #overview,
 * #routine/27f8, #object/47, #string/1352c, #dict/215d, #memory/objects.
 * A model Id maps to a route one to one: its first ':' becomes '/'.
 */
export interface HashRoute {
  view: string
  id?: string
}

const current = ref<HashRoute>({ view: 'overview' })

function read(): HashRoute {
  let h: string
  try {
    h = decodeURIComponent(location.hash.replace(/^#/, ''))
  } catch {
    return { view: 'overview' } // a malformed escape (a stray '%'): not a route
  }
  if (!h) return { view: 'overview' }
  const slash = h.indexOf('/')
  return slash < 0 ? { view: h } : { view: h.slice(0, slash), id: h.slice(slash + 1) }
}

let listening = false

export function useHashRoute() {
  if (import.meta.client && !listening) {
    listening = true
    current.value = read()
    window.addEventListener('hashchange', () => (current.value = read()))
  }
  /** Go to a route: `go('routine', '27f8')`, or a model Id: `goToId('routine:27f8')`. */
  const go = (view: string, id?: string) => {
    location.hash = id ? `${view}/${id}` : view
  }
  const goToId = (id: string) => {
    const i = id.indexOf(':')
    go(id.slice(0, i), id.slice(i + 1))
  }
  /** Replace the current route without a history entry (replaceState fires no hashchange). */
  const replace = (view: string) => {
    history.replaceState(null, '', `#${view}`)
    current.value = read()
  }
  return { route: current, go, goToId, replace }
}
