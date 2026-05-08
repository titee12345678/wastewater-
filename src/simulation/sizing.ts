export interface SizingBasis {
  capacityM3Day: number;
  flowM3Hour: number;
  equalizationM3: number;
  coagulationM3: number;
  flocculationM3: number;
  lamellaAreaM2: number;
  anoxicM3: number;
  mbrM3: number;
  membraneAreaM2: number;
  gacVolumeM3: number;
  ozoneKgHour: number;
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

export function calculateSizing(capacityM3Day = 500): SizingBasis {
  const flowM3Hour = capacityM3Day / 24;
  return {
    capacityM3Day,
    flowM3Hour: round(flowM3Hour),
    equalizationM3: round(capacityM3Day * 0.5),
    coagulationM3: round(capacityM3Day * (10 / 1440)),
    flocculationM3: round(capacityM3Day * (25 / 1440)),
    lamellaAreaM2: round(flowM3Hour / 1),
    anoxicM3: round(capacityM3Day * (4 / 24)),
    mbrM3: round(capacityM3Day * (8 / 24)),
    membraneAreaM2: round((capacityM3Day * 1000 / 24) / 20),
    gacVolumeM3: round(flowM3Hour * (25 / 60)),
    ozoneKgHour: round((capacityM3Day * 50 / 1000) / 24)
  };
}
