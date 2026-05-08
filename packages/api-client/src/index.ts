/**
 * Shared API client untuk admin & mobile.
 *
 * - Tahan kalau backend offline → throw ApiOffline error, caller bisa fallback ke mock.
 * - Auto attach Bearer token kalau ada.
 * - Refresh token rotation (TODO Sprint 2).
 */
import type { ApiResponse, AuthTokens, LoginRequest } from '@jasabersih/shared-types';

export class ApiOffline extends Error {
  constructor() {
    super('API_OFFLINE');
    this.name = 'ApiOffline';
  }
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ClientOptions = {
  baseUrl: string;
  /** Function untuk dapat token saat ini (bisa baca dari store/storage) */
  getAccessToken?: () => string | null;
  /** Dipanggil saat 401 → caller harus clear local auth state */
  onUnauthorized?: () => void;
  /** Timeout per request, default 15s */
  timeoutMs?: number;
};

export function createClient(opts: ClientOptions) {
  async function request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${opts.baseUrl.replace(/\/$/, '')}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(opts.getAccessToken?.() ? { authorization: `Bearer ${opts.getAccessToken()}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } catch {
      clearTimeout(timer);
      throw new ApiOffline();
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) {
      opts.onUnauthorized?.();
      throw new ApiError('UNAUTHORIZED', 'Sesi habis, login ulang', 401);
    }

    let json: ApiResponse<T> | null = null;
    try {
      json = (await res.json()) as ApiResponse<T>;
    } catch {
      throw new ApiError('PARSE_ERROR', 'Response invalid', res.status);
    }

    if (!res.ok || json?.error) {
      const e = json?.error;
      throw new ApiError(
        e?.code ?? 'UNKNOWN',
        e?.message ?? `HTTP ${res.status}`,
        res.status,
        e?.details,
      );
    }
    return (json?.data ?? null) as T;
  }

  return {
    raw: request,

    // Auth
    auth: {
      login: (body: LoginRequest) => request<AuthTokens>('POST', '/auth/login', body),
      adminLogin: (body: { email: string; password: string }) =>
        request<AuthTokens & { admin: { id: string; name: string; role: string } }>(
          'POST',
          '/auth/admin-login',
          body,
        ),
      logout: (refreshToken: string) => request<void>('POST', '/auth/logout', { refreshToken }),
    },

    // Admin endpoints (TODO Sprint 2: implement di NestJS)
    admin: {
      listBookings: (params?: { status?: string }) =>
        request<unknown[]>('GET', `/admin/bookings${qs(params)}`),
      assignCleaner: (bookingId: string, cleanerId: string) =>
        request<unknown>('PATCH', `/admin/bookings/${bookingId}/assign`, { cleanerId }),
      listCleaners: (params?: { status?: string }) =>
        request<unknown[]>('GET', `/admin/cleaners${qs(params)}`),
      listUsers: (params?: { q?: string; status?: string; role?: 'customer' | 'cleaner' }) =>
        request<unknown[]>('GET', `/admin/users${qs(params)}`),
      getUser: (id: string) => request<{ user: any; strikes: any[]; recentBookings: any[] }>('GET', `/admin/users/${id}`),
      suspendUser: (id: string, reason: string, durationDays?: number) =>
        request<unknown>('POST', `/admin/users/${id}/suspend`, { reason, durationDays }),
      banUser: (id: string, reason: string) =>
        request<unknown>('POST', `/admin/users/${id}/ban`, { reason }),
      unsuspendUser: (id: string) =>
        request<unknown>('POST', `/admin/users/${id}/unsuspend`),
      userAuditTrail: (id: string) =>
        request<any[]>('GET', `/admin/users/${id}/audit-trail`),

      // KYC vetting
      kycQueue: (status: 'pending' | 'under_review' | 'approved' | 'rejected' = 'pending') =>
        request<any[]>('GET', `/admin/kyc/queue?status=${status}`),
      kycDetail: (userId: string) =>
        request<{ profile: any; documents: any[] }>('GET', `/admin/kyc/${userId}`),
      kycApprove: (userId: string) =>
        request<unknown>('POST', `/admin/kyc/${userId}/approve`),
      kycReject: (userId: string, reason: string) =>
        request<unknown>('POST', `/admin/kyc/${userId}/reject`, { reason }),
      kycRequestRedoc: (userId: string, reason: string) =>
        request<unknown>('POST', `/admin/kyc/${userId}/request-redocument`, { reason }),

      // Booking admin
      bookingDetail: (id: string) =>
        request<{ booking: any; photos: any[]; charges: any[]; payments: any[] }>('GET', `/admin/bookings/${id}`),
      bookingForceCancel: (id: string, reason: string, refundAmount?: number) =>
        request<unknown>('POST', `/admin/bookings/${id}/force-cancel`, { reason, refundAmount }),
      bookingForceComplete: (id: string, reason: string) =>
        request<unknown>('POST', `/admin/bookings/${id}/force-complete`, { reason }),
      bookingReassign: (id: string, cleanerId: string, reason?: string) =>
        request<unknown>('POST', `/admin/bookings/${id}/reassign`, { cleanerId, reason }),

      // Withdrawals
      withdrawals: (status: 'pending' | 'approved' | 'rejected' | 'paid' = 'pending') =>
        request<any[]>('GET', `/admin/withdrawals?status=${status}`),
      approveWithdrawal: (id: string, bankTransferRef: string, note?: string) =>
        request<unknown>('POST', `/admin/withdrawals/${id}/approve`, { bankTransferRef, note }),
      rejectWithdrawal: (id: string, reason: string) =>
        request<unknown>('POST', `/admin/withdrawals/${id}/reject`, { reason }),

      // Admin user management
      listAdmins: () => request<any[]>('GET', '/admin/admins'),
      createAdmin: (body: { email: string; name: string; role: string; password: string }) =>
        request<{ id: string }>('POST', '/admin/admins', body),
      updateAdmin: (id: string, body: { name?: string; role?: string; isActive?: boolean; password?: string }) =>
        request<unknown>('PATCH', `/admin/admins/${id}`, body),
      deactivateAdmin: (id: string) =>
        request<unknown>('DELETE', `/admin/admins/${id}`),
      auditLog: (params?: { action?: string; adminId?: string; limit?: number }) =>
        request<any[]>('GET', `/admin/admins/audit-log${qs(params as any)}`),

      // System config
      commissionTiers: () => request<any[]>('GET', '/admin/config/commission-tiers'),
      updateCommissionTier: (id: string, body: any) =>
        request<unknown>('PATCH', `/admin/config/commission-tiers/${id}`, body),
      configServices: () => request<any[]>('GET', '/admin/config/services'),
      createService: (body: any) => request<{ id: string }>('POST', '/admin/config/services', body),
      updateService: (id: string, body: any) =>
        request<unknown>('PATCH', `/admin/config/services/${id}`, body),
      deactivateService: (id: string) =>
        request<unknown>('DELETE', `/admin/config/services/${id}`),
      hourlyTiers: () => request<any[]>('GET', '/admin/config/hourly-tiers'),
      updateHourlyTier: (id: string, body: any) =>
        request<unknown>('PATCH', `/admin/config/hourly-tiers/${id}`, body),

      // Blacklist
      blacklist: () => request<any[]>('GET', '/admin/config/blacklist'),
      addBlacklist: (body: { type: string; value: string; reason: string; expiresAt?: string }) =>
        request<unknown>('POST', '/admin/config/blacklist', body),
      removeBlacklist: (id: string) =>
        request<unknown>('DELETE', `/admin/config/blacklist/${id}`),

      listChatLogs: (params?: { blocked?: boolean }) =>
        request<unknown[]>('GET', `/admin/chat${qs(params)}`),
    },

    // Catalog (public — no auth needed)
    services: {
      list: () => request<unknown[]>('GET', '/services'),
    },

    // Customer
    bookings: {
      create: (body: unknown) => request<unknown>('POST', '/bookings', body),
      list: () => request<unknown[]>('GET', '/bookings'),
      get: (id: string) => request<unknown>('GET', `/bookings/${id}`),
      cancel: (id: string) => request<unknown>('POST', `/bookings/${id}/cancel`),
      pay: (id: string) => request<unknown>('POST', `/bookings/${id}/pay`),
    },
  };
}

function qs(params?: Record<string, string | boolean | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v != null);
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

export type { ApiResponse, AuthTokens, LoginRequest };
