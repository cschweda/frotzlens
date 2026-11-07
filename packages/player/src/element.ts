/**
 * <frotz-play>: the player as a web component (docs/15 §1), built as one self-contained classic
 * script (dist/frotz-play.js, Vue inside). It embeds under `script-src 'self'; style-src 'self'`:
 * the player's CSS is applied to the shadow root as a constructable stylesheet (which style-src
 * doesn't govern), never as a <style> tag, and nothing sets inline style attributes.
 *
 *   <script src="/frotz-play.js"></script>
 *   <frotz-play src="/stories/dark-cellar.z5" title="The Dark Cellar"></frotz-play>
 *
 * Attributes: src, title, seed, font-base (empty: no OpenDyslexic), autosave ("off").
 * Property: story (bytes). Events: turn, input-wanted, quit, save, error (CustomEvent, detail = [args]).
 */
import { defineComponent, defineCustomElement, h, ref, shallowRef, watch } from 'vue'
import css from './player.css?inline'
import ZPlayer from './components/ZPlayer.vue'

const HOST_CSS = ':host { display: block; height: 100%; min-height: 24rem; }'

const FrotzPlay = defineComponent({
  props: {
    src: String,
    title: String,
    seed: String,
    fontBase: { type: String, default: '/fonts/' },
    autosave: String,
    story: Object as () => Uint8Array,
  },
  emits: ['turn', 'input-wanted', 'quit', 'save', 'error'],
  setup(props, { emit }) {
    const bytes = shallowRef<Uint8Array | null>(props.story ?? null)
    const failed = ref('')

    async function load(src: string) {
      try {
        const res = await fetch(src)
        if (!res.ok) throw new Error(`${res.status}`)
        bytes.value = new Uint8Array(await res.arrayBuffer())
      } catch {
        failed.value = `The story at ${src} couldn’t be loaded.`
        emit('error', failed.value)
      }
    }
    watch(() => props.story, s => s && (bytes.value = s))
    watch(
      () => props.src,
      s => {
        if (s && !props.story) load(s)
      },
      { immediate: true },
    )

    return () =>
      bytes.value
        ? h(ZPlayer, {
            story: bytes.value,
            title: props.title || 'story',
            seed: props.seed !== undefined && /^-?\d+$/.test(props.seed) ? Number(props.seed) : undefined,
            fontBase: props.fontBase,
            autosave: props.autosave !== 'off',
            onTurn: (b: unknown) => emit('turn', b),
            'onInput-wanted': (k: unknown) => emit('input-wanted', k),
            onQuit: () => emit('quit'),
            onSave: (d: unknown) => emit('save', d),
            onError: (m: unknown) => emit('error', m),
          })
        : h('p', { class: 'zp', role: failed.value ? 'alert' : 'status' }, failed.value || 'Loading the story…')
  },
})

const Base = defineCustomElement(FrotzPlay, { shadowRoot: true })

let sheet: CSSStyleSheet | null = null

class FrotzPlayElement extends Base {
  constructor() {
    super()
    // The CSS, adopted (CSP-safe), not injected as <style>.
    if (!sheet) {
      sheet = new CSSStyleSheet()
      sheet.replaceSync(HOST_CSS + css)
    }
    if (this.shadowRoot) this.shadowRoot.adoptedStyleSheets = [sheet]
  }
}

if (!customElements.get('frotz-play')) customElements.define('frotz-play', FrotzPlayElement)

export { FrotzPlayElement }
