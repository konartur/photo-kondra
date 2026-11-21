import * as contracts from './dto/index.js';

/** Schemas are available before controllers land; this does not expose stub routes. */
export const portfolioModels = Object.entries(contracts)
  .filter(([name, value]) => name.endsWith('Dto') && typeof value === 'function')
  .map(([, value]) => value as new () => object);
