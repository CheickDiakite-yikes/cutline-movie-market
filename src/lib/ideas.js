export const IDEA_STORAGE_KEY = "cutline-saved-ideas";
export const IDEA_EXPORT_SCHEMA = 1;

const isFiniteNumber = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

export function normalizeIdea(item) {
  if (!item || typeof item !== "object") return null;
  const eventTicker = String(item.eventTicker || (item.movie === "Resident Evil" ? "KXRT-RES" : "")).trim();
  const movie = String(item.movie || item.title || "").trim();
  const threshold = Number(item.threshold);
  if (!eventTicker || !movie || !isFiniteNumber(threshold)) return null;
  return {
    id: String(item.id || `${eventTicker}-${threshold}`).trim(),
    eventTicker,
    movie,
    threshold,
    disposition: item.disposition === "later" ? "later" : "research",
    marketUrl: item.marketUrl || null,
    artwork: item.artwork || null,
    releaseLabel: item.releaseLabel || null,
    modelStatus: item.modelStatus || "research only",
    historicalFit: isFiniteNumber(item.historicalFit) ? Number(item.historicalFit) : null,
    talentPrior: isFiniteNumber(item.talentPrior) ? Number(item.talentPrior) : null,
    marketSnapshot: item.marketSnapshot || null,
    savedAt: item.savedAt || new Date().toISOString(),
  };
}

export function normalizeIdeas(items) {
  return Array.isArray(items) ? items.map(normalizeIdea).filter(Boolean) : [];
}

export function mergeIdeas(current, incoming) {
  const merged = new Map();
  for (const item of [...normalizeIdeas(incoming), ...normalizeIdeas(current)]) {
    if (!merged.has(item.id)) merged.set(item.id, item);
  }
  return [...merged.values()];
}

export function createIdeasExport(items, exportedAt = new Date().toISOString()) {
  return {
    schemaVersion: IDEA_EXPORT_SCHEMA,
    product: "Cutline",
    exportedAt,
    guardrail: "Decision support only. This file does not contain or place trades.",
    items: normalizeIdeas(items),
  };
}

export function parseIdeasExport(text) {
  const payload = JSON.parse(text);
  if (payload?.schemaVersion !== IDEA_EXPORT_SCHEMA || !Array.isArray(payload.items)) {
    throw new Error("This is not a supported Cutline ideas export");
  }
  const items = normalizeIdeas(payload.items);
  if (items.length !== payload.items.length) {
    throw new Error("One or more imported ideas are malformed");
  }
  return items;
}
