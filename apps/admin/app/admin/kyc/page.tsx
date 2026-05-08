'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, Eye, X, Check, Clock, AlertCircle } from 'lucide-react';

import { api } from '../../../lib/api';

type Cleaner = {
  user_id: string;
  name: string | null;
  phone: string;
  email: string | null;
  joined_at: string;
  kyc_status: string;
  pending_docs: number;
  total_docs: number;
};

type KycDoc = {
  id: string;
  doc_type: string | null;
  storage_path: string;
  status: string | null;
  uploaded_at: string;
  verified_at: string | null;
  rejected_reason: string | null;
  viewUrl: string;
};

type Detail = {
  profile: {
    user_id: string;
    name: string | null;
    phone: string;
    email: string | null;
    joined_at: string;
    kyc_status: string;
    bio: string | null;
    rejection_reason: string | null;
  };
  documents: KycDoc[];
};

const TABS: Array<{ key: 'pending' | 'under_review' | 'approved' | 'rejected'; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export default function KycPage() {
  const [tab, setTab] = useState<'pending' | 'under_review' | 'approved' | 'rejected'>('pending');
  const [list, setList] = useState<Cleaner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = (await api.admin.kycQueue(tab)) as Cleaner[];
      setList(rows);
    } catch (e: any) {
      setError(e?.message ?? 'Gagal memuat data.');
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tab]);

  async function openDetail(userId: string) {
    setDetailLoading(true);
    try {
      const data = await api.admin.kycDetail(userId);
      setSelected(data as Detail);
    } catch (e: any) {
      alert(e?.message ?? 'Gagal memuat detail.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function approve(userId: string) {
    if (!confirm('Approve KYC cleaner ini? Cleaner akan bisa terima order setelah ini.')) return;
    try {
      await api.admin.kycApprove(userId);
      setSelected(null);
      void load();
    } catch (e: any) {
      alert(e?.message ?? 'Gagal approve.');
    }
  }

  async function reject(userId: string) {
    const reason = prompt('Alasan penolakan (min 5 karakter):');
    if (!reason || reason.trim().length < 5) return;
    try {
      await api.admin.kycReject(userId, reason);
      setSelected(null);
      void load();
    } catch (e: any) {
      alert(e?.message ?? 'Gagal reject.');
    }
  }

  async function requestRedoc(userId: string) {
    const reason = prompt('Alasan minta upload ulang (akan dikirim ke cleaner):');
    if (!reason) return;
    try {
      await api.admin.kycRequestRedoc(userId, reason);
      setSelected(null);
      void load();
    } catch (e: any) {
      alert(e?.message ?? 'Gagal.');
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">KYC Cleaner</h1>
          <p className="text-sm text-slate-500">Verifikasi dokumen cleaner sebelum aktif terima order.</p>
        </div>
      </div>

      <div className="mb-4 flex gap-2 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-2 text-sm font-medium ${
              tab === t.key ? 'text-blue-700' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t.label}
            {tab === t.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-700" />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Memuat…</div>
      ) : error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : list.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          <BadgeCheck size={32} className="mx-auto mb-2 text-slate-400" />
          Tidak ada cleaner di status <b>{tab}</b>.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Daftar</th>
                <th className="px-4 py-3">Dokumen</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.user_id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{c.name ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(c.joined_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                      {c.pending_docs} pending / {c.total_docs} total
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openDetail(c.user_id)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
                    >
                      <Eye size={14} /> Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b bg-white p-4">
              <div>
                <h2 className="text-lg font-bold">{selected.profile.name ?? 'Cleaner'}</h2>
                <p className="text-xs text-slate-500">
                  {selected.profile.phone} • {selected.profile.email ?? 'no email'} • Status:{' '}
                  <span className="font-semibold">{selected.profile.kyc_status}</span>
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-full p-2 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            {selected.profile.rejection_reason && (
              <div className="mx-4 mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <AlertCircle size={16} />
                <div>
                  <b>Catatan sebelumnya:</b> {selected.profile.rejection_reason}
                </div>
              </div>
            )}

            <div className="grid gap-4 p-4 md:grid-cols-2">
              {selected.documents.length === 0 ? (
                <div className="col-span-full rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  Belum ada dokumen di-upload.
                </div>
              ) : (
                selected.documents.map((d) => (
                  <div key={d.id} className="overflow-hidden rounded-md border">
                    <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-xs">
                      <div className="font-medium">{labelDocType(d.doc_type)}</div>
                      <div className="flex items-center gap-1 text-slate-500">
                        <Clock size={12} />
                        {new Date(d.uploaded_at).toLocaleDateString('id-ID')}
                      </div>
                    </div>
                    {/(\.jpg|\.jpeg|\.png|\.webp)$/i.test(d.storage_path) ? (
                      <img src={d.viewUrl} alt={d.doc_type ?? 'doc'} className="h-64 w-full object-contain bg-slate-100" />
                    ) : (
                      <div className="bg-slate-100 p-6 text-center">
                        <a href={d.viewUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">
                          Open file
                        </a>
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3 py-2 text-xs">
                      <span
                        className={
                          d.status === 'approved'
                            ? 'rounded-full bg-green-100 px-2 py-0.5 text-green-700'
                            : d.status === 'rejected'
                              ? 'rounded-full bg-red-100 px-2 py-0.5 text-red-700'
                              : 'rounded-full bg-slate-100 px-2 py-0.5 text-slate-700'
                        }
                      >
                        {d.status ?? 'pending'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-white p-4">
              <button
                onClick={() => requestRedoc(selected.profile.user_id)}
                className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 hover:bg-amber-100"
              >
                Minta Upload Ulang
              </button>
              <button
                onClick={() => reject(selected.profile.user_id)}
                className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100"
              >
                <X size={14} /> Reject
              </button>
              <button
                onClick={() => approve(selected.profile.user_id)}
                className="inline-flex items-center gap-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <Check size={14} /> Approve
              </button>
            </div>
          </div>
        </div>
      )}
      {detailLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 text-sm text-white">Memuat…</div>
      )}
    </div>
  );
}

function labelDocType(t: string | null): string {
  switch (t) {
    case 'ktp': return 'KTP';
    case 'selfie_ktp': return 'Selfie + KTP';
    case 'bank_book': return 'Buku Tabungan';
    case 'sim': return 'SIM';
    case 'npwp': return 'NPWP';
    default: return t ?? 'Dokumen';
  }
}
