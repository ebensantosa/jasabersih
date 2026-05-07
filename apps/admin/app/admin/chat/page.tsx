'use client';

import { MessageSquare } from 'lucide-react';

export default function ChatMonitor() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Chat Monitor</h1>
      <p className="text-sm text-slate-500">
        Audit log chat customer ↔ cleaner. Belum ada data.
      </p>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-12 text-center">
        <div className="mx-auto h-16 w-16 items-center justify-center rounded-full bg-slate-100 p-4">
          <MessageSquare className="text-slate-400" size={32} />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-slate-900">Modul belum aktif</h3>
        <p className="mt-2 text-sm text-slate-500">
          Endpoint <code>GET /v1/admin/chat</code> dan service Socket.io di{' '}
          <code>services/chat</code> belum dibangun. Akan tersedia di Sprint 2.
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="text-sm font-bold text-amber-900">⚠️ UU PDP Compliance (planned)</h3>
        <p className="mt-1 text-xs text-amber-900">
          Setiap akses chat oleh admin akan tercatat di table <code>data_access_log</code>:
          admin_id, booking_id, access_reason, timestamp. Customer berhak request export log
          akses ini.
        </p>
      </div>
    </div>
  );
}
