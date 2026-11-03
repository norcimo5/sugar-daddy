import type { Unit } from './types';

/** mg/dL per mmol/L for glucose (molar mass 180.156 g/mol). */
export const GLUCOSE_MGDL_PER_MMOLL = 18.0156;
export const LB_PER_KG = 2.20462262185;

/** Linear relations: value in `large` = value in `small` × `factor`. */
const RELATIONS: readonly { small: Unit; large: Unit; factor: number }[] = [
  { small: 'mmol/L', large: 'mg/dL', factor: GLUCOSE_MGDL_PER_MMOLL },
  { small: 'kg', large: 'lb', factor: LB_PER_KG },
];

/** Converts between compatible units. Identity when equal; throws on incompatible units. */
export function convertValue(v: number, from: Unit, to: Unit): number {
  if (from === to) return v;
  for (const r of RELATIONS) {
    if (from === r.small && to === r.large) return v * r.factor;
    if (from === r.large && to === r.small) return v / r.factor;
  }
  throw new Error(`Cannot convert ${from} to ${to}`);
}

const DISPLAY_DECIMALS: Record<Unit, number> = {
  'mg/dL': 0,
  'mmol/L': 1,
  mmHg: 0,
  kg: 1,
  lb: 1,
};

export function displayDecimals(unit: Unit): number {
  return DISPLAY_DECIMALS[unit];
}

export function formatNumber(v: number, decimals: number): string {
  const s = v.toFixed(decimals);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}
