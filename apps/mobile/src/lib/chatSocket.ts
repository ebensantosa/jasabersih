import Constants from 'expo-constants';
import { io, type Socket } from 'socket.io-client';

import { useAuthStore } from '../stores/auth';

// Build chat socket URL from API base. /v1 → strip → namespace /chat.
function getChatBase(): string {
  const apiBase = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://localhost:3000/v1';
  // Remove trailing /v1 if present, append /chat namespace.
  return apiBase.replace(/\/v1\/?$/, '');
}

let socket: Socket | null = null;

export function getChatSocket(): Socket {
  if (socket && socket.connected) return socket;
  const token = useAuthStore.getState().tokens?.accessToken;
  socket = io(`${getChatBase()}/chat`, {
    auth: { token },
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
  });
  return socket;
}

export function disconnectChatSocket(): void {
  if (socket) { socket.disconnect(); socket = null; }
}

export type ChatMessage = {
  id: string;
  bookingId: string;
  senderId: string;
  recipientId: string | null;
  messageType: 'text' | 'image';
  content: string;
  attachmentUrl: string | null;
  createdAt: string;
};

export type SendResult = { ok: boolean; messageId?: string; blocked?: boolean; blockReason?: string; userMessage?: string; error?: string };
