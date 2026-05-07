import { AlertCircle } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export function Field({
  label,
  error,
  required,
  children,
  hint,
}: {
  label: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <View>
      <View className="mb-1.5 flex-row items-center gap-1">
        <Text className="font-semibold text-[11px] uppercase tracking-wider text-ink-500">
          {label}
        </Text>
        {required && <Text className="font-bold text-[11px] text-danger">*</Text>}
      </View>
      <View
        className={`flex-row items-center gap-2 rounded-xl border bg-white px-4 py-3 ${
          error ? 'border-danger' : 'border-ink-200'
        }`}
      >
        {children}
      </View>
      {hint && !error && (
        <Text className="font-sans mt-1 text-[11px] text-ink-500">{hint}</Text>
      )}
      {error && (
        <View className="mt-1 flex-row items-center gap-1">
          <AlertCircle color="#DC2626" size={12} />
          <Text className="font-medium text-[11px] text-danger">{error}</Text>
        </View>
      )}
    </View>
  );
}

export function validateEmail(v: string): string | null {
  if (!v.trim()) return 'Email wajib diisi';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'Format email tidak valid';
  return null;
}

export function validatePassword(v: string, min = 8): string | null {
  if (!v) return 'Password wajib diisi';
  if (v.length < min) return `Password minimal ${min} karakter`;
  return null;
}

export function validateRequired(v: string, label = 'Field ini'): string | null {
  if (!v.trim()) return `${label} wajib diisi`;
  return null;
}

export function validatePhone(v: string): string | null {
  if (!v.trim()) return 'Nomor HP wajib diisi';
  if (!/^(\+62|62|0)8[1-9][0-9]{6,11}$/.test(v.replace(/\D/g, ''))) {
    return 'Nomor HP tidak valid (contoh: 0812xxxxxxxx)';
  }
  return null;
}

export function validateMinLength(v: string, min: number, label = 'Field'): string | null {
  if (v.trim().length < min) return `${label} minimal ${min} karakter`;
  return null;
}
