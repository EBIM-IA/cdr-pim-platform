/**
 * Dependency-injection tokens for the platform-wide (non module-specific) providers.
 *
 * Collected in one file so that a use case can depend on the *concept* of a clock or a
 * logger without importing the Nest module that happens to wire it up. Module-specific
 * tokens (e.g. `PRODUCT_REPOSITORY`) live next to their port instead.
 */
export const API_ENV = Symbol('API_ENV');
export const LOGGER = Symbol('LOGGER');
export const CLOCK = Symbol('CLOCK');
export const DATABASE = Symbol('DATABASE');
export const DATABASE_SQL = Symbol('DATABASE_SQL');
