import { Inject, Injectable } from '@nestjs/common';
import { DependencyUnavailableError } from '@cdr/shared';
import { sql } from 'drizzle-orm';
import { DATABASE } from '../../../../shared/tokens';
import type { Database } from '../../../../database/drizzle.client';
import type { DuplicateCandidatesPort } from '../../../catalog/domain/ports/duplicate-candidates.port';
@Injectable()
export class DrizzleDuplicateCandidates implements DuplicateCandidatesPort {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async detect() {
    try {
      const rows = await this.db.execute<{
        id_a: string;
        sku_a: string;
        name_a: string;
        brand_a: string | null;
        id_b: string;
        sku_b: string;
        name_b: string;
        brand_b: string | null;
        evidence: string;
      }>(sql`WITH identifiers AS (
        SELECT product_id, type, value FROM product_identifiers WHERE type <> 'sku'
        UNION ALL
        SELECT v.product_id, 'codigo_proveedor', v.value_text
        FROM product_attribute_values v JOIN attribute_definitions d ON d.id=v.attribute_definition_id
        WHERE d.key='codigo_proveedor' AND v.deleted_at IS NULL AND v.value_text IS NOT NULL
      ) SELECT DISTINCT ON (a.id,b.id)
        a.id AS id_a, a.sku AS sku_a, a.name AS name_a, a.brand AS brand_a,
        b.id AS id_b, b.sku AS sku_b, b.name AS name_b, b.brand AS brand_b,
        x.type || ': ' || x.value AS evidence
        FROM identifiers x JOIN identifiers y ON x.type=y.type AND UPPER(BTRIM(x.value))=UPPER(BTRIM(y.value)) AND x.product_id < y.product_id
        JOIN products a ON a.id=x.product_id JOIN products b ON b.id=y.product_id
        WHERE x.type <> 'sku' AND BTRIM(x.value) <> ''
        ORDER BY a.id,b.id,x.type,x.value LIMIT 1000`);
      return rows.map((row) => ({
        productA: { id: row.id_a, sku: row.sku_a, name: row.name_a, brand: row.brand_a },
        productB: { id: row.id_b, sku: row.sku_b, name: row.name_b, brand: row.brand_b },
        evidence: row.evidence,
      }));
    } catch (error) {
      throw new DependencyUnavailableError('duplicate-candidates', error);
    }
  }
}
