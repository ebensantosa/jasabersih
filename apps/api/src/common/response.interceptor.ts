import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, map } from 'rxjs';

/** Wraps every successful response into { data, error: null, meta? }. */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    return next.handle().pipe(
      map((payload) => {
        if (payload && typeof payload === 'object' && 'data' in payload && 'error' in payload) {
          return payload;
        }
        if (payload && typeof payload === 'object' && 'items' in payload && 'meta' in payload) {
          const p = payload as { items: unknown; meta: unknown };
          return { data: p.items, error: null, meta: p.meta };
        }
        return { data: payload, error: null };
      }),
    );
  }
}
