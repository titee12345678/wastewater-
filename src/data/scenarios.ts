import type { QualityState, Scenario, SimulationControls } from "../types";

export const baseControls: SimulationControls = {
  inletShock: 10,
  dyeColorLoad: 28,
  codBodLoad: 30,
  sbLoad: 30,
  coagulantDose: 88,
  polymerDose: 85,
  mbrHealth: 96,
  airFlow: 94,
  gacCondition: 90,
  ozoneDose: 92,
  finalPhCorrection: 94
};

export const baselineInfluent: QualityState = {
  pH: 8.4,
  color436: 52,
  color525: 38,
  color620: 26,
  bod: 800,
  cod: 1500,
  tss: 420,
  nh4: 38,
  tn: 85,
  tp: 9,
  aox: 5.5,
  oil: 22,
  phenol: 1.1,
  cyanide: 0.08,
  sb: 0.32,
  cu: 1.8,
  cr: 0.12,
  cr6: 0.012,
  ni: 0.11,
  zn: 2.4
};

const withInfluent = (patch: Partial<QualityState>): QualityState => ({ ...baselineInfluent, ...patch });

export const scenarios: Scenario[] = [
  {
    id: "normal",
    name: "Normal Operation",
    thaiName: "เดินระบบปกติ",
    description: "Balanced dyehouse wastewater through inlet, holding, equalization pH, clarification, aeration, sand and carbon filtration.",
    inlet: baselineInfluent,
    controlOverrides: {},
    targetUnitId: "equalization"
  },
  {
    id: "high-color",
    name: "High Color Batch",
    thaiName: "น้ำสีเข้มจาก batch ย้อม",
    description: "Dark shade dyeing pushes color and COD; tune clarification, sand filter and carbon filter.",
    inlet: withInfluent({ color436: 86, color525: 64, color620: 46, cod: 1850 }),
    controlOverrides: { dyeColorLoad: 82, ozoneDose: 58, gacCondition: 62 },
    targetUnitId: "carbon-filter"
  },
  {
    id: "cod-shock",
    name: "COD Shock",
    thaiName: "COD shock load",
    description: "Leveling agents and lubricants spike organic load into aeration treatment.",
    inlet: withInfluent({ bod: 1100, cod: 2450, oil: 34, phenol: 1.8 }),
    controlOverrides: { inletShock: 76, codBodLoad: 86, mbrHealth: 74, airFlow: 68 },
    targetUnitId: "aeration"
  },
  {
    id: "sb-exceed",
    name: "Antimony Exceedance",
    thaiName: "Antimony เกินเกณฑ์",
    description: "Polyester input leaches Sb; recover by increasing chemical precipitation and pH correction.",
    inlet: withInfluent({ sb: 0.56, cod: 1650 }),
    controlOverrides: { sbLoad: 92, coagulantDose: 54, finalPhCorrection: 48 },
    targetUnitId: "primary-clarifier"
  },
  {
    id: "aeration-low-air",
    name: "Aeration Under-aeration",
    thaiName: "อากาศบ่อเติมอากาศต่ำ",
    description: "Low blower output reduces COD, BOD and NH4 treatment.",
    inlet: baselineInfluent,
    controlOverrides: { mbrHealth: 62, airFlow: 34 },
    targetUnitId: "aeration"
  },
  {
    id: "gac-exhausted",
    name: "Carbon Exhausted",
    thaiName: "ถ่านกัมมันต์ใกล้หมดอายุ",
    description: "Carbon media loses polishing capacity for color, COD and AOX.",
    inlet: baselineInfluent,
    controlOverrides: { gacCondition: 24, ozoneDose: 68 },
    targetUnitId: "carbon-filter"
  },
  {
    id: "carbon-polishing-low",
    name: "Low Polishing Reserve",
    thaiName: "กำลัง polishing ต่ำ",
    description: "Final polishing reserve is low, forcing clarification and carbon media to carry color removal.",
    inlet: baselineInfluent,
    controlOverrides: { ozoneDose: 0, gacCondition: 72 },
    targetUnitId: "carbon-filter"
  }
];
