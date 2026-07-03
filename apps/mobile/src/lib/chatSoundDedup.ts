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

// Track booking ID yang sedang dibuka di chat screen.
// Kalau push notif datang untuk booking yang sama, skip — WebSocket sudah handle suaranya.
let activeChatBookingId: string | null = null;

export function setActiveChatBooking(bookingId: string | null): void {
  activeChatBookingId = bookingId;
}

export function isInActiveChat(bookingId?: string | null): boolean {
  return !!bookingId && bookingId === activeChatBookingId;
}
