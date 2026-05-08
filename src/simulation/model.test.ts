import { describe, expect, it } from "vitest";
import { baselineInfluent, baseControls, scenarios } from "../data/scenarios";
import { calculateSizing } from "./sizing";
import { applyScenarioControls, evaluateCompliance, runSimulation } from "./model";

describe("500 m3/day sizing", () => {
  it("calculates core design basis values from the Golden Thread plan", () => {
    const sizing = calculateSizing(500);
    expect(sizing.flowM3Hour).toBe(20.83);
    expect(sizing.equalizationM3).toBe(250);
    expect(sizing.coagulationM3).toBe(3.47);
    expect(sizing.flocculationM3).toBe(8.68);
    expect(sizing.lamellaAreaM2).toBe(20.83);
    expect(sizing.anoxicM3).toBe(83.33);
    expect(sizing.mbrM3).toBe(166.67);
    expect(sizing.membraneAreaM2).toBe(1041.67);
    expect(sizing.gacVolumeM3).toBe(8.68);
    expect(sizing.ozoneKgHour).toBe(1.04);
  });
});

describe("ZDHC compliance", () => {
  it("flags foundational failures", () => {
    const compliance = evaluateCompliance({ ...baselineInfluent, pH: 10, cod: 180, sb: 0.2 });
    const failed = compliance.filter((item) => item.status === "fail").map((item) => item.key);
    expect(failed).toContain("pH");
    expect(failed).toContain("cod");
    expect(failed).toContain("sb");
  });

  it("recovers the antimony exceedance scenario when final precipitation is tuned", () => {
    const scenario = scenarios.find((item) => item.id === "sb-exceed")!;
    const failingRun = runSimulation(scenario.inlet, applyScenarioControls(baseControls, scenario.controlOverrides));
    expect(failingRun.compliance.find((item) => item.key === "sb")?.status).toBe("fail");

    const recoveredRun = runSimulation(scenario.inlet, {
      ...applyScenarioControls(baseControls, scenario.controlOverrides),
      coagulantDose: 96,
      finalPhCorrection: 96
    });
    expect(recoveredRun.compliance.find((item) => item.key === "sb")?.status).toBe("pass");
  });

  it("shows lower treatment performance when MBR air is reduced", () => {
    const normal = runSimulation(baselineInfluent, baseControls);
    const lowAir = runSimulation(baselineInfluent, { ...baseControls, airFlow: 20, mbrHealth: 55 });
    expect(lowAir.effluent.cod).toBeGreaterThan(normal.effluent.cod);
    expect(lowAir.effluent.nh4).toBeGreaterThan(normal.effluent.nh4);
  });
});
