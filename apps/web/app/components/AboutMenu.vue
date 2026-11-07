<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { site } from '~~/site.config'

/**
 * The About menu in the header, as Drafter's Help menu: about Frotzlens (versions, licences), what's
 * new (the changelog), report a problem, suggest a feature, check for updates, and the source.
 */
const { show } = useAbout()
const toast = useToast()
const config = useRuntimeConfig()

/**
 * Is the site this page was loaded from still the newest? Nuxt's build manifest (served fresh,
 * never cached) names the build that's live; this page knows its own. A different one means a new
 * version was published since the page opened.
 */
async function checkForUpdates() {
  const mine = config.app.buildId
  const version = (config.public.about as { version: string }).version
  try {
    const res = await fetch('/_nuxt/builds/latest.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`${res.status}`)
    const live = (await res.json()) as { id?: string }
    if (live.id && live.id !== mine) {
      toast.add({
        title: 'A newer Frotzlens is available',
        description: 'Reload to use it. An open story file will need opening again.',
        icon: 'i-lucide-sparkles',
        actions: [{ label: 'Reload', onClick: () => location.reload() }],
      })
    } else {
      toast.add({ title: `Frotzlens ${version} is the latest`, description: 'You have the newest version of the site.', icon: 'i-lucide-check' })
    }
  } catch {
    toast.add({ title: 'Couldn’t check for updates', description: 'The site didn’t answer. Try again in a moment.', icon: 'i-lucide-wifi-off', color: 'warning' })
  }
}

const items: DropdownMenuItem[][] = [
  [
    { label: 'About Frotzlens', icon: 'i-lucide-info', onSelect: () => show('about') },
    { label: 'What’s new (changelog)', icon: 'i-lucide-scroll-text', onSelect: () => show('changelog') },
  ],
  [
    { label: 'Report a problem…', icon: 'i-lucide-bug', onSelect: () => show('problem') },
    { label: 'Suggest a feature…', icon: 'i-lucide-lightbulb', onSelect: () => show('idea') },
  ],
  [
    { label: 'Check for updates', icon: 'i-lucide-refresh-cw', onSelect: checkForUpdates },
    { label: 'Source on GitHub', icon: 'i-lucide-github', to: site.repoUrl, target: '_blank' },
  ],
]
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'end' }">
    <UButton color="neutral" variant="ghost" icon="i-lucide-circle-help" aria-label="About">
      <span class="hidden sm:inline">About</span>
      <UIcon name="i-lucide-chevron-down" class="hidden size-4 sm:inline" aria-hidden="true" />
    </UButton>
  </UDropdownMenu>
</template>
