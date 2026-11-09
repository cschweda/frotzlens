// Report a problem / Suggest a feature, by email (Resend), for frotzplay. The work is in @frotzinc/nuxt-base;
// RESEND_API_KEY, REPORT_TO and REPORT_FROM are this site's Netlify environment variables. Without
// them it answers 503, and the About menu's report dialog offers GitHub instead.
// It takes same-site JSON posts only, and sends at most 100 reports a day, counted in Netlify Blobs
// (@frotzinc/nuxt-base/netlify/report-guard).
import { getStore } from '@netlify/blobs'
import { createReportHandler } from '@frotzinc/nuxt-base/netlify/report'

export default createReportHandler({ app: 'frotzplay', store: () => getStore({ name: 'report-count', consistency: 'strong' }) })
