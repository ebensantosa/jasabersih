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
      listBookings: (params?: { status?: string; from?: string; to?: string; limit?: number; offset?: number }) =>
        request<{ items: unknown[]; total: number; limit: number; offset: number } | unknown[]>('GET', `/admin/bookings${qs(params as any)}`),
      assignCleaner: (bookingId: string, cleanerId: string) =>
        request<unknown>('PATCH', `/admin/bookings/${bookingId}/assign`, { cleanerId }),
      reassignCleaner: (bookingId: string, cleanerId: string, reason?: string) =>
        request<{ ok: true }>('POST', `/admin/bookings/${bookingId}/reassign`, { cleanerId, reason }),
      getBookingDetail: (bookingId: string) =>
        request<{ booking: any; photos: { id: string; photoType: string; url: string; uploadedAt: string }[]; charges: any[]; payments: any[] }>(
          'GET', `/admin/bookings/${bookingId}`,
        ),
      getAdminCustomer: () => request<{ id: string; name: string; phone: string }>('GET', '/admin/bookings/admin-customer'),
      createManualBooking: (body: {
        customerPhone: string; customerName?: string;
        pricingMode: 'package' | 'hourly' | 'wa_survey';
        packageId?: string; serviceId?: string;
        scheduledAt: string; addressLine: string; lat?: number; lng?: number;
        totalAmount: number; baseAmount?: number; customerNotes?: string;
        cleanerId?: string; paymentStatus?: 'unpaid' | 'paid'; adminNote?: string;
        cityName?: string;
      }) => request<{ id: string; customerId: string; status: string }>('POST', `/admin/bookings`, body),
      bookingsNeedsAttention: () =>
        request<{ id: string; addressLine: string; totalAmount: number; scheduledAt: string; createdAt: string; searchingSec: number; serviceName: string | null; customerName: string | null; customerPhone: string | null }[]>(
          'GET', `/admin/bookings/needs-attention`,
        ),
      inboxCounts: () =>
        request<{ kycPending: number; disputesOpen: number; withdrawalsPending: number; bookingsNeedAssign: number; fraudReports: number; cityRequests: number; total: number }>(
          'GET', `/admin/inbox/counts`,
        ),
      forceCancelBooking: (bookingId: string, reason: string, refundAmount?: number) =>
        request<{ ok: true }>('POST', `/admin/bookings/${bookingId}/force-cancel`, { reason, refundAmount }),
      refundCreditToCustomer: (bookingId: string, amount: number, reason: string) =>
        request<{ ok: true }>('POST', `/admin/bookings/${bookingId}/refund-credit`, { amount, reason }),
      getUserWallet: (userId: string) =>
        request<{ balance: number; ledger: { id: string; accountType: string; amount: number; referenceType: string; referenceId: string | null; status: string; description: string | null; createdAt: string; clearedAt: string | null }[] }>(
          'GET', `/admin/users/${userId}/wallet`,
        ),
      adjustUserWallet: (userId: string, type: 'credit' | 'debit', amount: number, reason: string) =>
        request<{ ok: true }>('POST', `/admin/users/${userId}/wallet-adjust`, { type, amount, reason }),
      rejectCleanerPhoto: (userId: string, reason: string) =>
        request<{ ok: true }>('POST', `/admin/cleaners/${userId}/reject-photo`, { reason }),
      forceCompleteBooking: (bookingId: string, reason: string) =>
        request<{ ok: true }>('POST', `/admin/bookings/${bookingId}/force-complete`, { reason }),
      forceMarkPaid: (bookingId: string, reason: string, method?: string, reference?: string) =>
        request<{ ok: true }>('POST', `/admin/bookings/${bookingId}/force-mark-paid`, { reason, method, reference }),
      bulkBookingAction: (ids: string[], action: 'cancel' | 'complete' | 'mark_paid' | 'delete', reason: string) =>
        request<{ ok: true; results: { id: string; ok: boolean; error?: string }[]; total: number; succeeded: number }>(
          'POST', `/admin/bookings/bulk-action`, { ids, action, reason },
        ),
      listCleaners: (params?: { status?: string; q?: string; limit?: number }) =>
        request<unknown[]>('GET', `/admin/cleaners${qs(params ? { status: params.status, q: params.q, limit: params.limit != null ? String(params.limit) : undefined } : undefined)}`),
      createCleaner: (body: { name: string; phone: string; email?: string; password: string; bringsTools?: boolean; serviceAreas?: string[]; tier?: string; autoApprove?: boolean }) =>
        request<{ id: string; phone: string; name: string }>('POST', '/admin/cleaners', body),
      deleteCleaner: (id: string, reason?: string) =>
        request<{ ok: true }>('DELETE', `/admin/cleaners/${id}`, { reason }),
      updateCleaner: (id: string, body: { bringsTools?: boolean; tier?: string; serviceAreas?: string[] }) =>
        request<{ ok: true }>('PATCH', `/admin/cleaners/${id}`, body),
      updateUserAccount: (id: string, body: { name?: string; email?: string; password?: string }) =>
        request<{ ok: true }>('PATCH', `/admin/users/${id}`, body),
      createCustomer: (body: { name: string; phone: string; email?: string; password: string }) =>
        request<{ id: string; phone: string; name: string }>('POST', '/admin/customers', body),
      deleteCustomer: (id: string, reason?: string) =>
        request<{ ok: true }>('DELETE', `/admin/customers/${id}`, { reason }),
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
      kycBulkApprove: (userIds: string[]) =>
        request<{ approved: number; errors: { userId: string; error: string }[] }>('POST', '/admin/kyc/bulk-approve', { userIds }),
      exportBookingsCsv: (params?: { status?: string; from?: string; to?: string }) =>
        request<{ items: any[]; count: number; limited: boolean }>('GET', `/admin/bookings/export.csv${qs(params as any)}`),
      exportPayoutsCsv: (params?: { from?: string; to?: string; status?: string }) =>
        request<{ items: any[]; count: number; limited: boolean }>('GET', `/admin/payouts/export.csv${qs(params as any)}`),
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
      approveWithdrawalViaFlip: (id: string) =>
        request<{ ok: boolean; status: string; flipDisbursementId: string; note: string }>('POST', `/admin/withdrawals/${id}/approve-flip`),
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
      auditLog: (params?: { action?: string; adminId?: string; resourceType?: string; from?: string; to?: string; q?: string; limit?: number }) =>
        request<any[]>('GET', `/admin/admins/audit-log${qs(params as any)}`),
      auditLogActions: () =>
        request<string[]>('GET', `/admin/admins/audit-log/distinct-actions`),

      // System config
      commissionTiers: () => request<any[]>('GET', '/admin/config/commission-tiers'),
      updateCommissionTier: (id: string, body: any) =>
        request<unknown>('PATCH', `/admin/config/commission-tiers/${id}`, body),
      configServices: () => request<any[]>('GET', '/admin/config/services'),
      reorderServices: (items: Array<{ id: string; displayOrder: number }>) =>
        request<{ ok: true }>('PATCH', '/admin/config/services/reorder', { items }),
      createService: (body: any) => request<{ id: string }>('POST', '/admin/config/services', body),
      updateService: (id: string, body: any) =>
        request<unknown>('PATCH', `/admin/config/services/${id}`, body),
      deactivateService: (id: string) =>
        request<unknown>('DELETE', `/admin/config/services/${id}`),
      deleteService: (id: string) =>
        request<unknown>('DELETE', `/admin/config/services/${id}`),
      getServicePackage: (id: string) =>
        request<{ id: string | null; name: string | null; price: number; durationMin: number; note: string; includes: string[] }>('GET', `/admin/config/services/${id}/package`),
      updateServicePackage: (id: string, body: { note?: string; includes?: string[]; price?: number; durationMin?: number }) =>
        request<unknown>('PATCH', `/admin/config/services/${id}/package`, body),
      // Disputes
      listDisputes: (status: 'open' | 'in_progress' | 'resolved' | 'escalated' = 'open') =>
        request<any[]>('GET', `/admin/disputes?status=${status}`),
      disputeDetail: (id: string) =>
        request<{ dispute: any }>('GET', `/admin/disputes/${id}`),
      assignDispute: (id: string) =>
        request<unknown>('POST', `/admin/disputes/${id}/assign`),
      resolveDispute: (id: string, body: { action: string; payoutAmount?: number; resolution: string; suspendDays?: number }) =>
        request<unknown>('POST', `/admin/disputes/${id}/resolve`, body),
      escalateDispute: (id: string, reason: string) =>
        request<unknown>('POST', `/admin/disputes/${id}/escalate`, { reason }),
      disputeEvidenceUploadUrl: (id: string, contentType: string) =>
        request<{ uploadUrl: string; key: string }>('POST', `/admin/disputes/${id}/evidence-upload-url`, { contentType }),
      addDisputeEvidence: (id: string, body: { key: string; type: string; caption?: string }) =>
        request<unknown>('POST', `/admin/disputes/${id}/evidence`, body),

      // Fraud
      fraudSignals: (limit?: number) =>
        request<any[]>('GET', `/admin/fraud/signals${limit ? `?limit=${limit}` : ''}`),
      fraudFlag: (body: { userId: string; strikeType: string; details?: any }) =>
        request<unknown>('POST', '/admin/fraud/flag', body),
      fraudRunDetection: () =>
        request<{ ok: true; results: any }>('POST', '/admin/fraud/run-detection'),
      fraudDismissStrike: (id: string, reason: string) =>
        request<unknown>('POST', `/admin/fraud/strikes/${id}/dismiss`, { reason }),

      // CMS
      cmsUploadUrl: (contentType: string, folder: string) =>
        request<{ uploadUrl: string; key: string; publicUrl: string }>('POST', '/admin/cms/upload-url', { contentType, folder }),
      banners: (placement?: string) => request<any[]>('GET', `/admin/cms/banners${placement ? `?placement=${placement}` : ''}`),
      createBanner: (body: any) => request<{ id: string }>('POST', '/admin/cms/banners', body),
      updateBanner: (id: string, body: any) => request<unknown>('PATCH', `/admin/cms/banners/${id}`, body),
      deleteBanner: (id: string) => request<unknown>('DELETE', `/admin/cms/banners/${id}`),

      pages: () => request<any[]>('GET', '/admin/cms/pages'),
      getPage: (slug: string) => request<any>('GET', `/admin/cms/pages/${slug}`),
      upsertPage: (body: { slug: string; title: string; bodyMarkdown: string; audience?: string }) =>
        request<unknown>('POST', '/admin/cms/pages', body),
      publishPage: (id: string, isPublished: boolean) =>
        request<unknown>('PATCH', `/admin/cms/pages/${id}/publish`, { isPublished }),

      announcements: () => request<any[]>('GET', '/admin/cms/announcements'),
      createAnnouncement: (body: any) => request<{ id: string }>('POST', '/admin/cms/announcements', body),
      updateAnnouncement: (id: string, body: any) => request<unknown>('PATCH', `/admin/cms/announcements/${id}`, body),

      serviceAreas: () => request<any[]>('GET', '/admin/cms/service-areas'),
      listCityRequests: () => request<any[]>('GET', '/admin/cms/city-requests'),
      deleteCityRequest: (id: string) => request<{ ok: true }>('DELETE', `/admin/cms/city-requests/${id}`),
      listFraudReports: (status?: 'pending' | 'approved' | 'rejected') =>
        request<any[]>('GET', `/admin/fraud-reports${status ? `?status=${status}` : ''}`),
      reviewFraudReport: (id: string, decision: 'approved' | 'rejected', adminNotes?: string) =>
        request<{ ok: true; voucherCode: string | null }>('POST', `/admin/fraud-reports/${id}/review`, { decision, adminNotes }),
      createServiceArea: (body: any) => request<{ id: string }>('POST', '/admin/cms/service-areas', body),
      updateServiceArea: (id: string, body: any) => request<unknown>('PATCH', `/admin/cms/service-areas/${id}`, body),
      deleteServiceArea: (id: string) => request<unknown>('DELETE', `/admin/cms/service-areas/${id}`),

      packages: (serviceId?: string) => request<any[]>('GET', `/admin/cms/packages${serviceId ? `?serviceId=${serviceId}` : ''}`),
      createPackage: (body: any) => request<{ id: string }>('POST', '/admin/cms/packages', body),
      updatePackage: (id: string, body: any) => request<unknown>('PATCH', `/admin/cms/packages/${id}`, body),
      deletePackage: (id: string) => request<unknown>('DELETE', `/admin/cms/packages/${id}`),

      addons: () => request<any[]>('GET', '/admin/cms/addons'),
      createAddon: (body: any) => request<{ id: string }>('POST', '/admin/cms/addons', body),
      updateAddon: (id: string, body: any) => request<unknown>('PATCH', `/admin/cms/addons/${id}`, body),
      deleteAddon: (id: string) => request<{ ok: true }>('DELETE', `/admin/cms/addons/${id}`),

      vouchers: () => request<any[]>('GET', '/admin/cms/vouchers'),
      createVoucher: (body: any) => request<{ id: string }>('POST', '/admin/cms/vouchers', body),
      updateVoucher: (id: string, body: any) => request<unknown>('PATCH', `/admin/cms/vouchers/${id}`, body),

      // Blacklist
      blacklist: () => request<any[]>('GET', '/admin/config/blacklist'),
      addBlacklist: (body: { type: string; value: string; reason: string; expiresAt?: string }) =>
        request<unknown>('POST', '/admin/config/blacklist', body),
      removeBlacklist: (id: string) =>
        request<unknown>('DELETE', `/admin/config/blacklist/${id}`),

      // App config (key-value settings)
      appConfig: () => request<any[]>('GET', '/admin/app/config'),
      setAppConfig: (key: string, body: { value: any; description?: string; category?: string }) =>
        request<unknown>('PATCH', `/admin/app/config/${encodeURIComponent(key)}`, body),
      deleteAppConfig: (key: string) =>
        request<unknown>('DELETE', `/admin/app/config/${encodeURIComponent(key)}`),
      testEmail: (to: string) =>
        request<{ ok: boolean; id?: string; error?: string }>('POST', '/admin/app/email/test', { to }),

      // Pop-up promo
      popups: () => request<any[]>('GET', '/admin/app/popups'),
      createPopup: (body: any) => request<{ id: string }>('POST', '/admin/app/popups', body),
      updatePopup: (id: string, body: any) => request<unknown>('PATCH', `/admin/app/popups/${id}`, body),
      deletePopup: (id: string) => request<unknown>('DELETE', `/admin/app/popups/${id}`),

      // Cleaner area requests
      cleanerAreaRequests: () => request<any[]>('GET', '/admin/users/cleaner-area-requests'),
      approveCleanerAreaRequest: (id: string) =>
        request<{ ok: true }>('POST', `/admin/users/cleaner-area-requests/${id}/approve`),
      rejectCleanerAreaRequest: (id: string, reason?: string) =>
        request<{ ok: true }>('POST', `/admin/users/cleaner-area-requests/${id}/reject`, { reason }),

      // Subscription tiers (Basic/Standard/Premium/Ultimate scope & multiplier)
      subscriptionTiers: () => request<any[]>('GET', '/admin/app/subscription-tiers'),
      updateSubscriptionTier: (id: string, body: any) => request<unknown>('PATCH', `/admin/app/subscription-tiers/${id}`, body),

      // Hourly tiers (per-jam booking pricing)
      hourlyTiers: () => request<any[]>('GET', '/admin/app/hourly-tiers'),
      createHourlyTier: (body: any) => request<{ id: string }>('POST', '/admin/app/hourly-tiers', body),
      updateHourlyTier: (id: string, body: any) => request<unknown>('PATCH', `/admin/app/hourly-tiers/${id}`, body),
      deleteHourlyTier: (id: string) => request<unknown>('DELETE', `/admin/app/hourly-tiers/${id}`),

      // Analytics
      analyticsOverview: () => request<any>('GET', '/admin/analytics/overview'),

      // Referrals admin
      referralStats: () => request<any>('GET', '/admin/referrals/stats'),
      referralLeaderboard: () => request<any[]>('GET', '/admin/referrals/leaderboard'),
      listReferrals: (params?: { status?: string; q?: string }) =>
        request<any[]>('GET', `/admin/referrals${qs(params as any)}`),

      // Broadcast push
      broadcastEstimate: (audience: string) =>
        request<{ totalUsers: number; reachable: number }>('GET', `/admin/broadcast/estimate?audience=${audience}`),
      broadcastSend: (body: { title: string; body: string; audience: string; ctaLink?: string }) =>
        request<{ audienceSize: number; sent: number; failed: number }>('POST', '/admin/broadcast/send', body),
      broadcastHistory: () => request<any[]>('GET', '/admin/broadcast/history'),
      broadcastSchedule: (body: { title: string; body: string; audience: string; ctaLink?: string; scheduledAt: string }) =>
        request<{ id: string; ok: true }>('POST', '/admin/broadcast/schedule', body),
      broadcastListScheduled: () => request<any[]>('GET', '/admin/broadcast/scheduled'),
      broadcastCancelScheduled: (id: string) =>
        request<{ ok: true }>('POST', `/admin/broadcast/scheduled/${id}/cancel`),
      broadcastListTemplates: () => request<any[]>('GET', '/admin/broadcast/templates'),
      broadcastCreateTemplate: (body: { name: string; title: string; body: string; audience: string; ctaLink?: string; category?: string }) =>
        request<{ id: string; ok: true }>('POST', '/admin/broadcast/templates', body),
      broadcastUseTemplate: (id: string) => request<{ ok: true }>('POST', `/admin/broadcast/templates/${id}/use`),
      broadcastDeleteTemplate: (id: string) => request<{ ok: true }>('DELETE', `/admin/broadcast/templates/${id}`),

      // Chat audit
      chatBookings: (params?: { q?: string; hasBlocked?: boolean }) =>
        request<any[]>('GET', `/admin/chat/bookings${qs(params as any)}`),
      chatMessages: (bookingId: string, reason?: string) =>
        request<any[]>('GET', `/admin/chat/booking/${bookingId}/messages${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`),
      chatBlocked: (limit?: number) =>
        request<any[]>('GET', `/admin/chat/blocked${limit ? `?limit=${limit}` : ''}`),
      chatStats: () => request<{ last7Days: any; blockedByReason: any[] }>('GET', '/admin/chat/stats'),
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
      reschedule: (id: string, scheduledAt: string) =>
        request<{ ok: true; scheduledAt: string }>('POST', `/bookings/${id}/reschedule`, { scheduledAt }),
      tipCleaner: (id: string, amount: number) =>
        request<{ ok: true; amount: number; newBalance: number }>('POST', `/bookings/${id}/tip`, { amount }),
      pay: (id: string) => request<unknown>('POST', `/bookings/${id}/pay`),
      subscriptionVisits: (id: string) =>
        request<Array<{ id: string; status: string; scheduledAt: string; visitIndex: number; visitTotal: number; cleanerId: string | null; cleanerName: string | null; cleanerPhotoUrl: string | null; completedAt: string | null; matchedAt: string | null }>>('GET', `/bookings/${id}/subscription-visits`),
    },
    customerNotes: {
      listMine: () => request<Array<{ id: string; category: string; content: string; createdAt: string }>>('GET', '/customer/notes'),
      add: (category: string, content: string) =>
        request<{ id: string }>('POST', '/customer/notes', { category, content }),
      remove: (id: string) => request<{ ok: true }>('DELETE', `/customer/notes/${id}`),
    },
    cleanerNotes: {
      listFor: (customerId: string) =>
        request<Array<{ id: string; source: 'customer' | 'cleaner'; category: string; content: string; authorId: string; createdAt: string }>>('GET', `/cleaner/customer-notes/${customerId}`),
      add: (customerId: string, category: string, content: string) =>
        request<{ id: string }>('POST', `/cleaner/customer-notes/${customerId}`, { category, content }),
      remove: (id: string) => request<{ ok: true }>('DELETE', `/cleaner/customer-notes/${id}`),
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
