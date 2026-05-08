export type ParameterKey =
  | "pH"
  | "color436"
  | "color525"
  | "color620"
  | "bod"
  | "cod"
  | "tss"
  | "nh4"
  | "tn"
  | "tp"
  | "aox"
  | "oil"
  | "phenol"
  | "cyanide"
  | "sb"
  | "cu"
  | "cr"
  | "cr6"
  | "ni"
  | "zn";

export type QualityState = Record<ParameterKey, number>;

export type UnitKind =
  | "pretreatment"
  | "primary"
  | "biological"
  | "tertiary"
  | "polishing"
  | "monitoring"
  | "sludge";

export interface ParameterLimit {
  key: ParameterKey;
  label: string;
  unit: string;
  foundational: number | [number, number] | "absent" | "sample-report";
  progressive?: number | [number, number] | "sample-report";
  aspirational?: number | [number, number] | "sample-report";
  direction: "max" | "range" | "note";
  source: string;
}

export interface TreatmentUnit {
  id: string;
  order: number;
  name: string;
  thaiName: string;
  kind: UnitKind;
  x: number;
  y: number;
  w: number;
  h: number;
  purpose: string;
  designBasis: string;
  equipmentSpec: string;
  expectedRemoval: string;
  riskParameters: ParameterKey[];
  relatedLimits: ParameterKey[];
}

export interface Scenario {
  id: string;
  name: string;
  thaiName: string;
  description: string;
  inlet: QualityState;
  controlOverrides: Partial<SimulationControls>;
  targetUnitId?: string;
}

export interface SimulationControls {
  inletShock: number;
  dyeColorLoad: number;
  codBodLoad: number;
  sbLoad: number;
  coagulantDose: number;
  polymerDose: number;
  mbrHealth: number;
  airFlow: number;
  gacCondition: number;
  ozoneDose: number;
  finalPhCorrection: number;
}

export interface ComplianceResult {
  key: ParameterKey;
  label: string;
  unit: string;
  value: number;
  limit: ParameterLimit;
  status: "pass" | "fail" | "report";
}

export interface UnitRuntime {
  unitId: string;
  efficiency: number;
  alarm: boolean;
  reason: string;
}

export interface SimulationResult {
  influent: QualityState;
  afterPrimary: QualityState;
  afterBiological: QualityState;
  afterTertiary: QualityState;
  effluent: QualityState;
  compliance: ComplianceResult[];
  unitRuntime: Record<string, UnitRuntime>;
  overallStatus: "pass" | "fail";
  sludgeRisk: "low" | "medium" | "high";
}

export type ViewAngle = "iso" | "top" | "bottom" | "front" | "back" | "left" | "right";
