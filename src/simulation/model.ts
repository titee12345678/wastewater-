import { parameterLimits } from "../data/limits";
import { treatmentUnits } from "../data/units";
import type {
  ComplianceResult,
  ParameterKey,
  QualityState,
  SimulationControls,
  SimulationResult,
  UnitRuntime
} from "../types";

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const pct = (value: number) => clamp(value / 100);
const round = (value: number, digits = 3) => Number(value.toFixed(digits));

const keys: ParameterKey[] = [
  "pH",
  "color436",
  "color525",
  "color620",
  "bod",
  "cod",
  "tss",
  "nh4",
  "tn",
  "tp",
  "aox",
  "oil",
  "phenol",
  "cyanide",
  "sb",
  "cu",
  "cr",
  "cr6",
  "ni",
  "zn"
];

function cloneQuality(input: QualityState): QualityState {
  return Object.fromEntries(keys.map((key) => [key, input[key]])) as QualityState;
}

function reduce(q: QualityState, key: ParameterKey, fraction: number): void {
  q[key] = Math.max(0, q[key] * (1 - clamp(fraction)));
}

function multiplyInfluent(inlet: QualityState, controls: SimulationControls): QualityState {
  const q = cloneQuality(inlet);
  const shock = pct(controls.inletShock);
  const color = pct(controls.dyeColorLoad);
  const organic = pct(controls.codBodLoad);
  const sb = pct(controls.sbLoad);

  q.color436 *= 0.85 + color * 0.55 + shock * 0.2;
  q.color525 *= 0.85 + color * 0.55 + shock * 0.2;
  q.color620 *= 0.85 + color * 0.55 + shock * 0.2;
  q.cod *= 0.82 + organic * 0.62 + shock * 0.25;
  q.bod *= 0.82 + organic * 0.58 + shock * 0.18;
  q.tss *= 0.88 + shock * 0.38;
  q.oil *= 0.9 + organic * 0.35;
  q.phenol *= 0.9 + organic * 0.25;
  q.sb *= 0.76 + sb * 0.92;
  q.pH = 7.3 + shock * 1.2 + color * 0.4;
  return q;
}

function applyPrimary(input: QualityState, controls: SimulationControls): QualityState {
  const q = cloneQuality(input);
  const coag = pct(controls.coagulantDose);
  const polymer = pct(controls.polymerDose);
  const primary = clamp((coag * 0.65) + (polymer * 0.35));

  reduce(q, "tss", 0.72 * primary);
  reduce(q, "color436", 0.44 * primary);
  reduce(q, "color525", 0.42 * primary);
  reduce(q, "color620", 0.4 * primary);
  reduce(q, "cod", 0.22 * primary);
  reduce(q, "bod", 0.12 * primary);
  reduce(q, "tp", 0.45 * primary);
  reduce(q, "aox", 0.1 * primary);
  reduce(q, "oil", 0.25 * primary);
  reduce(q, "cu", 0.28 * primary);
  reduce(q, "zn", 0.18 * primary);
  reduce(q, "sb", 0.12 * primary);
  q.pH = q.pH - 0.25 + (coag - 0.5) * 0.15;
  return q;
}

function applyBiological(input: QualityState, controls: SimulationControls): QualityState {
  const q = cloneQuality(input);
  const bio = clamp(pct(controls.mbrHealth) * 0.62 + pct(controls.airFlow) * 0.38);

  reduce(q, "bod", 0.992 * bio);
  reduce(q, "cod", 0.84 * bio);
  reduce(q, "nh4", 0.93 * bio);
  reduce(q, "tn", 0.81 * bio);
  reduce(q, "tp", 0.28 * bio);
  reduce(q, "tss", 0.82 * bio);
  reduce(q, "oil", 0.55 * bio);
  reduce(q, "phenol", 0.5 * bio);
  q.pH = 7.15 + (q.pH - 7.15) * 0.45;
  return q;
}

function applyTertiary(input: QualityState, controls: SimulationControls): QualityState {
  const q = cloneQuality(input);
  const gac = pct(controls.gacCondition);
  const ozone = pct(controls.ozoneDose);

  reduce(q, "tss", 0.5);
  reduce(q, "color436", 0.65 * gac);
  reduce(q, "color525", 0.67 * gac);
  reduce(q, "color620", 0.69 * gac);
  reduce(q, "bod", 0.35 * gac);
  reduce(q, "cod", 0.32 * gac);
  reduce(q, "aox", 0.35 * gac);
  reduce(q, "phenol", 0.4 * gac);
  reduce(q, "oil", 0.25 * gac);

  reduce(q, "color436", 0.84 * ozone);
  reduce(q, "color525", 0.85 * ozone);
  reduce(q, "color620", 0.86 * ozone);
  reduce(q, "cod", 0.36 * ozone);
  reduce(q, "aox", 0.55 * ozone);
  reduce(q, "phenol", 0.55 * ozone);
  return q;
}

