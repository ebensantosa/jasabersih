/* eslint-disable no-console */
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_USERS = [
  { email: 'admin@jasabersih.com', password: 'admin123', name: 'Super Admin', role: 'super_admin' },
  { email: 'ops@jasabersih.com', password: 'ops123', name: 'Ops Manager', role: 'ops_manager' },
  { email: 'cs@jasabersih.com', password: 'cs123', name: 'CS Team', role: 'cs' },
];

const SERVICES = [
  { code: 'kamar', name: 'Bersih Kamar', displayOrder: 1 },
  { code: 'dapur', name: 'Bersih Dapur', displayOrder: 2 },
  { code: 'kamar_mandi', name: 'Bersih Kamar Mandi', displayOrder: 3 },
  { code: 'ruang_tamu', name: 'Bersih Ruang Tamu', displayOrder: 4 },
  { code: 'full_house', name: 'Bersih Full House', displayOrder: 5 },
  { code: 'kos', name: 'Bersih Kos', displayOrder: 6 },
  { code: 'kantor', name: 'Bersih Kantor', displayOrder: 7 },
  { code: 'pasca_renovasi', name: 'Bersih Pasca Renovasi', displayOrder: 8 },
];

const ADD_ONS = [
  { code: 'kulkas', name: 'Bersih Kulkas', price: 25_000n, durationMin: 30 },
  { code: 'oven', name: 'Bersih Oven', price: 30_000n, durationMin: 30 },
  { code: 'jendela', name: 'Bersih Jendela', price: 20_000n, durationMin: 20 },
  { code: 'kasur', name: 'Bersih Kasur', price: 50_000n, durationMin: 45 },
  { code: 'sofa', name: 'Bersih Sofa', price: 75_000n, durationMin: 60 },
  { code: 'karpet', name: 'Bersih Karpet', price: 60_000n, durationMin: 45 },
  { code: 'gorden', name: 'Cuci Gorden', price: 40_000n, durationMin: 40 },
  { code: 'mesin_cuci', name: 'Bersih Mesin Cuci', price: 35_000n, durationMin: 30 },
  { code: 'ac', name: 'Bersih AC (luar saja)', price: 50_000n, durationMin: 30 },
  { code: 'plafon', name: 'Bersih Plafon/Sarang Laba', price: 30_000n, durationMin: 25 },
  { code: 'cuci_piring', name: 'Cuci Piring (penumpukan)', price: 25_000n, durationMin: 30 },
  { code: 'setrika', name: 'Setrika Pakaian', price: 30_000n, durationMin: 45 },
];

// Canonical commission rules — see memory/project_commission_rules.md.
// NoTools fixed 40%, WithTools decreases as order grows (platform margin
// scales with absolute amount on big orders).
const COMMISSION_TIERS = [
  { rangeMin: 0n,        rangeMax: 300_000n, cleanerShareNoTools: 40, cleanerShareWithTools: 60 },
  { rangeMin: 300_001n,  rangeMax: 600_000n, cleanerShareNoTools: 40, cleanerShareWithTools: 55 },
  { rangeMin: 600_001n,  rangeMax: null,     cleanerShareNoTools: 40, cleanerShareWithTools: 50 },
];

async function main() {
  console.warn('Seeding admin users...');
  for (const a of ADMIN_USERS) {
    const hash = await bcrypt.hash(a.password, 12);
    await prisma.$executeRaw`
      INSERT INTO admin_users (email, password_hash, name, role, is_active)
      VALUES (${a.email}, ${hash}, ${a.name}, ${a.role}, true)
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, role = EXCLUDED.role
    `;
  }

  console.warn('Seeding services...');
  for (const s of SERVICES) {
    await prisma.service.upsert({
      where: { code: s.code },
      update: { name: s.name, displayOrder: s.displayOrder },
      create: s,
    });
  }

  // Note: pricing_packages diurus oleh migration canonical (20260509200000_align_pricelist) +
  // dedupe (20260509230000_dedupe_packages). Seed legacy 'Kamar Standard' / 'Dapur Standard' /
  // 'Full House Tipe 36/45' di-skip karena pakai create() (bukan upsert) bikin duplicate
  // tiap deploy.

  console.warn('Seeding add-ons...');
  for (const a of ADD_ONS) {
    await prisma.addOn.upsert({
      where: { code: a.code },
      update: a,
      create: a,
    });
  }

  console.warn('Seeding commission tiers...');
  await prisma.commissionTier.deleteMany();
  for (const c of COMMISSION_TIERS) {
    await prisma.commissionTier.create({ data: c });
  }

  console.warn('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
