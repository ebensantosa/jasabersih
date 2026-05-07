import { z } from 'zod';

export type ApiResponse<T> = {
  data: T | null;
  error: ApiError | null;
  meta?: ResponseMeta;
};

export type ApiError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type ResponseMeta = {
  cursor?: string | null;
  hasMore?: boolean;
  total?: number;
  limit?: number;
};

export const PaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export type UUID = string;
export type ISODateString = string;

/** Money disimpan sebagai bigint dalam rupiah utuh (lihat CLAUDE.md). */
export type RupiahAmount = number;

export const PhoneNumberSchema = z
  .string()
  .regex(/^(\+62|62|0)8[1-9][0-9]{6,11}$/, 'Nomor HP Indonesia tidak valid');

export const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('62')) return `+${digits}`;
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `+62${digits}`;
  return `+${digits}`;
};
