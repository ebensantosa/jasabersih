'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, CreditCard, Smartphone, XCircle } from 'lucide-react';

import { api } from '../../../lib/api';
import { Badge, useToast } from '../../../components/ui';

type Method = {
  code: string;
  name: string;
  type: 'bank' | 'ewallet' | 'qris' | 'retail' | 'card';
  group?: string;
  iconUrl?: string;
  fee?: number;
};

type BankHealth = {
  code: string;
  name: string;
  status: 'normal' | 'delayed' | 'down';
  message: string;
};

const KNOWN_METHODS: Method[] = [
  { code: 'BCAVA', name: 'BCA Virtual Account', type: 'bank' },
  { code: 'MANDIRIVA', name: 'Mandiri Virtual Account', type: 'bank' },
  { code: 'BRIVA', name: 'BRI Virtual Account', type: 'bank' },
  { code: 'BNIVA', name: 'BNI Virtual Account', type: 'bank' },
  { code: 'PERMATAVA', name: 'Permata Virtual Account', type: 'bank' },
  { code: 'CIMBVA', name: 'CIMB Niaga VA', type: 'bank' },
  { code: 'BSIVA', name: 'BSI Virtual Account', type: 'bank' },
  { code: 'SEABANKVA', name: 'SeaBank Virtual Account', type: 'bank' },
  { code: 'QRIS', name: 'QRIS', type: 'qris' },
  { code: 'OVO', name: 'OVO', type: 'ewallet' },
  { code: 'GOPAY', name: 'GoPay', type: 'ewallet' },
  { code: 'DANA', name: 'DANA', type: 'ewallet' },
  { code: 'SHOPEEPAY', name: 'ShopeePay', type: 'ewallet' },
  { code: 'LINKAJA', name: 'LinkAja', type: 'ewallet' },
  { code: 'ALFAMART', name: 'Alfamart', type: 'retail' },
  { code: 'INDOMARET', name: 'Indomaret', type: 'retail' },
  { code: 'CREDIT_CARD', name: 'Kartu Kredit', type: 'card' },
];

export default function PaymentMethodsPage(): React.ReactElement {
  const toast = useToast();
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [health, setHealth] = useState<Record<string, BankHealth>>({});
  const [maintenanceNotice, setMaintenanceNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const cfg = await api.admin.appConfig();
      const disabledCfg = cfg.find((c: any) => c.key === 'payment.disabled_methods');
      const noticeCfg = cfg.find((c: any) => c.key === 'payment.maintenance_notice');
      const disabledArr: string[] = (() => {
        const v = disabledCfg?.value;
        if (Array.isArray(v)) return v.map((s: any) => String(s).toUpperCase());
        if (typeof v === 'string') {
          try { const arr = JSON.parse(v); return Array.isArray(arr) ? arr.map((s: any) => String(s).toUpperCase()) : []; } catch { return []; }
        }
        return [];
      })();
      setDisabled(new Set(disabledArr));
      setMaintenanceNotice(typeof noticeCfg?.value === 'string' ? noticeCfg.value : '');
      // Live bank health dari Flip
      try {
        const r = await fetch('/api/admin-proxy/bank-health').catch(() => null);
        if (r?.ok) {
          const list: BankHealth[] = await r.json();
          const map: Record<string, BankHealth> = {};
          list.forEach((b) => { map[b.code.toUpperCase()] = b; });
          setHealth(map);
        }
      } catch { /* noop */ }
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal load config');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  function toggle(code: string) {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await api.admin.setAppConfig('payment.disabled_methods', { value: Array.from(disabled), category: 'payment', description: 'Methods kode yg di-disable sementara' });
      await api.admin.setAppConfig('payment.maintenance_notice', { value: maintenanceNotice, category: 'payment', description: 'Banner gangguan bank/payment di mobile' });
      toast.success('Pengaturan tersimpan');
      void load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal simpan');
    } finally {
      setSaving(false);
    }
  }

  const groups: { type: Method['type']; label: string; icon: any }[] = [
    { type: 'bank', label: 'Bank Transfer (Virtual Account)', icon: CreditCard },
    { type: 'qris', label: 'QRIS', icon: CreditCard },
    { type: 'ewallet', label: 'E-Wallet', icon: Smartphone },
    { type: 'retail', label: 'Gerai Retail', icon: CreditCard },
    { type: 'card', label: 'Kartu', icon: CreditCard },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Metode Pembayaran</h1>
          <p className="text-sm text-slate-500">Enable/disable metode pembayaran customer saat ada gangguan bank/wallet.</p>
        </div>
        <button onClick={save} disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
      </div>

      <div className="mt-6 rounded-md border bg-amber-50 border-amber-200 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle size={18} className="text-amber-700 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-bold text-amber-900">Banner Peringatan (opsional)</h3>
            <p className="mt-1 text-xs text-amber-800">
              Teks ini tampil sebagai banner kuning di halaman wallet, withdraw, dan checkout mobile.
              Kosongkan untuk hide banner. Live status bank dari sistem pembayaran tetap tampil otomatis.
            </p>
            <textarea
              value={maintenanceNotice}
              onChange={(e) => setMaintenanceNotice(e.target.value)}
              rows={2}
              placeholder="Contoh: BCA & Mandiri maintenance 02:00-04:00 WIB. Transfer mungkin tertunda hingga normal."
              className="mt-2 w-full rounded border border-amber-300 bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 py-10 text-center text-sm text-slate-500">Memuat...</div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => {
            const methods = KNOWN_METHODS.filter((m) => m.type === g.type);
            if (methods.length === 0) return null;
            const Icon = g.icon;
            return (
              <div key={g.type} className="rounded-md border bg-white">
                <div className="flex items-center gap-2 border-b px-4 py-3">
                  <Icon size={16} className="text-slate-500" />
                  <h2 className="text-sm font-bold text-slate-900">{g.label}</h2>
                </div>
                <div className="divide-y">
                  {methods.map((m) => {
                    const code = m.code.toUpperCase();
                    const isDisabled = disabled.has(code);
                    const liveStatus = health[code]?.status;
                    return (
                      <div key={m.code} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-md flex items-center justify-center ${isDisabled ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                            {isDisabled ? <XCircle size={16} className="text-rose-600" /> : <CheckCircle2 size={16} className="text-emerald-600" />}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{m.name}</div>
                            <div className="text-xs text-slate-500 font-mono">{m.code}</div>
                          </div>
                          {liveStatus === 'down' && <Badge variant="red">Live: Down</Badge>}
                          {liveStatus === 'delayed' && <Badge variant="amber">Live: Delayed</Badge>}
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={!isDisabled}
                            onChange={() => toggle(code)}
                          />
                          <div className="w-11 h-6 bg-rose-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:border-slate-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
                          <span className="ml-3 text-sm font-medium text-slate-700">
                            {isDisabled ? 'Disabled' : 'Active'}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
