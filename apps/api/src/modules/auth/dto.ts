import { z } from 'zod';

const PhoneNumberSchema = z
  .string()
  .regex(/^(\+62|62|0)8[1-9][0-9]{6,11}$/, 'Nomor HP Indonesia tidak valid');

export const UserModeSchema = z.enum(['customer', 'freelancer']);
export type UserMode = z.infer<typeof UserModeSchema>;

export const RegisterRequestSchema = z.object({
  phone: PhoneNumberSchema,
  mode: UserModeSchema,
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const VerifyOtpRequestSchema = z.object({
  phone: PhoneNumberSchema,
  otp: z.string().regex(/^\d{6}$/, 'OTP harus 6 digit'),
  password: z.string().min(8).max(72),
  fullName: z.string().min(2).max(100),
});
export type VerifyOtpRequest = z.infer<typeof VerifyOtpRequestSchema>;

export const LoginRequestSchema = z.object({
  phone: PhoneNumberSchema,
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('62')) return `+${digits}`;
  if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `+62${digits}`;
  return `+${digits}`;
}
