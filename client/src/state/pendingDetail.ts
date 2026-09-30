import type { Content } from "../domain/types";

/** PendingDetailCache.kt — the card you clicked renders instantly on the Detail page while full metadata loads. */
const cache = new Map<string, Content>();
export const stashDetailPreview = (content: Content): void => {
  cache.set(content.id, content);
  if (cache.size > 50) cache.delete(cache.keys().next().value as string);
};
export const consumeDetailPreview = (id: string): Content | undefined => {
  const value = cache.get(id);
  cache.delete(id);
  return value;
};
