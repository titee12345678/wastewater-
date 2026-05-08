import type { ParameterLimit } from "../types";

export const parameterLimits: ParameterLimit[] = [
  { key: "pH", label: "pH", unit: "pH", foundational: [6, 9], progressive: [6, 9], aspirational: [6, 9], direction: "range", source: "ZDHC V2.2 Table 3" },
  { key: "color436", label: "Colour 436 nm", unit: "m-1", foundational: 7, progressive: 5, aspirational: 2, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "color525", label: "Colour 525 nm", unit: "m-1", foundational: 5, progressive: 3, aspirational: 1, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "color620", label: "Colour 620 nm", unit: "m-1", foundational: 3, progressive: 2, aspirational: 1, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "bod", label: "BOD5", unit: "mg/L", foundational: 30, progressive: 15, aspirational: 8, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "cod", label: "COD", unit: "mg/L", foundational: 150, progressive: 80, aspirational: 40, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "tss", label: "TSS", unit: "mg/L", foundational: 50, progressive: 15, aspirational: 5, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "nh4", label: "NH4-N", unit: "mg/L", foundational: 10, progressive: 1, aspirational: 0.5, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "tn", label: "Total Nitrogen", unit: "mg/L", foundational: 20, progressive: 10, aspirational: 5, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "tp", label: "Total Phosphorus", unit: "mg/L", foundational: 3, progressive: 0.5, aspirational: 0.1, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "aox", label: "AOX", unit: "mg/L", foundational: 3, progressive: 0.5, aspirational: 0.1, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "oil", label: "Oil & Grease", unit: "mg/L", foundational: 10, progressive: 2, aspirational: 0.5, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "phenol", label: "Phenol Index", unit: "mg/L", foundational: 0.5, progressive: 0.01, aspirational: 0.001, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "cyanide", label: "Cyanide, total", unit: "mg/L", foundational: 0.2, progressive: 0.1, aspirational: 0.05, direction: "max", source: "ZDHC V2.2 Table 3" },
  { key: "sb", label: "Antimony (Sb)", unit: "mg/L", foundational: 0.1, progressive: 0.05, aspirational: 0.01, direction: "max", source: "ZDHC V2.2 Table 2" },
  { key: "cu", label: "Copper (Cu)", unit: "mg/L", foundational: 1, progressive: 0.5, aspirational: 0.25, direction: "max", source: "ZDHC V2.2 Table 2" },
  { key: "cr", label: "Chromium, total", unit: "mg/L", foundational: 0.2, progressive: 0.1, aspirational: 0.05, direction: "max", source: "ZDHC V2.2 Table 2" },
  { key: "cr6", label: "Chromium VI", unit: "mg/L", foundational: 0.05, progressive: 0.005, aspirational: 0.001, direction: "max", source: "ZDHC V2.2 Table 2" },
  { key: "ni", label: "Nickel (Ni)", unit: "mg/L", foundational: 0.2, progressive: 0.1, aspirational: 0.05, direction: "max", source: "ZDHC V2.2 Table 2" },
  { key: "zn", label: "Zinc (Zn)", unit: "mg/L", foundational: 5, progressive: 1, aspirational: 0.5, direction: "max", source: "ZDHC V2.2 Table 2" }
];

export const limitByKey = Object.fromEntries(parameterLimits.map((limit) => [limit.key, limit])) as Record<string, ParameterLimit>;
