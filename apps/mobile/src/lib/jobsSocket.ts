import Constants from 'expo-constants';
import { io, type Socket } from 'socket.io-client';

import { useAuthStore } from '../stores/auth';

function getBase(): string {
  const apiBase = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ?? 'http://localhost:3000/v1';
  return apiBase.replace(/\/v1\/?$/, '');
}

let socket: Socket | null = null;

export function getJobsSocket(): Socket {
  if (socket && socket.connected) return socket;
  const token = useAuthStore.getState().tokens?.accessToken;
  socket = io(`${getBase()}/jobs`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
  });
  return socket;
}

export function disconnectJobsSocket(): void {
  if (socket) { socket.disconnect(); socket = null; }
}

export type IncomingJob = {
  id: string;
  pricingMode: string;
  addressLine: string;
  scheduledAt: string;
  totalAmount: number;
  cleanerPayout: number | null;
  serviceName: string | null;
};
