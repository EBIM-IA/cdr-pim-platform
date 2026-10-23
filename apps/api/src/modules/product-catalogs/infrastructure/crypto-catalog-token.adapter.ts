import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CatalogShareTokenPort } from '../domain/ports/product-catalog.port';
@Injectable()
export class CryptoCatalogTokenAdapter implements CatalogShareTokenPort {
  generate(): { token: string; digest: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, digest: this.digest(token) };
  }
  digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
