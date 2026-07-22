// F-112: the optimized-site preview has a tiny, explicit page vocabulary.
// Keeping URL parsing and link construction here makes the services page
// refreshable/deep-linkable without expanding the frozen PreviewJson schema.
export type PreviewSitePage = "home" | "services";

export function parsePreviewSitePage(value: string | string[] | undefined): PreviewSitePage {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "services" ? "services" : "home";
}

export function previewSiteHref(auditId: string, page: PreviewSitePage): string {
  const base = `/audit/${encodeURIComponent(auditId)}/preview`;
  return page === "services" ? `${base}?site=services` : base;
}
