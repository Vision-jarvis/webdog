import "server-only";
import { pickBrandAssets, retrieveBrand } from "./context-client";
import { createDedupedCache, type DedupedCache } from "./deduped-cache";
import {
  STARTER_TEMPLATES,
  type StarterTemplateWithLogo,
} from "./starter-templates";

/**
 * Brand-logo lookups are expensive (each one costs context.dev credits), yet the
 * landing page and empty dashboard need logos for the same fixed set of well-known
 * domains on every render. We memoize by domain so a domain is fetched at most once
 * per TTL per process, and dedupe concurrent lookups so a burst of renders (or dev
 * hot-reloads) can't fan out into repeated retrievals.
 *
 * The cache lives on `globalThis` so it survives Next.js dev HMR module re-evaluation
 * (module-level state is otherwise reset on every code change).
 */
const TTL_MS = 1000 * 60 * 60 * 24; // 24h — logos rarely change.

const store = globalThis as typeof globalThis & {
  __brandLogoCache?: DedupedCache<string | null>;
};

const logoCache = (store.__brandLogoCache ??= createDedupedCache<string | null>({
  ttlMs: TTL_MS,
}));

async function fetchLogo(domain: string, apiKey: string): Promise<string | null> {
  try {
    const brand = await retrieveBrand(domain, { apiKey, maxAgeMs: TTL_MS });
    return pickBrandAssets(brand).logoUrl;
  } catch {
    return null;
  }
}

/** Resolve one domain's logo, served from cache when fresh and deduped while in flight. */
export async function getBrandLogoUrl(
  domain: string,
  apiKey: string | null,
): Promise<string | null> {
  if (!apiKey) return null;
  return logoCache.get(domain, (d) => fetchLogo(d, apiKey));
}

/** Resolve many domains at once, deduped, returning a `{ domain: logoUrl }` map. */
export async function getBrandLogoMap(
  domains: string[],
  apiKey: string | null,
): Promise<Record<string, string | null>> {
  const unique = [...new Set(domains)];
  const entries = await Promise.all(
    unique.map(async (domain) => [domain, await getBrandLogoUrl(domain, apiKey)] as const),
  );
  return Object.fromEntries(entries);
}

/** Starter templates with their brand logos resolved (empty state on landing/dashboard). */
export async function getStarterTemplatesWithLogos(
  apiKey: string | null,
): Promise<StarterTemplateWithLogo[]> {
  const logoMap = await getBrandLogoMap(
    STARTER_TEMPLATES.map((t) => t.domain),
    apiKey,
  );
  return STARTER_TEMPLATES.map((t) => ({ ...t, logoUrl: logoMap[t.domain] ?? null }));
}
