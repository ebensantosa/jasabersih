import type { RupiahAmount, UUID } from './common';

export type PricingMode = 'package' | 'hourly' | 'wa_survey';

export type PricingPackage = {
  id: UUID;
  serviceId: UUID;
  name: string;
  description: string | null;
  basePrice: RupiahAmount;
  durationMinutes: number;
  active: boolean;
};

export type HourlyTier = {
  id: UUID;
  serviceId: UUID;
  minHours: number;
  maxHours: number;
  pricePerHour: RupiahAmount;
};

export type AddOn = {
  id: UUID;
  name: string;
  price: RupiahAmount;
  durationMinutes: number;
};
