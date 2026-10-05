import { ValidationError } from '@cdr/shared';
import { describe, expect, it } from 'vitest';

import { parseFilter } from './list-catalog-grid.use-case';

describe('catalog attribute filter parser', () => {
  it('keeps colons inside the filter value', () => {
    expect(parseFilter('descripcion:contains:rodamiento:industrial')).toEqual({
      key: 'descripcion',
      operator: 'contains',
      value: 'rodamiento:industrial',
    });
  });

  it.each(['missing', ':eq:value', 'code:unknown:value', 'code:eq:'])(
    'rejects malformed filter %s',
    (filter) => expect(() => parseFilter(filter)).toThrow(ValidationError),
  );
});
