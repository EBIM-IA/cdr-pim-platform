import type { Uuid } from '@cdr/shared';

/**
 * Declares which attributes a product in a given category is expected to carry, and which
 * of them are mandatory before it can be published.
 *
 * This is the bridge between the `categories` and `attributes` contexts and the input to
 * any future data-quality score. Modelled as its own concept rather than as a field on
 * either side, because the *same* attribute (e.g. "diámetro interior") is required for
 * bearings and irrelevant for lubricants.
 *
 * NOT PERSISTED YET — see `Category`.
 */
export interface CategoryAttributeTemplate {
  readonly categoryId: Uuid;
  readonly attributeDefinitionId: Uuid;
  readonly required: boolean;
  /** Display order within the category's attribute sheet. */
  readonly position: number;
}
