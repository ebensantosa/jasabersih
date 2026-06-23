'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';

import { api } from '../../../lib/api';
import { Button, Input, useToast } from '../../../components/ui';

export default function EmailPage(): React.ReactElement | null {
  const toast = useToast();
  const [apiKey, setApiKey] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [fromName, setFromName] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const rows = (await api.admin.appConfig()) as any[];
      const map = new Map(rows.map((r) => [r.key, typeof r.value === 'string' ? r.value : r.value]));
      setApiKey(String(map.get('email.resend_api_key') ?? ''));
      setFromAddress(String(map.get('email.from_address') ?? 'noreply@jasabersih.com'));
      setFromName(String(map.get('email.from_name') ?? 'JasaBersih'));
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal load.');
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    try {
      await api.admin.setAppConfig('email.resend_api_key', { value: apiKey, category: 'email', description: 'Resend API key (re_xxx)' });
      await api.admin.setAppConfig('email.from_address', { value: fromAddress, category: 'email', description: 'From address (must match Resend verified domain)' });
      await api.admin.setAppConfig('email.from_name', { value: fromName, category: 'email', description: 'From name' });
      toast.success('Konfigurasi email tersimpan.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal simpan.');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testTo || !/^.+@.+\..+$/.test(testTo)) {
      toast.error('Email tujuan tidak valid.');
      return;
    }
    setTesting(true);
    try {
      const res = await api.admin.testEmail(testTo);
      if (res.ok) toast.success(`Email tes terkirim ke ${testTo} (id: ${res.id ?? 'ok'})`);
      else toast.error(`Gagal kirim: ${res.error ?? 'unknown'}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Gagal kirim.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Email (Resend)</h1>
      <p className="text-sm text-slate-500">Konfigurasi email transaksional via Resend â€” OTP, notifikasi booking, password reset.</p>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">Memuat...</div>
      ) : (
        <div className="mt-6 max-w-2xl space-y-4">
          <div className="rounded-md border bg-blue-50 p-3 text-xs text-blue-900">
            <b>Resend setup:</b> daftar di{' '}
            <a className="underline" href="https://resend.com" target="_blank" rel="noreferrer">
              resend.com
            </a>
            , verifikasi domain (jasabersih.com), bikin API key di{' '}
            <a className="underline" href="https://resend.com/api-keys" target="_blank" rel="noreferrer">
              resend.com/api-keys
            </a>
            , lalu paste di sini. From address harus pakai email di domain yang udah verified.
          </div>

          <div className="rounded-md border bg-white p-4">
            <h2 className="mb-3 text-base font-semibold">Konfigurasi Resend</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Resend API Key</label>
                <div className="flex gap-2">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
                  />
                  <Button variant="secondary" onClick={() => setShowKey((v) => !v)}>
                    {showKey ? 'Sembunyikan' : 'Tampilkan'}
                  </Button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">Disimpan di app_config (DB) - bisa diubah tanpa restart server.</p>
              </div>
              <Input
                label="From Address"
                required
                value={fromAddress}
                onChange={setFromAddress}
                placeholder="noreply@jasabersih.com"
                helpText="Harus email di domain yang sudah verified di Resend."
              />
              <Input
                label="From Name"
                required
                value={fromName}
                onChange={setFromName}
                placeholder="JasaBersih"
                helpText="Nama yang muncul sebagai sender di inbox penerima."
              />
              <Button variant="primary" onClick={save} loading={saving}>
                Simpan Konfigurasi
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-white p-4">
            <h2 className="mb-3 text-base font-semibold">Test Send</h2>
            <p className="mb-3 text-xs text-slate-500">Kirim email tes untuk verifikasi konfigurasi sudah benar.</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="email-tujuan@example.com"
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <Button variant="primary" onClick={sendTest} loading={testing} icon={<Send size={14} />}>
                Kirim Tes
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-amber-50 p-3 text-xs text-amber-900">
            <b>Dipakai untuk:</b> OTP verifikasi pendaftaran (email lebih reliable daripada SMS), notifikasi booking, password reset, dan broadcast.
          </div>
        </div>
      )}
    </div>
  );
}
