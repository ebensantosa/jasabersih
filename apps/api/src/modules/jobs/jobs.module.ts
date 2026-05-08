import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '../auth/auth.module';
import { JobsGateway } from './jobs.gateway';

@Global()
@Module({
  imports: [AuthModule, JwtModule.register({})],
  providers: [JobsGateway],
  exports: [JobsGateway],
})
export class JobsModule {}
