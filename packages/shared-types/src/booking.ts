import type { ISODateString, RupiahAmount, UUID } from './common';

export type BookingStatus =
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'searching_cleaner'
  | 'assigned'
  | 'cleaner_on_the_way'
  | 'in_progress'
  | 'completed'
  | 'cancelled_by_customer'
  | 'cancelled_by_cleaner'
  | 'cancelled_by_system'
  | 'disputed';

export type Booking = {
  id: UUID;
  customerId: UUID;
  cleanerId: UUID | null;
  serviceId: UUID;
  status: BookingStatus;
  scheduledAt: ISODateString;
  totalPrice: RupiahAmount;
  createdAt: ISODateString;
  updatedAt: ISODateString;
};
