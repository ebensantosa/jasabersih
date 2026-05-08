import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(opts: {
    adminId: string;
    action: string;                       // e.g. 'kyc.approve', 'user.suspend'
    resourceType: string;                 // e.g. 'cleaner', 'booking', 'withdrawal'
    resourceId?: string | null;
    changes?: Record<string, unknown> | null;
    ipAddress?: string | null;
  }): Promise<void> {
    const changesJson = opts.changes ? JSON.stringify(opts.changes) : null;
    await this.prisma.$executeRaw`
      INSERT INTO admin_audit_log (admin_id, action, resource_type, resource_id, changes, ip_address)
      VALUES (
        ${opts.adminId}::uuid,
        ${opts.action},
        ${opts.resourceType},
        ${opts.resourceId ? opts.resourceId : null}::uuid,
        ${changesJson}::jsonb,
        ${opts.ipAddress ?? null}::inet
      )
    `;
  }
}
