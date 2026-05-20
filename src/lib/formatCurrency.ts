/**
 * MXN currency formatter — used throughout the payroll UI.
 * Locale: es-MX renders as "$1,234.56" (peso sign, period-decimal, comma-thousands).
 * Always pass a number; null/undefined returns "$0.00".
 */
const mxnFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMXN(amount: number | null | undefined): string {
  if (amount == null) return mxnFormatter.format(0);
  return mxnFormatter.format(amount);
}
