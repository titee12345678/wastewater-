/**
 * Plant3DPreview.tsx — Triplex-ready wrapper for visual editing
 *
 * This component wraps Plant3D with mock data so Triplex can render
 * the full 3D ETP scene without needing the parent App's state.
 *
 * Usage in Triplex:
 * 1. Right-click this file → "Open in Triplex"
 * 2. Visual editor will show the complete ETP plant
 * 3. Select/move/resize any 3D object
 * 4. Changes auto-save back to code
 */
import { Plant3D } from "./Plant3D";
import { treatmentUnits } from "../data/units";
import { runSimulation } from "../simulation/model";
import { baselineInfluent, baseControls } from "../data/scenarios";

const mockSimulation = runSimulation(baselineInfluent, baseControls);

/** @triplex editable */
export function Plant3DPreview({
  selectedUnitId = "equalization",
  isRunning = false
}: {
  /** @tag dropdown ["inlet","holding-tank","equalization","primary-clarifier","aeration","secondary-clarifier","sand-filter","carbon-filter","sludge-holding","sludge-press","sludge-storage"] */
  selectedUnitId?: string;
  isRunning?: boolean;
}) {
  return (
    <Plant3D
      units={treatmentUnits}
      selectedUnitId={selectedUnitId}
      simulation={mockSimulation}
      isRunning={isRunning}
      viewAngle="iso"
      onSelectUnit={() => {}}
    />
  );
}
