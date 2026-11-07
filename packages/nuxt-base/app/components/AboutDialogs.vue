<script setup lang="ts">
/**
 * The About menu's dialogs: About the app (every version, the licences), What's new (the changelog,
 * as the repository has it at this build), and the report forms (a problem, a feature), which open
 * GitHub's issue form filled in. Nothing is sent from here.
 *
 * The app passes its changelog in (a layer can't import the app's files):
 *   import changelog from '../../CHANGELOG.md?raw'  →  <AboutDialogs :changelog="changelog" />
 */
const props = defineProps<{ changelog: string }>()
const product = useProduct()
const { dialog, close } = useAbout()
const about = useRuntimeConfig().public.about as { version: string; commit: string; date: string; packages: Record<string, string> }

const openAbout = computed({ get: () => dialog.value === 'about', set: v => !v && close() })
const openChangelog = computed({ get: () => dialog.value === 'changelog', set: v => !v && close() })
const openReport = computed({ get: () => dialog.value === 'problem' || dialog.value === 'idea', set: v => !v && close() })
const kind = computed<IssueKind>(() => (dialog.value === 'idea' ? 'idea' : 'problem'))

const changelogHtml = computed(() => markdownToHtml(props.changelog, product.repoUrl))
const SECURITY_URL = securityUrl(product.repoUrl)

const LICENCES = product.licences

const copied = ref('')
/** Copy to the clipboard and say so; true when it worked. */
async function copy(text: string, what: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = `${what} copied.`
    return true
  } catch {
    copied.value = 'Your browser didn’t allow copying. Select the text and copy it instead.'
    return false
  }
}

// The report form.
const draft = reactive<IssueDraft>({ kind: 'problem', title: '', happened: '', expected: '', story: '', idea: '', includeDetails: true })
const details = ref('')
watch(dialog, (d) => {
  copied.value = ''
  if (d === 'problem' || d === 'idea') {
    draft.kind = d
    details.value = technicalDetails()
  }
})
const required = computed(() => (kind.value === 'problem' ? draft.happened : draft.idea).trim().length > 0)
async function openIssue() {
  const { url, trimmed } = issueLink(product.repoUrl, draft, details.value)
  // The tab first, while the click still counts as the person's (a browser blocks a window opened
  // after an await). Then the whole text goes on the clipboard, so nothing is lost to a link cut short.
  window.open(url, '_blank', 'noopener,noreferrer')
  const ok = await copy(reportText(draft, details.value), 'The report')
  if (trimmed) {
    copied.value = ok
      ? 'The report was long, so the link carries a shortened copy. The whole report is on your clipboard to paste.'
      : 'The report was long, so the link carries a shortened copy, and your browser didn’t allow copying the rest: use Copy the report, or select the text above.'
  }
}
</script>

