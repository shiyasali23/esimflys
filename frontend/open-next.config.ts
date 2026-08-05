import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * No incremental cache is configured, and none is needed: the only server fetch in
 * the app (src/server/rates.js) is cached indefinitely, so every page is fully static
 * and served from Workers Static Assets. Adding an R2 or KV cache here would cost
 * money and setup for nothing.
 *
 * If a revalidating fetch is ever introduced, this is where the cache goes.
 */
export default defineCloudflareConfig();
