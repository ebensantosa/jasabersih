const SEEN_LIMIT = 200;
const seenIds = new Set<string>();

function trimSeenIds(): void {
  if (seenIds.size <= SEEN_LIMIT) return;
  const keep = Array.from(seenIds).slice(-Math.floor(SEEN_LIMIT / 2));
  seenIds.clear();
  for (const id of keep) seenIds.add(id);
}

export function shouldPlayChatSound(messageId?: string | null): boolean {
  if (!messageId) return true;
  if (seenIds.has(messageId)) return false;
  seenIds.add(messageId);
  trimSeenIds();
  return true;
}