<template>
  <!-- About the app -->
  <UModal v-model:open="openAbout" :title="`About ${product.name}`" :description="`Version ${about.version}`">
    <template #body>
      <div class="flex flex-col gap-5 text-sm">
        <p>{{ product.tagline }}: disassemble it, explore it and play it, in your browser. Nothing is uploaded.</p>
        <section aria-labelledby="about-versions" class="flex flex-col gap-2">
          <h3 id="about-versions" class="font-semibold text-highlighted">Versions</h3>
          <dl class="data grid grid-cols-[max-content_minmax(0,1fr)] [&_dd]:[overflow-wrap:anywhere] gap-x-6 gap-y-1">
            <dt class="text-muted">{{ product.name }}</dt>
            <dd>{{ about.version }}<span v-if="about.commit" class="text-muted"> · {{ about.commit }}{{ about.date ? `, ${about.date}` : '' }}</span></dd>
            <template v-for="(v, name) in about.packages" :key="name">
              <dt class="text-muted">{{ name }}</dt>
              <dd>{{ v }}</dd>
            </template>
          </dl>
        </section>
        <section aria-labelledby="about-licences" class="flex flex-col gap-2">
          <h3 id="about-licences" class="font-semibold text-highlighted">Licences</h3>
          <ul class="flex flex-col gap-1.5">
            <li v-for="l in LICENCES" :key="l.what">
              {{ l.what }}: <a :href="l.href" target="_blank" rel="noopener noreferrer" class="text-lamp underline decoration-dotted underline-offset-4 hover:decoration-solid">{{ l.licence }}</a>
            </li>
          </ul>
        </section>
        <p class="text-muted">
          From <a :href="product.familyUrl" class="text-lamp underline decoration-dotted underline-offset-4">frotz, inc.</a>, a fiction: the Frotz interpreter is the work of its own authors and is not affiliated.
        </p>
        <p v-if="copied" role="status" class="text-muted">{{ copied }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" icon="i-lucide-clipboard" @click="copy(technicalDetails(), 'The technical details')">Copy technical details</UButton>
        <UButton color="neutral" variant="outline" icon="i-lucide-scroll-text" @click="dialog = 'changelog'">What’s new</UButton>
        <UButton color="neutral" variant="outline" icon="i-lucide-github" :to="product.repoUrl" target="_blank">Source</UButton>
      </div>
    </template>
  </UModal>

  <!-- What's new: the changelog -->
  <UModal v-model:open="openChangelog" title="What’s new" :description="`${product.name}’s changelog, newest first.`" :ui="{ content: 'max-w-3xl' }">
    <template #body>
      <!-- eslint-disable-next-line vue/no-v-html -- markdownToHtml escapes the text first (utils/markdown.ts) -->
      <div class="changelog text-sm" v-html="changelogHtml" />
    </template>
  </UModal>

  <!-- Report a problem / Suggest a feature -->
  <UModal v-model:open="openReport" :title="KINDS[kind].name" :description="`This opens GitHub’s issue form with what you write filled in. You review it and submit it there; ${product.name} sends nothing.`">
    <template #body>
      <form class="flex flex-col gap-4 text-sm" @submit.prevent="openIssue">
        <UFormField label="Title" name="title">
          <UInput v-model="draft.title" class="w-full" :placeholder="kind === 'problem' ? 'In a few words' : 'Your idea, in a few words'" />
        </UFormField>
        <template v-if="kind === 'problem'">
          <UFormField label="What happened" name="happened" required>
            <UTextarea v-model="draft.happened" :rows="4" class="w-full" />
          </UFormField>
          <UFormField label="What you expected" name="expected">
            <UTextarea v-model="draft.expected" :rows="2" class="w-full" />
          </UFormField>
          <UFormField label="The story file" name="story" help="Its name, version and what made it, or a link if it’s public. The file itself is never sent.">
            <UTextarea v-model="draft.story" :rows="2" class="w-full" />
          </UFormField>
        </template>
        <UFormField v-else label="What you’d like" name="idea" required>
          <UTextarea v-model="draft.idea" :rows="5" class="w-full" />
        </UFormField>
        <UCheckbox v-model="draft.includeDetails" :label="`Include technical details (${product.name}’s version, the browser)`" />
        <details v-if="draft.includeDetails" class="rounded-md border border-default p-3">
          <summary class="cursor-pointer text-muted">What the technical details say</summary>
          <pre class="data mt-2 whitespace-pre-wrap text-xs">{{ details }}</pre>
        </details>
        <p class="text-muted">
          A security problem? Please don’t open a public issue: see
          <a :href="SECURITY_URL" target="_blank" rel="noopener noreferrer" class="text-lamp underline decoration-dotted underline-offset-4">SECURITY.md</a>.
        </p>
        <p v-if="copied" role="status" class="text-muted">{{ copied }}</p>
        <div class="flex flex-wrap gap-2">
          <UButton type="submit" icon="i-lucide-external-link" :disabled="!required">Open on GitHub</UButton>
          <UButton color="neutral" variant="outline" icon="i-lucide-clipboard" :disabled="!required" @click="copy(reportText(draft, details), 'The report')">Copy the report</UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>

<style scoped>
/* The changelog: headings and lists in the app's type, links underlined (WCAG 1.4.1). */
.changelog :deep(h2) { font-size: 1.15rem; font-weight: 700; margin: 1.25rem 0 0.5rem; color: var(--ui-text-highlighted); }
.changelog :deep(h3) { font-size: 1rem; font-weight: 600; margin: 1rem 0 0.4rem; color: var(--ui-text-highlighted); }
.changelog :deep(h4) { font-weight: 600; margin: 0.75rem 0 0.25rem; }
.changelog :deep(p) { margin: 0.5rem 0; }
.changelog :deep(ul) { list-style: disc; padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.3rem; }
.changelog :deep(code) { font-family: var(--font-mono); font-size: 0.9em; }
.changelog :deep(a) { color: var(--frotz-lamp-text); text-decoration: underline dotted; text-underline-offset: 4px; }
</style>
