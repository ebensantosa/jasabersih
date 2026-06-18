import { BadRequestException, Body, Controller, Headers, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt.guard';
import { StorageService } from './storage.service';

@ApiTags('storage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('proxy-upload')
  async proxyUpload(
    @Req() req: Request & { body: Buffer | string | undefined; user?: { id: string } },
    @Headers('x-upload-url') uploadUrl?: string,
    @Headers('content-type') contentType?: string,
    @Body() _body?: unknown,
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Unauthorized');
    if (!uploadUrl) throw new BadRequestException('x-upload-url wajib.');
    if (!contentType) throw new BadRequestException('content-type wajib.');
    if (!this.storage.isTrustedUploadUrl(uploadUrl)) {
      throw new BadRequestException('Upload URL tidak valid.');
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === 'string'
        ? Buffer.from(req.body)
        : Buffer.alloc(0);
    if (rawBody.length === 0) throw new BadRequestException('File upload kosong.');

    await this.storage.proxySignedUpload(uploadUrl, rawBody, contentType);
    return { ok: true };
  }
}
