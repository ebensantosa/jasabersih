'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, X, Info, XCircle, Loader2 } from 'lucide-react';

// ============================================================
// MODAL
// ============================================================
export function Modal({
  title,
  open,
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const w = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`${w} max-h-[90vh] w-full overflow-auto rounded-lg bg-white shadow-xl`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b bg-white p-4">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="sticky bottom-0 border-t bg-white p-4">{footer}</div>}
      </div>
    </div>
  );
}

// ============================================================
// CONFIRM (replaces window.confirm)
// ============================================================
type ConfirmOpts = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
};

const ConfirmCtx = createContext<((opts: ConfirmOpts) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used within UiProvider');
  return ctx;
}

// ============================================================
// PROMPT (replaces window.prompt) — returns string or null on cancel
// ============================================================
type PromptOpts = {
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  multiline?: boolean;
  minLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
};

const PromptCtx = createContext<((opts: PromptOpts) => Promise<string | null>) | null>(null);

export function usePrompt() {
  const ctx = useContext(PromptCtx);
  if (!ctx) throw new Error('usePrompt must be used within UiProvider');
  return ctx;
}

// ============================================================
// TOAST (replaces alert)
// ============================================================
type Toast = { id: number; type: 'success' | 'error' | 'info'; message: string };

const ToastCtx = createContext<{
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
} | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within UiProvider');
  return ctx;
}

// ============================================================
// PROVIDER
// ============================================================
export function UiProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [promptState, setPromptState] = useState<(PromptOpts & { resolve: (v: string | null) => void }) | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const [promptError, setPromptError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const confirm = useCallback((opts: ConfirmOpts) => {
    return new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve }));
  }, []);

  const prompt = useCallback((opts: PromptOpts) => {
    setPromptValue(opts.initialValue ?? '');
    setPromptError(null);
    return new Promise<string | null>((resolve) => setPromptState({ ...opts, resolve }));
  }, []);

  function commitPrompt() {
    if (!promptState) return;
    const v = promptValue.trim();
    if (promptState.minLength && v.length < promptState.minLength) {
      setPromptError(`Minimal ${promptState.minLength} karakter.`);
      return;
    }
    promptState.resolve(v);
    setPromptState(null);
  }
  function cancelPrompt() {
    if (!promptState) return;
    promptState.resolve(null);
    setPromptState(null);
  }

  const pushToast = useCallback((type: Toast['type'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const toast = {
    success: (m: string) => pushToast('success', m),
    error: (m: string) => pushToast('error', m),
    info: (m: string) => pushToast('info', m),
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      <PromptCtx.Provider value={prompt}>
      <ToastCtx.Provider value={toast}>
        {children}

        {/* Confirm dialog */}
        {confirmState && (
          <Modal
            title={confirmState.title}
            open={true}
            onClose={() => { confirmState.resolve(false); setConfirmState(null); }}
            size="sm"
            footer={
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { confirmState.resolve(false); setConfirmState(null); }}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  {confirmState.cancelLabel ?? 'Batal'}
                </button>
                <button
                  onClick={() => { confirmState.resolve(true); setConfirmState(null); }}
                  className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                    confirmState.variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-700 hover:bg-blue-800'
                  }`}
                >
                  {confirmState.confirmLabel ?? 'Lanjut'}
                </button>
              </div>
            }
          >
            <p className="text-sm text-slate-700">{confirmState.message}</p>
          </Modal>
        )}

        {/* Prompt dialog */}
        {promptState && (
          <Modal
            title={promptState.title}
            open={true}
            onClose={cancelPrompt}
            size="sm"
            footer={
              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelPrompt}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  {promptState.cancelLabel ?? 'Batal'}
                </button>
                <button
                  onClick={commitPrompt}
                  className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                    promptState.variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-700 hover:bg-blue-800'
                  }`}
                >
                  {promptState.confirmLabel ?? 'Lanjut'}
                </button>
              </div>
            }
          >
            {promptState.message && <p className="mb-2 text-sm text-slate-700">{promptState.message}</p>}
            {promptState.multiline ? (
              <textarea
                autoFocus
                value={promptValue}
                onChange={(e) => { setPromptValue(e.target.value); setPromptError(null); }}
                placeholder={promptState.placeholder}
                rows={3}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            ) : (
              <input
                autoFocus
                value={promptValue}
                onChange={(e) => { setPromptValue(e.target.value); setPromptError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') commitPrompt(); }}
                placeholder={promptState.placeholder}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            )}
            {promptError && <p className="mt-2 text-xs text-red-600">{promptError}</p>}
          </Modal>
        )}

        {/* Toasts */}
        <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2">
          {toasts.map((t) => {
            const icons = {
              success: <CheckCircle2 size={18} className="text-green-600" />,
              error: <XCircle size={18} className="text-red-600" />,
              info: <Info size={18} className="text-blue-600" />,
            };
            const colors = {
              success: 'border-green-200 bg-green-50 text-green-900',
              error: 'border-red-200 bg-red-50 text-red-900',
              info: 'border-blue-200 bg-blue-50 text-blue-900',
            };
            return (
              <div key={t.id} className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded-md border px-4 py-3 text-sm shadow-lg ${colors[t.type]}`}>
                {icons[t.type]}
                <div className="flex-1">{t.message}</div>
              </div>
            );
          })}
        </div>
      </ToastCtx.Provider>
      </PromptCtx.Provider>
    </ConfirmCtx.Provider>
  );
}

// ============================================================
// FORM PRIMITIVES
// ============================================================
export function Input({
  label, value, onChange, type = 'text', placeholder, required, helpText, hint, error, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; helpText?: string; hint?: string; error?: string; disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${
          error ? 'border-red-300 focus:ring-red-200' : 'border-slate-300 focus:ring-blue-200'
        } ${disabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {!error && (helpText || hint) && <p className="mt-1 text-xs text-slate-500">{helpText ?? hint}</p>}
    </div>
  );
}

export function Textarea({
  label, value, onChange, rows = 4, placeholder, required, helpText, mono, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  rows?: number; placeholder?: string; required?: boolean; helpText?: string; mono?: boolean; disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 ${mono ? 'font-mono' : ''} ${disabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`}
      />
      {helpText && <p className="mt-1 text-xs text-slate-500">{helpText}</p>}
    </div>
  );
}

export function Select({
  label, value, options, onChange, required, helpText,
}: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
  required?: boolean; helpText?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {helpText && <p className="mt-1 text-xs text-slate-500">{helpText}</p>}
    </div>
  );
}

export function Button({
  children, onClick, variant = 'primary', loading, disabled, type = 'button', size = 'md', icon,
}: {
  children: ReactNode; onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  loading?: boolean; disabled?: boolean; type?: 'button' | 'submit'; size?: 'sm' | 'md';
  icon?: ReactNode;
}) {
  const cls = {
    primary: 'bg-blue-700 text-white hover:bg-blue-800',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-green-600 text-white hover:bg-green-700',
    ghost: 'text-slate-600 hover:bg-slate-100',
  }[variant];
  const padding = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium ${padding} ${cls} disabled:opacity-50`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition ${checked ? 'bg-blue-700' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-4' : 'left-0.5'}`} />
      </button>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  );
}

export function Badge({ children, variant = 'slate' }: { children: ReactNode; variant?: 'slate' | 'green' | 'red' | 'amber' | 'blue' | 'purple' }) {
  const cls = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-700',
    purple: 'bg-purple-100 text-purple-700',
  }[variant];
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}
