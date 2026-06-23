'use client';

import { useEffect, useState } from 'react';
import { Check, MapPin, X } from 'lucide-react';

import { api } from '../../../lib/api';
import { Badge, Button, useConfirm, useToast } from '../../../components/ui';

type Req = {
  id: string;
  city: string;
  action: 'add' | 'remove';
  notes: string | null;
  createdAt: string;
  cleanerId: string;
  cleanerName: string | null;
  cleanerPhone: string | null;
  currentAreas: string[] | null;
  domicileCity: string | null;
};

export default function CleanerAreaRequestsPage(): React.ReactElement | null {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setList((await api.admin.cleanerAreaRequests()) as Req[]);
    } catch (e: any) { toast.error(e?.message ?? 'Gagal load'); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function approve(r: Req) {
    const verb = r.action === 'remove' ? 'Hapus' : 'Tambahkan';
    const ok = await confirm({ title: `Approve request ${r.action === 'remove' ? 'hapus' : 'tambah'}`, message: `${verb} area "${r.city}" ${r.action === 'remove' ? 'dari' : 'untuk'} cleaner ${r.cleanerName ?? r.cleanerId.slice(0,8)}?` });
    if (!ok) return;
    try {
      await api.admin.approveCleanerAreaRequest(r.id);
      toast.success('Area di-approve');
      void load();
    } catch (e: any) { toast.error(e?.message); }
  }

  async function reject(r: Req) {
    const reason = window.prompt('Alasan tolak (opsional):') ?? undefined;
    if (reason === null) return; // user batal lewat ESC
    try {
      await api.admin.rejectCleanerAreaRequest(r.id, reason);
      toast.success('Request ditolak');
      void load();
    } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Permintaan Area Cleaner</h1>
        <p className="text-sm text-slate-500">Cleaner request tambah area kerja. Approve untuk tambahin ke area mereka, tolak kalau gak cocok.</p>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Memuatâ€¦</div>
      ) : list.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed p-10 text-center text-sm text-slate-500">
          <MapPin size={28} className="mx-auto mb-2 text-slate-400" />
          Belum ada request menunggu.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-md border bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Cleaner</th>
                <th className="px-3 py-2 text-left">Domisili</th>
                <th className="px-3 py-2 text-left">Area Sekarang</th>
                <th className="px-3 py-2 text-left">Request</th>
                <th className="px-3 py-2 text-left">Tanggal</th>
                <th className="px-3 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="font-semibold">{r.cleanerName ?? '-'}</div>
                    <div className="text-xs text-slate-500">{r.cleanerPhone ?? '-'}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.domicileCity ?? '-'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(r.currentAreas ?? []).map((a) => <Badge key={a}>{a}</Badge>)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Badge variant={r.action === 'remove' ? 'amber' : 'green'}>
                        {r.action === 'remove' ? 'âˆ’ Hapus' : '+ Tambah'}
                      </Badge>
                      <Badge variant="blue">{r.city}</Badge>
                    </div>
                    {r.notes && <div className="mt-0.5 text-xs text-slate-500">{r.notes}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{new Date(r.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="primary" icon={<Check size={12} />} onClick={() => approve(r)}>Approve</Button>
                      <Button size="sm" variant="ghost" icon={<X size={12} />} onClick={() => reject(r)}>Tolak</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
