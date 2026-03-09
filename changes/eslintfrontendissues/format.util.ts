/**
 * Format a number as Philippine Peso currency
 * @param n - Number to format
 * @returns Formatted currency string
 */
export const fmt = (n: number | undefined | null): string =>
  `₱${Number(n ?? 0).toLocaleString()}`;

/**
 * Format a number as compact Philippine Peso (K/M suffix)
 * @param n - Number to format
 * @returns Compact formatted currency string
 */
export const fmtK = (n: number | undefined | null): string => {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `₱${(v / 1_000).toFixed(0)}k`;
  return `₱${v}`;
};

/**
 * Resolve a field value from a row using multiple candidate key names
 * @param row - The data row object
 * @param candidates - Array of candidate key names to try
 * @param fallback - Fallback value if no candidate found
 * @returns Resolved field value or fallback
 */
export const resolveField = (
  row: Record<string, unknown>,
  candidates: string[],
  fallback: unknown = '',
): unknown => {
  if (!row) return fallback;

  // Use for...of instead of iterator to avoid regenerator-runtime requirement
  for (const key of candidates) {
    const found = Object.keys(row).find(
      (k) => k.toLowerCase().replace(/[_\s]/g, '') === key.toLowerCase().replace(/[_\s]/g, ''),
    );
    if (found !== undefined && row[found] !== null && row[found] !== undefined) return row[found];
  }
  return fallback;
};