function applyFinalPolishing(input: QualityState, controls: SimulationControls): QualityState {
  const q = cloneQuality(input);
  const finalCoag = clamp(pct(controls.coagulantDose) * 0.5 + pct(controls.finalPhCorrection) * 0.5);
  const phCorrection = pct(controls.finalPhCorrection);

  reduce(q, "sb", 0.95 * finalCoag);
  reduce(q, "cu", 0.68 * finalCoag);
  reduce(q, "cr", 0.55 * finalCoag);
  reduce(q, "cr6", 0.42 * finalCoag);
  reduce(q, "ni", 0.48 * finalCoag);
  reduce(q, "zn", 0.5 * finalCoag);
  reduce(q, "tss", 0.42 * finalCoag);
  reduce(q, "tp", 0.55 * finalCoag);
  q.pH = q.pH * (1 - phCorrection) + 7.25 * phCorrection;
  return q;
}

export function evaluateCompliance(effluent: QualityState): ComplianceResult[] {
  return parameterLimits.map((limit) => {
    const value = round(effluent[limit.key]);
    let status: ComplianceResult["status"] = "pass";
    if (limit.direction === "note" || limit.foundational === "sample-report") {
      status = "report";
    } else if (Array.isArray(limit.foundational)) {
      const [min, max] = limit.foundational;
      status = value >= min && value <= max ? "pass" : "fail";
    } else if (typeof limit.foundational === "number") {
      status = value <= limit.foundational ? "pass" : "fail";
    }
    return {
      key: limit.key,
      label: limit.label,
      unit: limit.unit,
      value,
      limit,
      status
    };
  });
}

function buildUnitRuntime(result: {
  afterPrimary: QualityState;
  afterBiological: QualityState;
  afterTertiary: QualityState;
  effluent: QualityState;
}, controls: SimulationControls): Record<string, UnitRuntime> {
  const compliance = evaluateCompliance(result.effluent);
  const failed = new Set(compliance.filter((item) => item.status === "fail").map((item) => item.key));
  const runtime: Record<string, UnitRuntime> = {};

  for (const unit of treatmentUnits) {
    const riskFail = unit.relatedLimits.some((key) => failed.has(key));
    const efficiency =
      unit.kind === "primary" ? clamp((pct(controls.coagulantDose) + pct(controls.polymerDose)) / 2) :
      unit.kind === "biological" ? clamp((pct(controls.mbrHealth) + pct(controls.airFlow)) / 2) :
      unit.kind === "tertiary" ? clamp((pct(controls.gacCondition) + pct(controls.ozoneDose)) / 2) :
      unit.kind === "polishing" ? clamp((pct(controls.coagulantDose) + pct(controls.finalPhCorrection)) / 2) :
      unit.kind === "sludge" ? clamp(0.55 + pct(controls.polymerDose) * 0.4) :
      0.92;

    const lowEfficiency = efficiency < 0.48;
    runtime[unit.id] = {
      unitId: unit.id,
      efficiency: round(efficiency, 2),
      alarm: riskFail || lowEfficiency,
      reason: lowEfficiency ? "Low operating efficiency" : riskFail ? "Related ZDHC parameter failing" : "Normal"
    };
  }
  return runtime;
}

export function runSimulation(inlet: QualityState, controls: SimulationControls): SimulationResult {
  const influent = multiplyInfluent(inlet, controls);
  const afterPrimary = applyPrimary(influent, controls);
  const afterBiological = applyBiological(afterPrimary, controls);
  const afterTertiary = applyTertiary(afterBiological, controls);
  const effluent = applyFinalPolishing(afterTertiary, controls);
  const compliance = evaluateCompliance(effluent);
  const unitRuntime = buildUnitRuntime({ afterPrimary, afterBiological, afterTertiary, effluent }, controls);
  const failing = compliance.filter((item) => item.status === "fail");
  const sludgeRisk = effluent.sb > 0.1 || effluent.cu > 1 ? "high" : effluent.tss > 30 || effluent.sb > 0.05 ? "medium" : "low";

  return {
    influent,
    afterPrimary,
    afterBiological,
    afterTertiary,
    effluent,
    compliance,
    unitRuntime,
    overallStatus: failing.length === 0 ? "pass" : "fail",
    sludgeRisk
  };
}

export function applyScenarioControls(base: SimulationControls, patch: Partial<SimulationControls>): SimulationControls {
  return { ...base, ...patch };
}
