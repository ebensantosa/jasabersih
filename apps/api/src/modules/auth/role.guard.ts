import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from './jwt.strategy';

@Injectable()
export class CustomerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user as AuthenticatedUser | undefined;
    if (!user?.isCustomer) {
      throw new ForbiddenException({ code: 'CUSTOMER_ONLY', message: 'Endpoint ini hanya untuk akun customer.' });
    }
    return true;
  }
}

@Injectable()
export class CleanerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest().user as AuthenticatedUser | undefined;
    if (!user?.isFreelancer) {
      throw new ForbiddenException({ code: 'CLEANER_ONLY', message: 'Endpoint ini hanya untuk akun cleaner.' });
    }
    return true;
  }
}
