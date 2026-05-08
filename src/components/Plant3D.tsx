import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, OrbitControls, RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";
import type { SimulationResult, TreatmentUnit, UnitKind, ViewAngle } from "../types";

const waterPipeFlows = [
  ["secondary-clarifier", "sand-filter"],
  ["sand-filter", "carbon-filter"]
];
const FLOW_TOUR_OVERVIEW_ID = "__overview";
const LOWEST_OVERFLOW_DATUM_CM = -28;
const LOWEST_OVERFLOW_SURFACE_Y = 1.38;
const OVERFLOW_LEVEL_VISUAL_SCALE = 1.35;

const sludgeFlows = [
  ["secondary-clarifier", "primary-clarifier"],
  ["primary-clarifier", "sludge-holding", "sludge-press", "sludge-storage"]
];

/* Photo-realistic ETP plant colors — real concrete, industrial steel */
const kindColors: Record<UnitKind, { body: string; water: string; accent: string }> = {
  pretreatment: { body: "#8a9498", water: "#5a8878", accent: "#4a6a72" },
  primary: { body: "#7a8890", water: "#5a7a72", accent: "#4a6870" },
  biological: { body: "#788a80", water: "#4a7860", accent: "#3a6a50" },
  tertiary: { body: "#7a8898", water: "#5a7a88", accent: "#4a6878" },
  polishing: { body: "#8a8880", water: "#7a7868", accent: "#6a6858" },
  monitoring: { body: "#7a8288", water: "#5a6a78", accent: "#4a5a68" },
  sludge: { body: "#7a6e60", water: "#5a4a38", accent: "#4a3e30" }
};

const SAFETY_YELLOW = "#f2c400";
const GALVANIZED_STEEL = "#7a8488";
const STAINLESS = "#909aa0";
const CONCRETE_LIGHT = "#b0aca6";
const CONCRETE_DARK = "#888480";
const PAINTED_STEEL_BLUE = "#4a6070";
const PAINTED_STEEL_GREEN = "#3a5a48";
const LAYOUT_WIDTH_M = 50;
const LAYOUT_DEPTH_M = 29;
const LAYOUT_CENTER_X = LAYOUT_WIDTH_M / 2;
const LAYOUT_CENTER_Z = LAYOUT_DEPTH_M / 2;
const PAD_WIDTH_M = 56;
const PAD_DEPTH_M = 34;
const PAD_HALF_X = PAD_WIDTH_M / 2;
const PAD_HALF_Z = PAD_DEPTH_M / 2;
const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 55, 32];
const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0, 0];
const TREATED_DISCHARGE_OFFSET_M = 2.7;

type PhysicalSpec = {
  label: string;
  widthM?: number;
  lengthM?: number;
  depthM?: number;
  volumeM3?: number;
  footprintM2?: number;
};

const physicalSpecs: Record<string, PhysicalSpec> = {
  inlet: {
    label: "2 x 2 m inlet channel",
    widthM: 2,
    lengthM: 2,
    depthM: 0.7,
    footprintM2: 4
  },
  "holding-tank": {
    label: "5 x 8 x 3 m / 120 m³ (หมุน 90° จากบ่อ 3)",
    widthM: 8,
    lengthM: 5,
    depthM: 3,
    volumeM3: 120,
    footprintM2: 40
  },
  equalization: {
    label: "13 x 13 x 3 m / 500 m³",
    widthM: 13,
    lengthM: 13,
    depthM: 3,
    volumeM3: 500,
    footprintM2: 169
  },
  "primary-clarifier": {
    label: "5 x 8 x 3 m / 120 m³",
    widthM: 5,
    lengthM: 8,
    depthM: 3,
    volumeM3: 120,
    footprintM2: 40
  },
  aeration: {
    label: "12 x 18 x 3 m / 648 m³",
    widthM: 12,
    lengthM: 18,
    depthM: 3,
    volumeM3: 648,
    footprintM2: 216
  },
  "secondary-clarifier": {
    label: "Rectangular 7 x 7 x 3 m / 147 m³",
    widthM: 7,
    lengthM: 7,
    depthM: 3,
    volumeM3: 147,
    footprintM2: 49
  },
  "sludge-holding": {
    label: "3 x 3 m / 40 m³ sludge holding",
    widthM: 3,
    lengthM: 3,
    depthM: 2.5,
    volumeM3: 40,
    footprintM2: 9
  },
  "sludge-press": {
    label: "5 x 3 m sludge press",
    widthM: 5,
    lengthM: 3,
    footprintM2: 15
  },
  "sludge-storage": {
    label: "5 x 4 m covered sludge storage",
    widthM: 5,
    lengthM: 4,
    footprintM2: 20
  },
  "sand-filter": {
    label: "2 x 2 m pressure vessel skid",
    widthM: 2,
    lengthM: 2,
    footprintM2: 4
  },
  "carbon-filter": {
    label: "2 x 2 m GAC vessel skid",
    widthM: 2,
    lengthM: 2,
    footprintM2: 4
  }
};

const overflowDatumCm: Record<string, number> = {
  inlet: 7,
  equalization: -7,
  "primary-clarifier": -14,
  aeration: -21,
  "secondary-clarifier": -28
};

function worldPosition(unit: TreatmentUnit) {
  return new THREE.Vector3(unit.x + unit.w / 2 - LAYOUT_CENTER_X, 0, unit.y + unit.h / 2 - LAYOUT_CENTER_Z);
}

function unitScale(unit: TreatmentUnit) {
  return { x: unit.w, z: unit.h };
}

function unitHeight(unit: TreatmentUnit) {
  if (unit.id === "inlet") return 0.72;
  const spec = physicalSpecs[unit.id];
  if (spec?.depthM) return Math.max(1.05, spec.depthM / 2.35);
  return unit.kind === "monitoring" ? 1.15 : unit.kind === "sludge" ? 1.05 : 1.35;
}

function unitWaterTopOffset(id: string) {
  if (id === "holding-tank") return Math.max(1.05, 3 / 2.35) * 0.88;
  if (physicalSpecs[id]?.depthM) return Math.max(1.05, (physicalSpecs[id].depthM ?? 3) / 2.35);
  return 1.28;
}

function overflowSurfaceY(id: string) {
  const datum = overflowDatumCm[id];
  if (datum === undefined || id === "inlet") return undefined;
  return LOWEST_OVERFLOW_SURFACE_Y + ((datum - LOWEST_OVERFLOW_DATUM_CM) / 100) * OVERFLOW_LEVEL_VISUAL_SCALE;
}

function unitElevation(id: string) {
  if (id === "inlet") return 0;
  const datum = overflowDatumCm[id];
  if (datum === undefined) return 0;
  return Math.max(0, (overflowSurfaceY(id) ?? LOWEST_OVERFLOW_SURFACE_Y) - unitWaterTopOffset(id));
}

function overflowLevelLabel(id: string) {
  const datum = overflowDatumCm[id];
  if (datum === undefined || id === "inlet") return undefined;
  return datum === 0 ? "Overflow datum 0 cm" : `Overflow level ${datum} cm`;
}

function unitDisplayBadge(unit: TreatmentUnit) {
  return unit.id === "inlet" ? "S1" : String(unit.order);
}

function SoftBox({
  args,
  position = [0, 0, 0],
  rotation,
  radius = 0.035,
  castShadow = true,
  receiveShadow = true,
  children
}: {
  args: [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  radius?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  children: ReactNode;
}) {
  return (
    <RoundedBox args={args} radius={radius} smoothness={3} bevelSegments={2} castShadow={castShadow} receiveShadow={receiveShadow} position={position} rotation={rotation}>
      {children}
    </RoundedBox>
  );
}

function CylinderBetween({
  start,
  end,
  radius,
  color,
  metalness = 0.34,
  roughness = 0.4
}: {
  start: [number, number, number];
  end: [number, number, number];
  radius: number;
  color: string;
  metalness?: number;
  roughness?: number;
}) {
  const startPoint = new THREE.Vector3(...start);
  const endPoint = new THREE.Vector3(...end);
  const direction = endPoint.clone().sub(startPoint);
  const midpoint = startPoint.clone().add(endPoint).multiplyScalar(0.5);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());

  return (
    <mesh castShadow receiveShadow position={midpoint.toArray()} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, direction.length(), 12]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

export function Plant3D({
  units,
  selectedUnitId,
  focusedUnitId,
  simulation,
  isRunning,
  viewAngle,
  onSelectUnit
}: {
  units: TreatmentUnit[];
  selectedUnitId: string;
  focusedUnitId?: string;
  simulation: SimulationResult;
  isRunning: boolean;
  viewAngle: ViewAngle;
  onSelectUnit: (id: string) => void;
}) {
  const hasWebGL = typeof window !== "undefined" && "WebGLRenderingContext" in window;
  const controlsRef = useRef<any>(null);

  return (
    <div className="plant-map plant-map--3d" data-testid="plant-map">
      <div className="scene-accessibility">
        {units.map((unit) => (
          <button key={unit.id} type="button" onClick={() => onSelectUnit(unit.id)}>
            {unit.name}{unit.thaiName}
          </button>
        ))}
      </div>
      {!hasWebGL ? (
        <div className="webgl-fallback">3D preview requires WebGL.</div>
      ) : (
        <Canvas
          shadows
          camera={{ position: DEFAULT_CAMERA_POSITION, fov: 34, near: 0.1, far: 220 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95 }}
        >
          <color attach="background" args={["#b8c4cc"]} />
          <fog attach="fog" args={["#b4c0c8", 110, 230]} />
          <ambientLight intensity={0.3} color="#d8e0e8" />
          <hemisphereLight args={["#a8bcc8", "#787068", 0.55]} />
          <directionalLight
            position={[16, 32, 18]}
            intensity={2.8}
            castShadow
            shadow-mapSize={[4096, 4096]}
            shadow-camera-far={165}
            shadow-camera-left={-44}
            shadow-camera-right={44}
            shadow-camera-top={44}
            shadow-camera-bottom={-44}
            shadow-bias={-0.0001}
            shadow-normalBias={0.015}
            color="#fdf6e8"
          />
          <directionalLight position={[-14, 16, -20]} intensity={0.45} color="#90a8c0" />
          <directionalLight position={[2, 6, 26]} intensity={0.2} color="#a0b0c0" />
          {/* Rim light for depth separation */}
          <directionalLight position={[-20, 8, 0]} intensity={0.15} color="#c0d0e0" />
          <ETPScene
            units={units}
            selectedUnitId={selectedUnitId}
            simulation={simulation}
            isRunning={isRunning}
            onSelectUnit={onSelectUnit}
          />
          <OrbitControls
            ref={controlsRef}
            makeDefault
            target={DEFAULT_CAMERA_TARGET}
            minDistance={18}
            maxDistance={180}
            minPolarAngle={0.45}
            maxPolarAngle={1.25}
            enablePan
            dampingFactor={0.08}
          />
          <CameraTourRig units={units} focusedUnitId={focusedUnitId} viewAngle={viewAngle} controlsRef={controlsRef} />
          <InitialCameraRig controlsRef={controlsRef} />
          <Environment preset="city" environmentIntensity={0.25} />
          <ContactShadowPlane />
        </Canvas>
      )}
    </div>
  );
}

function InitialCameraRig({ controlsRef }: { controlsRef: MutableRefObject<any> }) {
  const { camera } = useThree();

  useEffect(() => {
    const target = new THREE.Vector3(...DEFAULT_CAMERA_TARGET);
    let frameCount = 0;
    let frameId = 0;

    const syncCamera = () => {
      camera.position.set(...DEFAULT_CAMERA_POSITION);
      camera.lookAt(target);
      if (controlsRef.current) {
        controlsRef.current.target.copy(target);
        controlsRef.current.update();
      }
      frameCount += 1;
      if (frameCount < 90) {
        frameId = window.requestAnimationFrame(syncCamera);
      }
    };

    syncCamera();
    return () => window.cancelAnimationFrame(frameId);
  }, [camera, controlsRef]);

  return null;
}

function CameraTourRig({
  units,
  focusedUnitId,
  viewAngle,
  controlsRef
}: {
  units: TreatmentUnit[];
  focusedUnitId?: string;
  viewAngle: ViewAngle;
  controlsRef: MutableRefObject<any>;
}) {
  const { camera, size } = useThree();
  const isMobile = size.width < 768;
  const focus = useMemo(() => {
    if (viewAngle !== "iso") {
      const target = new THREE.Vector3(...DEFAULT_CAMERA_TARGET);
      let pos = new THREE.Vector3();
      switch (viewAngle) {
        case "top": pos.set(0, 105, 0); break;
        case "bottom": pos.set(0, -105, 0); break;
        case "front": pos.set(0, 10, 105); break;
        case "back": pos.set(0, 10, -105); break;
        case "left": pos.set(-105, 10, 0); break;
        case "right": pos.set(105, 10, 0); break;
        default: break;
      }
      return { target, cameraPosition: pos, fov: 34 };
    }
    if (!focusedUnitId) return null;
    if (focusedUnitId === FLOW_TOUR_OVERVIEW_ID) {
      const target = new THREE.Vector3(...DEFAULT_CAMERA_TARGET);
      const cameraPosition = new THREE.Vector3(...DEFAULT_CAMERA_POSITION);
      if (isMobile) {
        cameraPosition.multiplyScalar(1.6);
        target.y -= 10;
        cameraPosition.y -= 10;
      }
      return {
        target,
        cameraPosition
      };
    }
    /* Virtual chemical tour stops — zoom into dosing area */
    const chemParentMap: Record<string, string> = {
      "__eq-chemical": "equalization",
      "__primary-chemical": "primary-clarifier"
    };
    const chemParentId = chemParentMap[focusedUnitId];
    if (chemParentId) {
      const parentUnit = units.find((item) => item.id === chemParentId);
      if (parentUnit) {
        const base = worldPosition(parentUnit);
        const elev = unitElevation(chemParentId);
        const scale = unitScale(parentUnit);
        const s = Math.max(1, Math.min(scale.x, scale.z) * 0.18);
        /* Target = dosing area behind the basin (z negative) */
        const target = new THREE.Vector3(
          base.x + s * 1.3,
          elev + 0.3,
          base.z - scale.z * 0.48 - s
        );
        const offset = new THREE.Vector3(-4.2, 8.5, -8);
        if (isMobile) {
          offset.multiplyScalar(1.5);
          target.y -= 2;
        }
        /* Camera approaches from further behind + above to see both tanks & pumps */
        return {
          target,
          cameraPosition: target.clone().add(offset)
        };
      }
    }
    const unit = units.find((item) => item.id === focusedUnitId);
    if (!unit) return null;
    const base = worldPosition(unit);
    const target = new THREE.Vector3(base.x, unitElevation(unit.id) + 0.82, base.z - Math.min(unit.h * 0.18, 2.4));
    const wideUnit = unit.w > 12 || unit.h > 10;
    const offset = wideUnit ? new THREE.Vector3(10, 13, 14) : new THREE.Vector3(5.5, 8, 8);

    if (unit.id === "sludge-press" || unit.id === "sludge-storage" || unit.id === "sludge-holding") {
      offset.set(5.8, 8.4, 7.4);
    }

    if (isMobile) {
      offset.multiplyScalar(wideUnit ? 1.7 : 1.9); // zoom out more on mobile
      target.y -= wideUnit ? 4 : 2; // move target down so unit appears higher on screen
    }

    return {
      target,
      cameraPosition: target.clone().add(offset),
      fov: 34
    };
  }, [focusedUnitId, units, viewAngle, isMobile]);

  const isTransitioning = useRef(false);

  useEffect(() => {
    isTransitioning.current = true;
    const timeout = setTimeout(() => {
      isTransitioning.current = false;
    }, 1200); // 1.2 seconds max transition time ensures it never locks indefinitely
    
    return () => clearTimeout(timeout);
  }, [focus]);

  useFrame(() => {
    if (!focus || !isTransitioning.current) return;
    const isOverview = focusedUnitId === FLOW_TOUR_OVERVIEW_ID || viewAngle !== "iso";
    camera.position.lerp(focus.cameraPosition, isOverview ? 0.08 : 0.075);
    camera.lookAt(focus.target);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(focus.target, isOverview ? 0.1 : 0.12);
      controlsRef.current.update();
    }
    
    // Stop transitioning early if it's very close
    if (camera.position.distanceTo(focus.cameraPosition) < 0.5) {
      isTransitioning.current = false;
    }
  });

  return null;
}

function ETPScene({
  units,
  selectedUnitId,
  simulation,
  isRunning,
  onSelectUnit
}: {
  units: TreatmentUnit[];
  selectedUnitId: string;
  simulation: SimulationResult;
  isRunning: boolean;
  onSelectUnit: (id: string) => void;
}) {
  const unitMap = useMemo(() => Object.fromEntries(units.map((unit) => [unit.id, unit])) as Record<string, TreatmentUnit>, [units]);

  return (
    <group rotation={[0, -0.03, 0]}>
      <PlantBase />
      <RealWorldSiteLayer unitMap={unitMap} simulation={simulation} isRunning={isRunning} />
      {unitMap.inlet && (
        <SampleMarker label="S1 น้ำเข้า (จากโรงย้อม)" position={[worldPosition(unitMap.inlet).x - 8.2, 0.02, worldPosition(unitMap.inlet).z + 1.2]} color="#0a9b9a" />
      )}
      {unitMap["carbon-filter"] && (
        <SampleMarker
          label="S2 น้ำหลังบำบัด"
          position={[
            worldPosition(unitMap["carbon-filter"]).x - TREATED_DISCHARGE_OFFSET_M,
            0.02,
            worldPosition(unitMap["carbon-filter"]).z
          ]}
          color="#0a9b9a"
        />
      )}
      {unitMap["sludge-storage"] && (
        <SampleMarker label="S3 ตะกอน" position={[worldPosition(unitMap["sludge-storage"]).x - 1.5, 0.02, worldPosition(unitMap["sludge-storage"]).z]} color="#7b5a35" />
      )}

      <InletHoldingPump from={unitMap.inlet} to={unitMap["holding-tank"]} isRunning={isRunning} />
      <PumpTransferPipe from={unitMap["holding-tank"]} to={unitMap.equalization} isRunning={isRunning} />
      <CascadeLaunder from={unitMap.equalization} to={unitMap["primary-clarifier"]} isRunning={isRunning} />
      <CascadeLaunder from={unitMap["primary-clarifier"]} to={unitMap.aeration} isRunning={isRunning} />
      <CascadeLaunder from={unitMap.aeration} to={unitMap["secondary-clarifier"]} isRunning={isRunning} />

      {waterPipeFlows.map((ids) => (
        <FlowNetwork key={ids.join("-")} ids={ids} unitMap={unitMap} isRunning={isRunning} color="#278fc2" />
      ))}
      <TreatedDischargePipe from={unitMap["carbon-filter"]} isRunning={isRunning} />
      {sludgeFlows.map((ids) => (
        <FlowNetwork key={ids.join("-")} ids={ids} unitMap={unitMap} isRunning={isRunning} color="#8a663e" sludge />
      ))}

      {units.map((unit) => (
        <UnitModel
          key={unit.id}
          unit={unit}
          selected={selectedUnitId === unit.id}
          alarm={simulation.unitRuntime[unit.id]?.alarm ?? false}
          isRunning={isRunning}
          onSelect={() => onSelectUnit(unit.id)}
        />
      ))}
    </group>
  );
}

function CascadeLaunder({ from, to, isRunning }: { from?: TreatmentUnit; to?: TreatmentUnit; isRunning: boolean }) {
  if (!from || !to) return null;
  const beadRef = useRef<THREE.Mesh>(null);
  const arrowRef = useRef<THREE.Mesh>(null);
  const fromPos = worldPosition(from);
  const toPos = worldPosition(to);
  const fromScale = unitScale(from);
  const toScale = unitScale(to);
  const fromSurface = overflowSurfaceY(from.id) ?? unitElevation(from.id) + unitWaterTopOffset(from.id);
  const toSurface = overflowSurfaceY(to.id) ?? unitElevation(to.id) + unitWaterTopOffset(to.id);
  const fromMinZ = fromPos.z - fromScale.z / 2 + 0.45;
  const fromMaxZ = fromPos.z + fromScale.z / 2 - 0.45;
  const toMinZ = toPos.z - toScale.z / 2 + 0.45;
  const toMaxZ = toPos.z + toScale.z / 2 - 0.45;
  const overlapMinZ = Math.max(fromMinZ, toMinZ);
  const overlapMaxZ = Math.min(fromMaxZ, toMaxZ);
  const routeZ = overlapMinZ <= overlapMaxZ ? (overlapMinZ + overlapMaxZ) / 2 : (fromPos.z + toPos.z) / 2;
  const fromLeft = fromPos.x - fromScale.x / 2;
  const fromRight = fromPos.x + fromScale.x / 2;
  const toLeft = toPos.x - toScale.x / 2;
  const toRight = toPos.x + toScale.x / 2;
  const startX = fromPos.x < toPos.x ? fromRight + 0.12 : fromLeft - 0.12;
  const endX = fromPos.x < toPos.x ? toLeft - 0.12 : toRight + 0.12;
  
  const start = new THREE.Vector3(startX, fromSurface + 0.1, routeZ);
  const end = new THREE.Vector3(endX, toSurface + 0.06, routeZ);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.max(0.8, Math.sqrt(dx * dx + dz * dz));
  const angle = Math.atan2(dz, dx);
  const dropHeight = Math.max(0.05, start.y - end.y);
  useFrame(({ clock }) => {
    const t = isRunning ? (clock.elapsedTime * 0.28) % 1 : 0.45;
    if (beadRef.current) beadRef.current.position.set(-length / 2 + length * t, 0.13, 0);
    if (arrowRef.current) arrowRef.current.position.set(length * 0.26, 0.17, 0);
  });
  return (
    <group position={[(start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2]} rotation={[0, -angle, 0]}>
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[length, 0.08, 0.22]} />
        <meshStandardMaterial color="#dce6ea" roughness={0.48} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.07, 0]}>
        <boxGeometry args={[length * 0.92, 0.035, 0.12]} />
        <meshStandardMaterial color="#54bed0" emissive="#278fc2" emissiveIntensity={0.18} transparent opacity={0.86} roughness={0.14} />
      </mesh>
      <mesh position={[0, 0.12, -0.14]}>
        <boxGeometry args={[length, 0.16, 0.035]} />
        <meshStandardMaterial color="#b8c6cb" roughness={0.52} metalness={0.14} />
      </mesh>
      <mesh position={[0, 0.12, 0.14]}>
        <boxGeometry args={[length, 0.16, 0.035]} />
        <meshStandardMaterial color="#b8c6cb" roughness={0.52} metalness={0.14} />
      </mesh>
      <mesh position={[length / 2 - 0.06, -dropHeight / 2, 0]}>
        <boxGeometry args={[0.06, dropHeight, 0.16]} />
        <meshStandardMaterial color="#54bed0" emissive="#278fc2" emissiveIntensity={0.2} transparent opacity={0.72} roughness={0.12} />
      </mesh>
      <mesh ref={beadRef}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#69d9eb" emissive="#278fc2" emissiveIntensity={0.36} roughness={0.18} />
      </mesh>
      <mesh ref={arrowRef} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.12, 0.3, 16]} />
        <meshStandardMaterial color="#278fc2" />
      </mesh>
    </group>
  );
}

function RealisticPumpModel({ position, rotation, color = "#2d8ec2" }: { position: THREE.Vector3; rotation?: [number, number, number]; color?: string }) {
  return (
    <group position={position} rotation={rotation || [0, 0, 0]}>
      <mesh position={[0.1, -0.15, 0]}>
        <boxGeometry args={[0.5, 0.04, 0.25]} />
        <meshStandardMaterial color="#4a5c65" roughness={0.8} />
      </mesh>
      <mesh position={[0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, 0.35, 16]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.2} />
      </mesh>
      <mesh position={[0.42, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 16]} />
        <meshStandardMaterial color="#31505d" roughness={0.5} />
      </mesh>
      <mesh position={[-0.05, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.1, 24]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.3} />
      </mesh>
      <mesh position={[-0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.1, 16]} />
        <meshStandardMaterial color="#8fa3ac" roughness={0.4} />
      </mesh>
      <mesh position={[-0.2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.09, 0.02, 16]} />
        <meshStandardMaterial color="#6a7a82" roughness={0.5} />
      </mesh>
      <mesh position={[-0.05, 0.12, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.1, 16]} />
        <meshStandardMaterial color="#8fa3ac" roughness={0.4} />
      </mesh>
      <mesh position={[-0.05, 0.18, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.02, 16]} />
        <meshStandardMaterial color="#6a7a82" roughness={0.5} />
      </mesh>
    </group>
  );
}

function InletHoldingPump({ from, to, isRunning }: { from?: TreatmentUnit; to?: TreatmentUnit; isRunning: boolean }) {
  if (!from || !to) return null;
  const fromPos = worldPosition(from);
  const toPos = worldPosition(to);
  const fromScale = unitScale(from);
  const toScale = unitScale(to);
  
  const suction = new THREE.Vector3(fromPos.x + fromScale.x * 0.4, 0.1, fromPos.z);
  const pump = new THREE.Vector3(fromPos.x + fromScale.x * 0.65, 0.1, fromPos.z);
  const inletTank = new THREE.Vector3(toPos.x - toScale.x * 0.45, 0.1, toPos.z);

  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          suction,
          pump,
          new THREE.Vector3(inletTank.x - 0.1, 0.1, inletTank.z),
          inletTank
        ],
        false,
        "catmullrom",
        0.02
      ),
    [suction.x, suction.z, pump.x, pump.z, inletTank.x, inletTank.z]
  );
  const beadRef = useRef<THREE.Mesh>(null);
  const arrowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = isRunning ? (clock.elapsedTime * 0.3) % 1 : 0.46;
    const point = curve.getPointAt(t);
    if (beadRef.current) beadRef.current.position.copy(point);
    if (arrowRef.current) {
      const arrowT = 0.66;
      const arrowTangent = curve.getTangentAt(Math.min(0.99, arrowT + 0.01));
      arrowRef.current.position.copy(curve.getPointAt(arrowT));
      arrowRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arrowTangent.normalize());
    }
  });

  return (
    <group>
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[curve, 42, 0.075, 12, false]} />
        <meshStandardMaterial color="#278fc2" roughness={0.28} metalness={0.32} />
      </mesh>
      <RealisticPumpModel position={pump} />
      <mesh ref={beadRef}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color="#69d9eb" emissive="#278fc2" emissiveIntensity={0.35} roughness={0.16} />
      </mesh>
      <mesh ref={arrowRef}>
        <coneGeometry args={[0.19, 0.44, 18]} />
        <meshStandardMaterial color="#278fc2" />
      </mesh>
      <PipeTerminal point={suction} color="#278fc2" sludge={false} />
      <PipeTerminal point={inletTank} color="#278fc2" sludge={false} />
      {!isRunning && (
        <Html position={[pump.x, pump.y + 0.6, pump.z]} center distanceFactor={14} occlude={false} zIndexRange={[80, 0]}>
          <div className="pipe-route-label">Raw Water Pump</div>
        </Html>
      )}
    </group>
  );
}

function PumpTransferPipe({ from, to, isRunning }: { from?: TreatmentUnit; to?: TreatmentUnit; isRunning: boolean }) {
  if (!from || !to) return null;
  const fromPos = worldPosition(from);
  const toPos = worldPosition(to);
  const fromScale = unitScale(from);
  const toScale = unitScale(to);
  const suction = new THREE.Vector3(fromPos.x + fromScale.x * 0.45, unitElevation(from.id) + 0.35, fromPos.z + fromScale.z * 0.46);
  const pump = new THREE.Vector3(fromPos.x + fromScale.x * 0.9, 0.36, fromPos.z + fromScale.z * 0.78);
  const rise = new THREE.Vector3(pump.x - 0.05, unitElevation(to.id) + unitWaterTopOffset(to.id) + 0.35, pump.z);
  const eqInlet = new THREE.Vector3(toPos.x - toScale.x * 0.5 - 0.09, unitElevation(to.id) + unitWaterTopOffset(to.id) + 0.18, toPos.z - toScale.z * 0.42);
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          suction,
          pump,
          rise,
          new THREE.Vector3(eqInlet.x - 0.35, eqInlet.y + 0.08, eqInlet.z),
          eqInlet
        ],
        false,
        "catmullrom",
        0.04
      ),
    [eqInlet.x, eqInlet.y, eqInlet.z, pump.x, pump.z, rise.x, rise.y, rise.z, suction.x, suction.y, suction.z]
  );
  const beadRef = useRef<THREE.Mesh>(null);
  const arrowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = isRunning ? (clock.elapsedTime * 0.26) % 1 : 0.46;
    const point = curve.getPointAt(t);
    if (beadRef.current) beadRef.current.position.copy(point);
    if (arrowRef.current) {
      const arrowT = 0.66;
      const arrowTangent = curve.getTangentAt(Math.min(0.99, arrowT + 0.01));
      arrowRef.current.position.copy(curve.getPointAt(arrowT));
      arrowRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arrowTangent.normalize());
    }
  });

  return (
    <group>
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[curve, 42, 0.075, 12, false]} />
        <meshStandardMaterial color="#278fc2" roughness={0.28} metalness={0.32} />
      </mesh>
      <RealisticPumpModel position={pump} />
      <mesh ref={beadRef}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color="#69d9eb" emissive="#278fc2" emissiveIntensity={0.35} roughness={0.16} />
      </mesh>
      <mesh ref={arrowRef}>
        <coneGeometry args={[0.19, 0.44, 18]} />
        <meshStandardMaterial color="#278fc2" />
      </mesh>
      <PipeTerminal point={suction} color="#278fc2" sludge={false} />
      <PipeTerminal point={eqInlet} color="#278fc2" sludge={false} />
      {!isRunning && (
        <Html position={[pump.x + 0.62, pump.y + 0.68, pump.z + 0.1]} center distanceFactor={14} occlude={false} zIndexRange={[80, 0]}>
          <div className="pipe-route-label">Transfer pump ยิงขึ้นบ่อ EQ</div>
        </Html>
      )}
    </group>
  );
}

function CoveredTransferPipe({ from, to }: { from?: TreatmentUnit; to?: TreatmentUnit }) {
  if (!from || !to) return null;
  const fromPos = worldPosition(from);
  const toPos = worldPosition(to);
  const start = new THREE.Vector3(fromPos.x - 0.34, 0.34, fromPos.z + 1.1);
  const end = new THREE.Vector3(toPos.x - 0.78, 0.32, toPos.z - 0.72);
  const sideRunX = toPos.x - 1.55;
  const curve = new THREE.CatmullRomCurve3(
    [
      start,
      new THREE.Vector3(sideRunX, 0.32, start.z + 0.35),
      new THREE.Vector3(sideRunX, 0.32, end.z),
      end
    ],
    false,
    "catmullrom",
    0.04
  );

  return (
    <group>
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[curve, 28, 0.065, 12, false]} />
        <meshStandardMaterial color="#8fa3ac" roughness={0.32} metalness={0.34} />
      </mesh>
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[curve, 28, 0.032, 10, false]} />
        <meshStandardMaterial color="#d9e3e7" roughness={0.24} metalness={0.46} />
      </mesh>
    </group>
  );
}

function TreatedDischargePipe({ from, isRunning }: { from?: TreatmentUnit; isRunning: boolean }) {
  if (!from) return null;
  const fromPos = worldPosition(from);
  const vesselR = 0.38;
  const carbonOutlet = new THREE.Vector3(fromPos.x - vesselR - 0.05, 0.15, fromPos.z);
  const discharge = new THREE.Vector3(fromPos.x - TREATED_DISCHARGE_OFFSET_M, 0.15, fromPos.z);
  const curve = useMemo(
    () => pipePolylineCurve([carbonOutlet, discharge]),
    [carbonOutlet.x, discharge.x, fromPos.z]
  );
  const beadRef = useRef<THREE.Mesh>(null);
  const arrowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = isRunning ? (clock.elapsedTime * 0.2) % 1 : 0.5;
    const point = curve.getPointAt(t);
    if (beadRef.current) beadRef.current.position.copy(point);
    if (arrowRef.current) {
      const arrowT = 0.72;
      const arrowTangent = curve.getTangentAt(Math.min(0.99, arrowT + 0.01));
      arrowRef.current.position.copy(curve.getPointAt(arrowT));
      arrowRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arrowTangent.normalize());
    }
  });

  return (
    <group>
      <mesh castShadow receiveShadow>
        <tubeGeometry args={[curve, 34, 0.075, 12, false]} />
        <meshStandardMaterial color="#278fc2" roughness={0.26} metalness={0.28} />
      </mesh>
      <mesh ref={beadRef}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshStandardMaterial color="#69d9eb" emissive="#278fc2" emissiveIntensity={0.36} />
      </mesh>
      <mesh ref={arrowRef}>
        <coneGeometry args={[0.2, 0.46, 18]} />
        <meshStandardMaterial color="#278fc2" />
      </mesh>
      <PipeTerminal point={carbonOutlet} color="#278fc2" sludge={false} />
      <PipeTerminal point={discharge} color="#278fc2" sludge={false} />
      <Html position={[discharge.x - 0.9, discharge.y + 0.42, discharge.z - 0.18]} center distanceFactor={14} occlude={false} zIndexRange={[80, 0]}>
        <div className="pipe-route-label">น้ำหลังบำบัดไปจุดปล่อย</div>
      </Html>
    </group>
  );
}

function PlantBase() {
  const gridLines = [];
  for (let i = -PAD_HALF_X; i <= PAD_HALF_X; i += 2) {
    const xGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(i, 0.006, -PAD_HALF_Z), new THREE.Vector3(i, 0.006, PAD_HALF_Z)]);
    gridLines.push(
      <line key={`x-${i}`}>
        <primitive object={xGeometry} attach="geometry" />
        <lineBasicMaterial attach="material" color="#a0adb4" transparent opacity={0.32} />
      </line>
    );
  }
  for (let i = -PAD_HALF_Z; i <= PAD_HALF_Z; i += 2) {
    const zGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-PAD_HALF_X, 0.007, i), new THREE.Vector3(PAD_HALF_X, 0.007, i)]);
    gridLines.push(
      <line key={`z-${i}`}>
        <primitive object={zGeometry} attach="geometry" />
        <lineBasicMaterial attach="material" color="#a0adb4" transparent opacity={0.32} />
      </line>
    );
  }

  return (
    <group>
      {/* Main concrete pad */}
      <mesh receiveShadow position={[0, -0.12, 0]}>
        <boxGeometry args={[PAD_WIDTH_M, 0.22, PAD_DEPTH_M]} />
        <meshStandardMaterial color="#8c969b" roughness={0.95} metalness={0.01} />
      </mesh>
      {/* Top surface layer with subtle texture variation */}
      <mesh receiveShadow position={[0, -0.005, 0]}>
        <boxGeometry args={[PAD_WIDTH_M - 0.5, 0.02, PAD_DEPTH_M - 0.5]} />
        <meshStandardMaterial color="#7a858b" roughness={0.92} metalness={0.01} />
      </mesh>
      {/* Concrete curb borders */}
      {[
        { pos: [0, 0.06, -PAD_HALF_Z] as [number, number, number], size: [PAD_WIDTH_M, 0.16, 0.42] as [number, number, number] },
        { pos: [0, 0.06, PAD_HALF_Z] as [number, number, number], size: [PAD_WIDTH_M, 0.16, 0.42] as [number, number, number] },
        { pos: [-PAD_HALF_X, 0.06, 0] as [number, number, number], size: [0.42, 0.16, PAD_DEPTH_M + 0.4] as [number, number, number] },
        { pos: [PAD_HALF_X, 0.06, 0] as [number, number, number], size: [0.42, 0.16, PAD_DEPTH_M + 0.4] as [number, number, number] }
      ].map((curb, i) => (
        <mesh key={i} receiveShadow castShadow position={curb.pos}>
          <boxGeometry args={curb.size} />
          <meshStandardMaterial color="#6b7378" roughness={0.88} metalness={0.02} />
        </mesh>
      ))}
      {/* Expansion joints (dark lines in concrete) */}
      {[-21, -14, -7, 0, 7, 14, 21].map((x) => (
        <mesh key={`ej-x-${x}`} position={[x, 0.003, 0]}>
          <boxGeometry args={[0.03, 0.01, PAD_DEPTH_M]} />
          <meshStandardMaterial color="#8a9298" roughness={0.9} />
        </mesh>
      ))}
      {[-12, -6, 0, 6, 12].map((z) => (
        <mesh key={`ej-z-${z}`} position={[0, 0.003, z]}>
          <boxGeometry args={[PAD_WIDTH_M, 0.01, 0.03]} />
          <meshStandardMaterial color="#8a9298" roughness={0.9} />
        </mesh>
      ))}
      {/* Drain channels */}
      {[-12.5, 12.5].map((z) => (
        <mesh key={`drain-${z}`} receiveShadow position={[0, -0.02, z]}>
          <boxGeometry args={[PAD_WIDTH_M - 2, 0.06, 0.18]} />
          <meshStandardMaterial color={CONCRETE_DARK} roughness={0.85} metalness={0.04} />
        </mesh>
      ))}
      {gridLines}

      {/* === CONCRETE FLOOR STAINS & WEAR === */}
      {/* Oil stains (dark patches near equipment) */}
      {[
        { pos: [-8, 0.002, 2] as [number, number, number], size: [1.2, 0.005, 0.8] as [number, number, number], opacity: 0.12 },
        { pos: [-5, 0.002, -3] as [number, number, number], size: [0.6, 0.005, 0.9] as [number, number, number], opacity: 0.1 },
        { pos: [4, 0.002, 5] as [number, number, number], size: [0.9, 0.005, 0.7] as [number, number, number], opacity: 0.09 },
        { pos: [10, 0.002, -2] as [number, number, number], size: [1.4, 0.005, 0.6] as [number, number, number], opacity: 0.11 },
        { pos: [-2, 0.002, 6] as [number, number, number], size: [0.8, 0.005, 1.0] as [number, number, number], opacity: 0.08 },
      ].map((stain, i) => (
        <mesh key={`oil-${i}`} position={stain.pos} rotation={[-Math.PI / 2, 0, i * 0.7]}>
          <circleGeometry args={[Math.max(stain.size[0], stain.size[2]) * 0.5, 12]} />
          <meshStandardMaterial color="#3a3832" transparent opacity={stain.opacity} roughness={0.98} />
        </mesh>
      ))}

      {/* Rust stain streaks (from metal equipment dripping) */}
      {[
        [-6, 0.002, -5.5], [2, 0.002, -1], [8, 0.002, 3], [-10, 0.002, 4], [6, 0.002, -6]
      ].map(([x, y, z], i) => (
        <mesh key={`rust-${i}`} position={[x, y, z]} rotation={[-Math.PI / 2, 0, i * 1.2]}>
          <planeGeometry args={[0.3 + i * 0.08, 0.8 + i * 0.1]} />
          <meshStandardMaterial color="#6a4a30" transparent opacity={0.06 + i * 0.01} roughness={0.99} />
        </mesh>
      ))}

      {/* Water puddle marks (dried) */}
      {[
        [3, 0.002, 0], [-4, 0.002, 3], [0, 0.002, -5], [7, 0.002, -3]
      ].map(([x, y, z], i) => (
        <mesh key={`puddle-${i}`} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.4 + i * 0.15, 16]} />
          <meshStandardMaterial color="#707880" transparent opacity={0.06} roughness={0.7} metalness={0.05} />
        </mesh>
      ))}

      {/* Concrete wear patches (high-traffic areas) */}
      {[
        { pos: [0, 0.002, 7.5] as [number, number, number], size: [6, 0.004, 1.8] as [number, number, number] },
        { pos: [-8, 0.002, 0] as [number, number, number], size: [3, 0.004, 2.5] as [number, number, number] },
      ].map((wear, i) => (
        <mesh key={`wear-${i}`} position={wear.pos}>
          <boxGeometry args={wear.size} />
          <meshStandardMaterial color="#727a80" transparent opacity={0.08} roughness={0.98} />
        </mesh>
      ))}

      {/* Dirt border around concrete pad */}
      <mesh receiveShadow position={[0, -0.18, 0]}>
        <boxGeometry args={[PAD_WIDTH_M + 4, 0.06, PAD_DEPTH_M + 4]} />
        <meshStandardMaterial color="#7a7060" roughness={0.96} metalness={0.0} />
      </mesh>

      {/* Perimeter fence posts — all four sides */}
      {[-24, -18, -12, -6, 0, 6, 12, 18, 24].map((x) => (
        <group key={`fence-back-${x}`}>
          <mesh castShadow position={[x, 0.5, -PAD_HALF_Z - 1.5]}>
            <cylinderGeometry args={[0.04, 0.04, 1.2, 8]} />
            <meshStandardMaterial color={GALVANIZED_STEEL} roughness={0.45} metalness={0.4} />
          </mesh>
        </group>
      ))}
      {/* Side fence posts */}
      {[-15, -10, -5, 0, 5, 10, 15].map((z) => (
        <group key={`fence-left-${z}`}>
          <mesh castShadow position={[-PAD_HALF_X - 1.2, 0.5, z]}>
            <cylinderGeometry args={[0.04, 0.04, 1.2, 8]} />
            <meshStandardMaterial color={GALVANIZED_STEEL} roughness={0.45} metalness={0.4} />
          </mesh>
          <mesh castShadow position={[PAD_HALF_X + 1.2, 0.5, z]}>
            <cylinderGeometry args={[0.04, 0.04, 1.2, 8]} />
            <meshStandardMaterial color={GALVANIZED_STEEL} roughness={0.45} metalness={0.4} />
          </mesh>
        </group>
      ))}
      {/* Fence wire (back perimeter) */}
      <mesh position={[0, 0.7, -PAD_HALF_Z - 1.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, PAD_WIDTH_M, 6]} />
        <meshStandardMaterial color={GALVANIZED_STEEL} roughness={0.4} metalness={0.45} />
      </mesh>
      <mesh position={[0, 0.35, -PAD_HALF_Z - 1.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.01, 0.01, PAD_WIDTH_M, 6]} />
        <meshStandardMaterial color={GALVANIZED_STEEL} roughness={0.4} metalness={0.45} />
      </mesh>
      {/* Side fence wires */}
      {[-PAD_HALF_X - 1.2, PAD_HALF_X + 1.2].map((x) => (
        <group key={`side-wire-${x}`}>
          <mesh position={[x, 0.7, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.012, 0.012, PAD_DEPTH_M + 3, 6]} />
            <meshStandardMaterial color={GALVANIZED_STEEL} roughness={0.4} metalness={0.45} />
          </mesh>
          <mesh position={[x, 0.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.01, 0.01, PAD_DEPTH_M + 3, 6]} />
            <meshStandardMaterial color={GALVANIZED_STEEL} roughness={0.4} metalness={0.45} />
          </mesh>
        </group>
      ))}

      {/* ===== LANDSCAPING TREES ===== */}
      {/* Back perimeter trees */}
      {[-27, -21, -15, -9, -3, 3, 9, 15, 21, 27].map((x) => (
        <LandscapeTree key={`tree-back-${x}`} position={[x, -0.2, -PAD_HALF_Z - 4]} scale={0.8 + Math.abs(x % 3) * 0.15} />
      ))}
      {/* Left side trees */}
      {[-14, -8, -2, 4, 10, 16].map((z) => (
        <LandscapeTree key={`tree-left-${z}`} position={[-PAD_HALF_X - 4, -0.2, z]} scale={0.7 + Math.abs(z % 2) * 0.2} />
      ))}
      {/* Right side trees */}
      {[-13, -7, -1, 5, 11, 17].map((z) => (
        <LandscapeTree key={`tree-right-${z}`} position={[PAD_HALF_X + 4, -0.2, z]} scale={0.75 + Math.abs(z % 3) * 0.12} />
      ))}
      {/* Front entrance decorative trees */}
      <LandscapeTree position={[-PAD_HALF_X + 2, -0.2, PAD_HALF_Z + 7]} scale={1.0} />
      <LandscapeTree position={[PAD_HALF_X - 2, -0.2, PAD_HALF_Z + 7]} scale={0.95} />

      {/* ===== HEDGEROWS along fence ===== */}
      <mesh receiveShadow position={[0, 0.08, -PAD_HALF_Z - 2.2]}>
        <boxGeometry args={[PAD_WIDTH_M - 2, 0.45, 0.6]} />
        <meshStandardMaterial color="#354a28" roughness={0.96} metalness={0.0} />
      </mesh>
      <mesh receiveShadow position={[0, 0.18, -PAD_HALF_Z - 2.2]}>
        <boxGeometry args={[PAD_WIDTH_M - 4, 0.18, 0.44]} />
        <meshStandardMaterial color="#3e5830" roughness={0.97} metalness={0.0} />
      </mesh>

      {/* ===== COMPANY FLAGPOLE ===== */}
      <CompanyFlagpole position={[-PAD_HALF_X + 2.4, -0.1, PAD_HALF_Z + 3.5]} />
    </group>
  );
}

function RealWorldSiteLayer({
  unitMap,
  simulation,
  isRunning
}: {
  unitMap: Record<string, TreatmentUnit>;
  simulation: SimulationResult;
  isRunning: boolean;
}) {
  const aeration = unitMap.aeration ? worldPosition(unitMap.aeration) : new THREE.Vector3(5.6, 0, -0.6);
  const carbon = unitMap["carbon-filter"] ? worldPosition(unitMap["carbon-filter"]) : new THREE.Vector3(9.4, 0, 1.2);
  const sludgeStorage = unitMap["sludge-storage"] ? worldPosition(unitMap["sludge-storage"]) : new THREE.Vector3(-11, 0, 1.6);
  const alarmCount = Object.values(simulation.unitRuntime).filter((runtime) => runtime.alarm).length;

  return (
    <group>
      {/* Blowers are now integrated inside AerationModel (2 × BL-01) */}
      <SludgeTruckBay position={[sludgeStorage.x - 1.25, 0.04, sludgeStorage.z - 1.1]} />
      <EmergencyStation position={[carbon.x + 1.9, 0.04, carbon.z + 1.65]} />
      {[
        [-27, PAD_HALF_Z + 1.15],
        [-26.2, PAD_HALF_Z + 1.15],
        [-25.4, PAD_HALF_Z + 1.15],
        [26.2, PAD_HALF_Z + 1.15],
        [25.4, PAD_HALF_Z + 1.15]
      ].map(([x, z]) => (
        <SafetyBollard key={`${x}-${z}`} position={[x, 0.02, z]} />
      ))}
    </group>
  );
}

function IndustrialBuilding({
  position,
  size,
  label,
  color,
  accent
}: {
  position: [number, number, number];
  size: [number, number, number];
  label: string;
  color: string;
  accent: string;
}) {
  return (
    <group position={position}>
      <mesh receiveShadow castShadow position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.72} metalness={0.08} />
      </mesh>
      <mesh receiveShadow castShadow position={[0, size[1] + 0.12, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.34, 1, 1]}>
        <cylinderGeometry args={[size[2] * 0.62, size[2] * 0.62, size[0] * 1.08, 3]} />
        <meshStandardMaterial color="#536772" roughness={0.48} metalness={0.24} />
      </mesh>
      {[-0.35, 0, 0.35].map((x) => (
        <mesh key={x} position={[x * size[0], size[1] * 0.62, -size[2] * 0.52]}>
          <boxGeometry args={[0.24, 0.22, 0.025]} />
          <meshStandardMaterial color="#88c9df" emissive="#2a82c9" emissiveIntensity={0.08} roughness={0.22} />
        </mesh>
      ))}
      <mesh position={[size[0] * 0.41, size[1] * 0.36, -size[2] * 0.52]}>
        <boxGeometry args={[0.36, 0.58, 0.035]} />
        <meshStandardMaterial color="#3a5058" roughness={0.44} metalness={0.22} />
      </mesh>
      <Html position={[0, size[1] + 0.48, -size[2] * 0.52]} center distanceFactor={15} zIndexRange={[80, 0]}>
        <div className="site-equipment-label site-equipment-label--blue">
          <strong>{label}</strong>
          <span>PLC, VFD, alarms</span>
        </div>
      </Html>
      <mesh position={[-size[0] * 0.46, size[1] * 0.78, -size[2] * 0.54]}>
        <boxGeometry args={[0.18, 0.42, 0.04]} />
        <meshStandardMaterial color={accent} roughness={0.34} metalness={0.18} />
      </mesh>
    </group>
  );
}

function BlowerGallery({ position, isRunning, alarm }: { position: [number, number, number]; isRunning: boolean; alarm?: boolean }) {
  const fanRefs = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    fanRefs.current.forEach((fan, index) => {
      if (fan && isRunning && !alarm) fan.rotation.z = clock.elapsedTime * (5.5 + index);
    });
  });
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[2.2, 0.1, 0.82]} />
        <meshStandardMaterial color="#c8d2d6" roughness={0.6} metalness={0.12} />
      </mesh>
      {[-0.38, 0.38].map((x, index) => (
        <group key={x} position={[x, 0.38, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.5, 0.42, 0.42]} />
            <meshStandardMaterial color={alarm ? "#78413d" : "#264552"} roughness={0.42} metalness={0.28} />
          </mesh>
          <mesh position={[0, 0, -0.23]} ref={(node) => { if (node) fanRefs.current[index] = node; }}>
            <circleGeometry args={[0.16, 28]} />
            <meshStandardMaterial color={alarm ? "#d7463f" : "#87d6e8"} emissive={alarm ? "#7a1c18" : "#278fc2"} emissiveIntensity={0.2} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.31, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.28, 20]} />
            <meshStandardMaterial color="#239b62" roughness={0.38} metalness={0.22} />
          </mesh>
        </group>
      ))}
      <mesh position={[0.98, 0.46, 0.34]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.055, 0.055, 2.25, 14]} />
        <meshStandardMaterial color="#5d727c" roughness={0.34} metalness={0.34} />
      </mesh>
      <Html position={[0, 1.05, -0.32]} center distanceFactor={14} zIndexRange={[80, 0]}>
        <div className={alarm ? "site-equipment-label site-equipment-label--alarm" : "site-equipment-label"}>
          <strong>Blower gallery</strong>
          <span>{alarm ? "low air alarm" : "10 HP × 2 (duty/standby)"}</span>
        </div>
      </Html>
    </group>
  );
}

function SludgeTruckBay({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh receiveShadow position={[0, 0.035, 0]}>
        <boxGeometry args={[2.25, 0.07, 1.2]} />
        <meshStandardMaterial color="#555b5f" roughness={0.82} metalness={0.03} />
      </mesh>
      <mesh castShadow position={[-0.24, 0.25, 0]}>
        <boxGeometry args={[0.86, 0.36, 0.5]} />
        <meshStandardMaterial color="#d9b45b" roughness={0.48} metalness={0.1} />
      </mesh>
      <mesh castShadow position={[0.42, 0.31, 0]}>
        <boxGeometry args={[0.58, 0.5, 0.56]} />
        <meshStandardMaterial color="#335462" roughness={0.42} metalness={0.2} />
      </mesh>
      {[-0.62, -0.08, 0.28, 0.68].map((x) => (
        <mesh key={x} position={[x, 0.06, -0.31]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 0.06, 18]} />
          <meshStandardMaterial color="#24282a" roughness={0.42} metalness={0.2} />
        </mesh>
      ))}
      <Html position={[0, 0.9, -0.42]} center distanceFactor={14} zIndexRange={[80, 0]}>
        <div className="site-equipment-label site-equipment-label--sludge">
          <strong>Sludge bay</strong>
          <span>covered cake loading</span>
        </div>
      </Html>
    </group>
  );
}

function CableTray({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.max(0.3, Math.sqrt(dx * dx + dz * dz));
  const angle = Math.atan2(dz, dx);
  return (
    <group position={[(start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2]} rotation={[0, -angle, 0]}>
      <mesh castShadow>
        <boxGeometry args={[length, 0.08, 0.18]} />
        <meshStandardMaterial color="#8a9aa2" roughness={0.44} metalness={0.32} />
      </mesh>
      {Array.from({ length: 12 }).map((_, index) => (
        <mesh key={index} position={[(-0.46 + index * 0.085) * length, 0.06, 0]}>
          <boxGeometry args={[0.025, 0.05, 0.22]} />
          <meshStandardMaterial color="#c1cbd0" roughness={0.46} metalness={0.28} />
        </mesh>
      ))}
    </group>
  );
}

function EmergencyStation({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.82, 10]} />
        <meshStandardMaterial color="#209b62" roughness={0.34} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[0, 0.86, 0]}>
        <sphereGeometry args={[0.14, 16, 12]} />
        <meshStandardMaterial color="#209b62" roughness={0.32} metalness={0.18} />
      </mesh>
      <mesh position={[0, 0.22, -0.05]}>
        <boxGeometry args={[0.34, 0.12, 0.08]} />
        <meshStandardMaterial color="#f1f5f6" roughness={0.44} metalness={0.06} />
      </mesh>
      <Html position={[0, 1.2, -0.14]} center distanceFactor={13} zIndexRange={[70, 0]}>
        <div className="site-mini-label site-mini-label--green">shower / eyewash</div>
      </Html>
    </group>
  );
}

function YardLight({ position, alarm }: { position: [number, number, number]; alarm?: boolean }) {
  const color = alarm ? "#f08d42" : "#f3f0d2";
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 1.6, 8]} />
        <meshStandardMaterial color={GALVANIZED_STEEL} roughness={0.38} metalness={0.42} />
      </mesh>
      <mesh position={[0.18, 1.55, 0]}>
        <boxGeometry args={[0.34, 0.1, 0.18]} />
        <meshStandardMaterial color="#cbd6da" roughness={0.36} metalness={0.22} />
      </mesh>
      <pointLight position={[0.18, 1.48, 0]} intensity={alarm ? 1.8 : 0.7} distance={5} color={color} />
      <mesh position={[0.18, 1.46, 0]}>
        <sphereGeometry args={[0.06, 12, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={alarm ? 1.0 : 0.35} />
      </mesh>
    </group>
  );
}

function SafetyBollard({ position }: { position: [number, number, number] }) {
  return (
    <mesh castShadow position={[position[0], position[1] + 0.24, position[2]]}>
      <cylinderGeometry args={[0.06, 0.06, 0.48, 12]} />
      <meshStandardMaterial color={SAFETY_YELLOW} roughness={0.42} metalness={0.18} />
    </mesh>
  );
}

function ContactShadowPlane() {
  return (
    <group>
      {/* Primary shadow receiver */}
      <mesh receiveShadow position={[0, -0.23, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[120, 90]} />
        <shadowMaterial transparent opacity={0.38} />
      </mesh>
      {/* Ambient occlusion darkening around concrete pad edges */}
      {[
        { pos: [PAD_HALF_X, -0.17, 0] as [number, number, number], size: [0.6, 0.01, PAD_DEPTH_M] as [number, number, number] },
        { pos: [-PAD_HALF_X, -0.17, 0] as [number, number, number], size: [0.6, 0.01, PAD_DEPTH_M] as [number, number, number] },
        { pos: [0, -0.17, PAD_HALF_Z] as [number, number, number], size: [PAD_WIDTH_M, 0.01, 0.6] as [number, number, number] },
        { pos: [0, -0.17, -PAD_HALF_Z] as [number, number, number], size: [PAD_WIDTH_M, 0.01, 0.6] as [number, number, number] }
      ].map((ao, i) => (
        <mesh key={`ao-${i}`} position={ao.pos}>
          <boxGeometry args={ao.size} />
          <meshStandardMaterial color="#000000" transparent opacity={0.08} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/* ===== NEW LANDSCAPE COMPONENTS ===== */

function LandscapeTree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const trunkHeight = 1.2 * scale;
  const crownRadius = 0.9 * scale;
  const crownY = trunkHeight + crownRadius * 0.6;
  return (
    <group position={position}>
      {/* Trunk */}
      <mesh castShadow position={[0, trunkHeight / 2, 0]}>
        <cylinderGeometry args={[0.06 * scale, 0.1 * scale, trunkHeight, 8]} />
        <meshStandardMaterial color="#5a3e28" roughness={0.9} metalness={0.0} />
      </mesh>
      {/* Main crown */}
      <mesh castShadow receiveShadow position={[0, crownY, 0]}>
        <sphereGeometry args={[crownRadius, 12, 10]} />
        <meshStandardMaterial color="#3a5a28" roughness={0.94} metalness={0.0} />
      </mesh>
      {/* Upper crown highlight */}
      <mesh castShadow position={[0.1 * scale, crownY + crownRadius * 0.35, 0.05 * scale]}>
        <sphereGeometry args={[crownRadius * 0.65, 10, 8]} />
        <meshStandardMaterial color="#4a6a38" roughness={0.92} metalness={0.0} />
      </mesh>
      {/* Side crown volume */}
      <mesh castShadow position={[-0.15 * scale, crownY - crownRadius * 0.15, 0.12 * scale]}>
        <sphereGeometry args={[crownRadius * 0.55, 10, 8]} />
        <meshStandardMaterial color="#2e4a20" roughness={0.95} metalness={0.0} />
      </mesh>
    </group>
  );
}

function GuardBooth({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Booth body */}
      <mesh castShadow receiveShadow position={[0, 0.65, 0]}>
        <boxGeometry args={[1.2, 1.3, 1.0]} />
        <meshStandardMaterial color="#e8e2d8" roughness={0.72} metalness={0.05} />
      </mesh>
      {/* Roof */}
      <mesh castShadow receiveShadow position={[0, 1.38, 0]}>
        <boxGeometry args={[1.5, 0.08, 1.3]} />
        <meshStandardMaterial color="#3a5060" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Window */}
      <mesh position={[0, 0.82, -0.52]}>
        <boxGeometry args={[0.72, 0.48, 0.03]} />
        <meshStandardMaterial color="#8ac8e0" emissive="#4090b0" emissiveIntensity={0.1} roughness={0.12} metalness={0.3} />
      </mesh>
      {/* Door */}
      <mesh position={[0.55, 0.52, 0]}>
        <boxGeometry args={[0.04, 0.94, 0.52]} />
        <meshStandardMaterial color="#3a5a68" roughness={0.55} metalness={0.15} />
      </mesh>
      {/* Gate barrier arm */}
      <mesh castShadow position={[1.6, 1.0, 0]} rotation={[0, 0, 0.05]}>
        <boxGeometry args={[2.8, 0.06, 0.06]} />
        <meshStandardMaterial color="#e84040" roughness={0.5} metalness={0.1} />
      </mesh>
      {/* Barrier pivot post */}
      <mesh castShadow position={[0.2, 0.6, 0.45]}>
        <cylinderGeometry args={[0.04, 0.04, 1.0, 8]} />
        <meshStandardMaterial color="#e84040" roughness={0.5} metalness={0.15} />
      </mesh>
      {/* Gate sign */}
      <Html position={[0, 1.6, -0.52]} center distanceFactor={15} zIndexRange={[80, 0]}>
        <div className="site-equipment-label site-equipment-label--blue" style={{ fontSize: "9px" }}>
          <strong>Guard / ป้อมยาม</strong>
        </div>
      </Html>
    </group>
  );
}

function CompanyFlagpole({ position }: { position: [number, number, number] }) {
  const flagRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (flagRef.current) {
      flagRef.current.rotation.y = Math.sin(clock.elapsedTime * 1.5) * 0.12;
      flagRef.current.position.x = 0.28 + Math.sin(clock.elapsedTime * 2.0) * 0.03;
    }
  });
  return (
    <group position={position}>
      {/* Pole */}
      <mesh castShadow position={[0, 2.0, 0]}>
        <cylinderGeometry args={[0.03, 0.05, 4.0, 10]} />
        <meshStandardMaterial color="#c0c8cc" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Pole top ball */}
      <mesh position={[0, 4.05, 0]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial color="#d4a830" roughness={0.25} metalness={0.7} />
      </mesh>
      {/* Base */}
      <mesh receiveShadow position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.2, 0.25, 0.16, 12]} />
        <meshStandardMaterial color="#808890" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Flag (animated) */}
      <mesh ref={flagRef} castShadow position={[0.28, 3.55, 0]}>
        <boxGeometry args={[0.55, 0.38, 0.01]} />
        <meshStandardMaterial color="#1a5ca8" emissive="#0a3468" emissiveIntensity={0.08} roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Flag stripe */}
      <mesh position={[0.28, 3.42, -0.012]}>
        <boxGeometry args={[0.5, 0.08, 0.005]} />
        <meshStandardMaterial color="#d4a830" roughness={0.5} />
      </mesh>
      <Html position={[0, 4.5, 0]} center distanceFactor={18} zIndexRange={[80, 0]}>
        <div className="site-equipment-label" style={{ fontSize: "8px", background: "rgba(26,92,168,0.85)", color: "#fff" }}>
          <strong>Golden Thread</strong>
        </div>
      </Html>
    </group>
  );
}

function UnitModel({
  unit,
  selected,
  alarm,
  isRunning,
  onSelect
}: {
  unit: TreatmentUnit;
  selected: boolean;
  alarm: boolean;
  isRunning: boolean;
  onSelect: () => void;
}) {
  const position = worldPosition(unit);
  const scale = unitScale(unit);
  const colors = kindColors[unit.kind];
  const height = unitHeight(unit);
  const elevation = unitElevation(unit.id);
  const commonProps = { scale, height, colors, selected, alarm };
  const physicalSpec = physicalSpecs[unit.id];
  const overflowLabel = overflowLevelLabel(unit.id);

  return (
    <group position={[position.x, elevation, position.z]}>
      {elevation > 0.02 && unit.id !== "inlet" && unit.id !== "sand-filter" && unit.id !== "carbon-filter" && <ElevationPedestal scale={scale} height={elevation} />}
      <group onClick={(event) => { event.stopPropagation(); onSelect(); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
        {unit.id === "inlet" ? (
          <InletModel {...commonProps} />
        ) : unit.id === "holding-tank" ? (
          <HoldingTankModel {...commonProps} />
        ) : unit.id === "equalization" ? (
          <EqualizationPhModel {...commonProps} />
        ) : unit.id === "primary-clarifier" ? (
          <PrimaryClarifierModel {...commonProps} />
        ) : unit.id === "aeration" ? (
          <AerationModel {...commonProps} />
        ) : unit.id === "secondary-clarifier" ? (
          <SecondaryClarifierModel {...commonProps} />
        ) : unit.id === "carbon-filter" || unit.id === "sand-filter" ? (
          <FilterSkid
            {...commonProps}
            mediaColor="#b89245"
            vesselColor="#d8b66c"
          />
        ) : unit.id === "sludge-press" ? (
          <FilterPressModel {...commonProps} />
        ) : unit.id === "sludge-holding" ? (
          <SiloModel radius={0.35} height={1.8} colors={colors} selected={selected} alarm={alarm} />
        ) : unit.id === "sludge-storage" ? (
          <SludgeStorageModel {...commonProps} />
        ) : (
          <Basin scale={scale} height={height} colors={colors} selected={selected} alarm={alarm} />
        )}
      </group>
      {alarm && <AlarmBeacon position={[scale.x * 0.52, height + 0.85, -scale.z * 0.2]} />}
      <Html position={[0, height + 0.72, 0]} center distanceFactor={13} occlude={false} zIndexRange={[80, 0]}>
        <button className={`scene-label ${selected ? "scene-label--selected" : ""}`} onClick={onSelect}>
          <span className="scene-label__badge">{unitDisplayBadge(unit)}</span>
          <strong>{unit.name}</strong>
          <span>{unit.thaiName}</span>
          {physicalSpec && (
            <>
              <span className="scene-label__spec">{physicalSpec.label}</span>
              <span className="scene-label__spec">
                {physicalSpec.footprintM2 ? `${physicalSpec.footprintM2} m²` : "พื้นที่ตามปริมาตรจริง"}
                {physicalSpec.depthM ? ` · depth ${physicalSpec.depthM} m` : ""}
              </span>
            </>
          )}
          {overflowLabel && <em className="scene-label__overflow">{overflowLabel}</em>}
        </button>
      </Html>
    </group>
  );
}

function ElevationPedestal({ scale, height }: { scale: { x: number; z: number }; height: number }) {
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, -height / 2, 0]}>
        <boxGeometry args={[scale.x * 1.08, height, scale.z * 1.06]} />
        <meshStandardMaterial color="#c8d0d4" roughness={0.82} metalness={0.02} envMapIntensity={0.15} />
      </mesh>
      {/* Base footing */}
      <mesh receiveShadow position={[0, -height + 0.02, 0]}>
        <boxGeometry args={[scale.x * 1.22, 0.04, scale.z * 1.2]} />
        <meshStandardMaterial color="#b8c0c6" roughness={0.85} metalness={0.02} />
      </mesh>
      {/* AO darkening at base joint */}
      <mesh position={[0, -height + 0.005, 0]}>
        <boxGeometry args={[scale.x * 1.24, 0.01, scale.z * 1.22]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.06} roughness={1} />
      </mesh>
    </group>
  );
}

function Basin({
  scale,
  height,
  colors,
  selected,
  alarm,
  showMixer = true,
  showServiceBridge = true
}: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
  showMixer?: boolean;
  showServiceBridge?: boolean;
}) {
  const waterRef = useRef<THREE.Mesh>(null);
  const foamRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (waterRef.current) waterRef.current.position.y = height + 0.015 + Math.sin(clock.elapsedTime * 1.8) * 0.018;
    if (foamRef.current) foamRef.current.position.y = height + 0.06 + Math.sin(clock.elapsedTime * 2.2 + 0.5) * 0.008;
  });
  const wall = Math.min(0.34, Math.max(0.22, Math.min(scale.x, scale.z) * 0.035));
  const foundationX = scale.x + 0.8;
  const foundationZ = scale.z + 0.8;
  const innerX = Math.max(0.7, scale.x - wall * 2 - 0.18);
  const innerZ = Math.max(0.7, scale.z - wall * 2 - 0.18);
  const waterX = Math.max(0.62, innerX - 0.08);
  const waterZ = Math.max(0.62, innerZ - 0.08);
  const innerFaceX = scale.x / 2 - wall - 0.012;
  const innerFaceZ = scale.z / 2 - wall - 0.012;
  const wallCenterX = scale.x / 2 - wall / 2;
  const wallCenterZ = scale.z / 2 - wall / 2;
  const copingWidth = wall + 0.18;
  const railY = height + 0.48;
  const serviceBridgeLength = Math.max(1.6, Math.min(scale.x - wall * 1.2, waterX + wall * 1.35));
  const wallColor = colors.body;
  const copingColor = selected ? colors.accent : alarm ? "#d7463f" : CONCRETE_LIGHT;

  return (
    <group>
      {/* Foundation slab with chamfered edge */}
      <SoftBox position={[0, 0.04, 0]} args={[foundationX, 0.1, foundationZ]} radius={0.055}>
        <meshStandardMaterial color={CONCRETE_DARK} roughness={0.95} metalness={0.01} />
      </SoftBox>
      {/* Foundation chamfer strip */}
      <mesh receiveShadow position={[0, 0.095, foundationZ / 2 - 0.06]}>
        <boxGeometry args={[foundationX - 0.18, 0.015, 0.04]} />
        <meshStandardMaterial color="#9aa4a8" roughness={0.88} />
      </mesh>

      {/* Inner floor with slight slope toward drain */}
      <SoftBox castShadow={false} receiveShadow position={[0, 0.1, 0]} args={[innerX, 0.02, innerZ]} radius={0.025}>
        <meshStandardMaterial color={CONCRETE_DARK} roughness={0.92} metalness={0.01} />
      </SoftBox>
      {/* Floor drain grate */}
      <mesh position={[0, 0.115, 0]}>
        <boxGeometry args={[0.12, 0.008, 0.12]} />
        <meshStandardMaterial color="#3a4448" roughness={0.5} metalness={0.4} />
      </mesh>

      {/* Painted steel walls - front */}
      <SoftBox position={[0, height / 2 + 0.06, -wallCenterZ]} args={[scale.x, height * 1.02, wall]} radius={0.03}>
        <meshStandardMaterial color={wallColor} roughness={0.55} metalness={0.15} />
      </SoftBox>
      {/* Painted steel walls - back */}
      <SoftBox position={[0, height / 2 + 0.06, wallCenterZ]} args={[scale.x, height * 1.02, wall]} radius={0.03}>
        <meshStandardMaterial color={wallColor} roughness={0.55} metalness={0.15} />
      </SoftBox>
      {/* Painted steel walls - left */}
      <SoftBox position={[-wallCenterX, height / 2 + 0.06, 0]} args={[wall, height * 1.02, scale.z]} radius={0.03}>
        <meshStandardMaterial color={wallColor} roughness={0.68} metalness={0.08} envMapIntensity={0.2} />
      </SoftBox>
      {/* Painted steel walls - right */}
      <SoftBox position={[wallCenterX, height / 2 + 0.06, 0]} args={[wall, height * 1.02, scale.z]} radius={0.03}>
        <meshStandardMaterial color={wallColor} roughness={0.65} metalness={0.09} envMapIntensity={0.2} />
      </SoftBox>

      {/* Waterline algae/stain marks on inner walls */}
      {[
        { pos: [0, height * 0.88, -innerFaceZ] as [number, number, number], size: [innerX, height * 0.06, 0.028] as [number, number, number] },
        { pos: [0, height * 0.88, innerFaceZ] as [number, number, number], size: [innerX, height * 0.06, 0.028] as [number, number, number] },
        { pos: [-innerFaceX, height * 0.88, 0] as [number, number, number], size: [0.028, height * 0.06, innerZ] as [number, number, number] },
        { pos: [innerFaceX, height * 0.88, 0] as [number, number, number], size: [0.028, height * 0.06, innerZ] as [number, number, number] }
      ].map((mark, i) => (
        <mesh key={`waterline-${i}`} position={mark.pos}>
          <boxGeometry args={mark.size} />
          <meshStandardMaterial color="#3a5848" roughness={0.96} metalness={0.0} transparent opacity={0.4} />
        </mesh>
      ))}

      {/* Inner wall darker faces */}
      {[
        { pos: [0, height * 0.5, -innerFaceZ] as [number, number, number], size: [innerX, height * 0.78, 0.025] as [number, number, number] },
        { pos: [0, height * 0.5, innerFaceZ] as [number, number, number], size: [innerX, height * 0.78, 0.025] as [number, number, number] },
        { pos: [-innerFaceX, height * 0.5, 0] as [number, number, number], size: [0.025, height * 0.78, innerZ] as [number, number, number] },
        { pos: [innerFaceX, height * 0.5, 0] as [number, number, number], size: [0.025, height * 0.78, innerZ] as [number, number, number] }
      ].map((face, index) => (
        <mesh key={`inner-face-${index}`} position={face.pos}>
          <boxGeometry args={face.size} />
          <meshStandardMaterial color="#4a6068" roughness={0.92} metalness={0.01} transparent opacity={0.35} />
        </mesh>
      ))}

      {/* Weathering stain streaks on exterior walls */}
      {[-0.2, 0.15, 0.35].map((x) => (
        <mesh key={`stain-f-${x}`} position={[x * scale.x, height * 0.35, -scale.z / 2 - 0.03]}>
          <boxGeometry args={[0.06, height * 0.55, 0.005]} />
          <meshStandardMaterial color="#6a7a72" roughness={0.98} transparent opacity={0.18} />
        </mesh>
      ))}

      {/* Anchor bolts on exterior walls */}
      {[-0.38, -0.12, 0.12, 0.38].map((x) => (
        <group key={`bolt-row-${x}`}>
          <mesh position={[x * scale.x, 0.18, -scale.z / 2 - 0.035]}>
            <cylinderGeometry args={[0.015, 0.015, 0.02, 8]} />
            <meshStandardMaterial color="#8a9298" roughness={0.5} metalness={0.55} />
          </mesh>
          <mesh position={[x * scale.x, height * 0.95, -scale.z / 2 - 0.035]}>
            <cylinderGeometry args={[0.015, 0.015, 0.02, 8]} />
            <meshStandardMaterial color="#8a9298" roughness={0.5} metalness={0.55} />
          </mesh>
        </group>
      ))}

      {/* Concrete coping (top rim) */}
      {[
        { pos: [0, height + 0.1, -wallCenterZ] as [number, number, number], size: [scale.x + 0.18, 0.12, copingWidth] as [number, number, number] },
        { pos: [0, height + 0.1, wallCenterZ] as [number, number, number], size: [scale.x + 0.18, 0.12, copingWidth] as [number, number, number] },
        { pos: [-wallCenterX, height + 0.1, 0] as [number, number, number], size: [copingWidth, 0.12, scale.z + 0.18] as [number, number, number] },
        { pos: [wallCenterX, height + 0.1, 0] as [number, number, number], size: [copingWidth, 0.12, scale.z + 0.18] as [number, number, number] }
      ].map((coping, i) => (
        <SoftBox key={`coping-${i}`} position={coping.pos} args={coping.size} radius={0.035}>
          <meshStandardMaterial color={copingColor} roughness={0.72} metalness={0.06} />
        </SoftBox>
      ))}

      {/* Water surface */}
      <RoundedBox args={[waterX, 0.05, waterZ]} radius={0.05} smoothness={4} bevelSegments={2} position={[0, height + 0.015, 0]} ref={waterRef}>
        <meshStandardMaterial
          color={colors.water}
          emissive={colors.water}
          emissiveIntensity={0.02}
          transparent
          opacity={0.88}
          roughness={0.2}
          metalness={0.12}
          envMapIntensity={0.4}
        />
      </RoundedBox>

      {/* Subtle outlet ripple near the overflow weir */}
      <mesh ref={foamRef} position={[waterX / 2 - 0.45, height + 0.06, 0]}>
        <boxGeometry args={[0.28, 0.012, Math.min(1.8, waterZ * 0.36)]} />
        <meshStandardMaterial color="#e8f0e0" emissive="#d0e0c8" emissiveIntensity={0.04} transparent opacity={0.24} roughness={0.36} />
      </mesh>
      {/* Surface shimmer caustic patches */}
      {[
        [-0.18, -0.12], [0.12, 0.18], [-0.08, 0.28], [0.22, -0.22]
      ].map(([x, z], i) => (
        <mesh key={`caustic-${i}`} position={[x * scale.x, height + 0.045, z * scale.z]} rotation={[-Math.PI / 2, 0, i * 0.8]}>
          <circleGeometry args={[0.08 + i * 0.02, 8]} />
          <meshStandardMaterial color="#ffffff" emissive="#d0f0ff" emissiveIntensity={0.2} transparent opacity={0.18} roughness={0.05} />
        </mesh>
      ))}

      <WaterDetail scale={scale} height={height} color={colors.water} />
      <ConcretePanelSeams scale={scale} height={height} />
      <CornerPosts scale={scale} height={height} bodyColor={wallColor} />
      <OverflowWeir scale={scale} height={height} color={colors.water} />

      {/* Handrails */}
      <RailRun length={scale.x + 0.18} position={[0, railY, -scale.z / 2 - 0.08]} orientation="x" />
      <RailRun length={scale.x + 0.18} position={[0, railY, scale.z / 2 + 0.08]} orientation="x" />
      <RailRun length={scale.z + 0.18} position={[-scale.x / 2 - 0.08, railY, 0]} orientation="z" />
      <RailRun length={scale.z + 0.18} position={[scale.x / 2 + 0.08, railY, 0]} orientation="z" />

      {/* Basin service bridge: full-width access with yellow guardrails */}
      {showServiceBridge && (
        <ServiceBridge length={serviceBridgeLength} width={0.62} position={[0, height + 0.31, 0]} orientation="x" />
      )}

      <AccessStair position={[-scale.x * 0.42, height + 0.28, -scale.z / 2 - 0.05]} direction="north" run={0.9} width={0.42} steps={6} />
      {showMixer && <Mixer height={height} />}
    </group>
  );
}

function WaterDetail({ scale, height, color }: { scale: { x: number; z: number }; height: number; color: string }) {
  return (
    <group position={[0, height + 0.07, 0]}>
      {[
        [-0.26, -0.16, 0.22],
        [0.22, 0.08, 0.28],
        [0.02, 0.24, 0.18]
      ].map(([x, z, radius], index) => (
        <mesh key={index} position={[x * scale.x, 0.01 + index * 0.006, z * scale.z]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, 0.006, 8, 36]} />
          <meshStandardMaterial color="#d7f8ff" emissive={color} emissiveIntensity={0.14} transparent opacity={0.72} roughness={0.12} />
        </mesh>
      ))}
      {[-0.32, 0.32].map((x) => (
        <mesh key={x} position={[x * scale.x, 0.02, -scale.z * 0.04]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, scale.z * 0.5, 8]} />
          <meshStandardMaterial color="#e4fbff" transparent opacity={0.62} roughness={0.12} />
        </mesh>
      ))}
    </group>
  );
}

function ConcretePanelSeams({ scale, height }: { scale: { x: number; z: number }; height: number }) {
  return (
    <group>
      {[-0.33, 0, 0.33].map((x) => (
        <mesh key={`front-${x}`} position={[x * scale.x, height * 0.48, scale.z / 2 + 0.02]}>
          <boxGeometry args={[0.025, height * 0.82, 0.018]} />
          <meshStandardMaterial color="#bfcbd0" roughness={0.7} metalness={0.04} />
        </mesh>
      ))}
      {[-0.33, 0, 0.33].map((x) => (
        <mesh key={`back-${x}`} position={[x * scale.x, height * 0.48, -scale.z / 2 - 0.02]}>
          <boxGeometry args={[0.025, height * 0.82, 0.018]} />
          <meshStandardMaterial color="#bfcbd0" roughness={0.7} metalness={0.04} />
        </mesh>
      ))}
      {[-0.22, 0.22].map((z) => (
        <mesh key={`side-l-${z}`} position={[-scale.x / 2 - 0.02, height * 0.48, z * scale.z]}>
          <boxGeometry args={[0.018, height * 0.82, 0.025]} />
          <meshStandardMaterial color="#bfcbd0" roughness={0.7} metalness={0.04} />
        </mesh>
      ))}
    </group>
  );
}

function CornerPosts({ scale, height, bodyColor }: { scale: { x: number; z: number }; height: number; bodyColor?: string }) {
  const postColor = bodyColor || PAINTED_STEEL_BLUE;
  return (
    <group>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ].map(([x, z]) => (
        <mesh key={`${x}-${z}`} castShadow receiveShadow position={[x * scale.x * 0.5, height * 0.52, z * scale.z * 0.5]}>
          <boxGeometry args={[0.13, height * 1.1, 0.13]} />
          <meshStandardMaterial color={postColor} roughness={0.55} metalness={0.15} />
        </mesh>
      ))}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1]
      ].map(([x, z]) => (
        <mesh key={`cap-${x}-${z}`} position={[x * scale.x * 0.5, height + 0.12, z * scale.z * 0.5]}>
          <boxGeometry args={[0.2, 0.08, 0.2]} />
          <meshStandardMaterial color={CONCRETE_LIGHT} roughness={0.65} metalness={0.04} />
        </mesh>
      ))}
    </group>
  );
}

function OverflowWeir({ scale, height, color }: { scale: { x: number; z: number }; height: number; color: string }) {
  const weirLength = Math.max(0.7, scale.z - 0.9);
  return (
    <group position={[scale.x / 2 - 0.08, height + 0.02, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.08, 0]}>
        <boxGeometry args={[0.08, 0.18, weirLength]} />
        <meshStandardMaterial color="#6f8794" roughness={0.45} metalness={0.18} />
      </mesh>
      {[-0.24, -0.12, 0, 0.12, 0.24].map((z) => (
        <mesh key={z} position={[0.055, 0.19, z * weirLength * 1.55]}>
          <boxGeometry args={[0.035, 0.16, 0.045]} />
          <meshStandardMaterial color="#dbe5e8" roughness={0.48} metalness={0.12} />
        </mesh>
      ))}
      <mesh position={[0.08, -0.02, 0]}>
        <boxGeometry args={[0.06, 0.045, weirLength * 0.86]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} transparent opacity={0.82} />
      </mesh>
    </group>
  );
}

function GratingDeck({
  length,
  width,
  position,
  orientation = "x",
  color = GALVANIZED_STEEL
}: {
  length: number;
  width: number;
  position: [number, number, number];
  orientation?: "x" | "z";
  color?: string;
}) {
  const alongX = orientation === "x";
  const deckSize: [number, number, number] = alongX ? [length, 0.045, width] : [width, 0.045, length];
  const slatCount = Math.max(4, Math.round(length / 0.22));

  return (
    <group position={position}>
      <SoftBox args={deckSize} radius={0.018}>
        <meshStandardMaterial color={color} roughness={0.48} metalness={0.42} />
      </SoftBox>
      {Array.from({ length: slatCount }).map((_, index) => {
        const offset = -length * 0.44 + (index / Math.max(1, slatCount - 1)) * length * 0.88;
        return (
          <mesh key={`deck-slat-${index}`} position={[alongX ? offset : 0, 0.035, alongX ? 0 : offset]}>
            <boxGeometry args={alongX ? [0.018, 0.018, width * 1.06] : [width * 1.06, 0.018, 0.018]} />
            <meshStandardMaterial color="#d4dde1" roughness={0.42} metalness={0.34} />
          </mesh>
        );
      })}
      {[-0.44, 0.44].map((edge) => (
        <mesh key={`deck-edge-${edge}`} position={[alongX ? 0 : edge * width, 0.055, alongX ? edge * width : 0]}>
          <boxGeometry args={alongX ? [length * 1.02, 0.035, 0.035] : [0.035, 0.035, length * 1.02]} />
          <meshStandardMaterial color="#5f6c73" roughness={0.45} metalness={0.38} />
        </mesh>
      ))}
    </group>
  );
}

function ServiceBridge({
  length,
  width,
  position,
  orientation = "x",
  color = GALVANIZED_STEEL
}: {
  length: number;
  width: number;
  position: [number, number, number];
  orientation?: "x" | "z";
  color?: string;
}) {
  const alongX = orientation === "x";
  const railOffset = width / 2 + 0.12;
  const endPlateSize: [number, number, number] = alongX ? [0.06, 0.08, width + 0.2] : [width + 0.2, 0.08, 0.06];

  return (
    <group position={position}>
      <GratingDeck length={length} width={width} position={[0, 0, 0]} orientation={orientation} color={color} />
      {[-1, 1].map((side) => (
        <RailRun
          key={`bridge-rail-${side}`}
          length={length * 0.98}
          position={alongX ? [0, 0.48, side * railOffset] : [side * railOffset, 0.48, 0]}
          orientation={orientation}
          postSpacing={1.05}
          postHeight={0.5}
        />
      ))}
      {[-1, 1].map((end) => (
        <mesh key={`bridge-end-plate-${end}`} castShadow position={alongX ? [end * length * 0.5, 0.08, 0] : [0, 0.08, end * length * 0.5]}>
          <boxGeometry args={endPlateSize} />
          <meshStandardMaterial color="#4f5c62" roughness={0.5} metalness={0.32} />
        </mesh>
      ))}
    </group>
  );
}

type StairDirection = "north" | "south" | "east" | "west";

function stairVector(direction: StairDirection) {
  if (direction === "north") return { x: 0, z: -1 };
  if (direction === "east") return { x: 1, z: 0 };
  if (direction === "west") return { x: -1, z: 0 };
  return { x: 0, z: 1 };
}

function AccessStair({
  position,
  direction,
  run = 0.95,
  width = 0.46,
  steps = 6
}: {
  position: [number, number, number];
  direction: StairDirection;
  run?: number;
  width?: number;
  steps?: number;
}) {
  const vector = stairVector(direction);
  const alongX = vector.x !== 0;
  const perpendicular = { x: -vector.z, z: vector.x };
  const topY = position[1];
  const bottomY = 0.08;
  const treadDepth = run / steps;
  const stairRise = Math.max(0.2, topY - bottomY);

  const pointAt = (t: number, side = 0, railLift = 0) => {
    const distanceFromTop = run * (1 - t);
    return [
      position[0] + vector.x * distanceFromTop + perpendicular.x * side,
      bottomY + stairRise * t + railLift,
      position[2] + vector.z * distanceFromTop + perpendicular.z * side
    ] as [number, number, number];
  };

  return (
    <group>
      {Array.from({ length: steps }).map((_, index) => {
        const t = (index + 0.5) / steps;
        return (
          <SoftBox
            key={`stair-step-${index}`}
            args={alongX ? [treadDepth * 0.86, 0.055, width] : [width, 0.055, treadDepth * 0.86]}
            position={pointAt(t, 0, 0)}
            radius={0.012}
          >
            <meshStandardMaterial color="#7f8c92" roughness={0.5} metalness={0.38} />
          </SoftBox>
        );
      })}
      <GratingDeck length={width * 1.15} width={0.42} position={position} orientation={alongX ? "z" : "x"} />
      {[-width * 0.56, width * 0.56].map((side) => (
        <group key={`stair-side-${side}`}>
          <CylinderBetween start={pointAt(0, side, 0.05)} end={pointAt(1, side, 0.02)} radius={0.02} color="#5f6c73" />
          <CylinderBetween start={pointAt(0, side, 0.62)} end={pointAt(1, side, 0.58)} radius={0.019} color={SAFETY_YELLOW} metalness={0.22} />
          {[0.08, 0.48, 0.88].map((t) => {
            const base = pointAt(t, side, 0.08);
            return (
              <CylinderBetween
                key={`stair-post-${side}-${t}`}
                start={base}
                end={[base[0], base[1] + 0.52, base[2]]}
                radius={0.016}
                color={SAFETY_YELLOW}
                metalness={0.22}
              />
            );
          })}
        </group>
      ))}
    </group>
  );
}

function RailRun({
  length,
  position,
  orientation,
  postSpacing = 1.35,
  postHeight = 0.46
}: {
  length: number;
  position: [number, number, number];
  orientation: "x" | "z";
  postSpacing?: number;
  postHeight?: number;
}) {
  const isX = orientation === "x";
  const postCount = Math.max(3, Math.ceil(length / postSpacing) + 1);
  const postOffsets = Array.from({ length: postCount }, (_, index) => {
    if (postCount === 1) return 0;
    return -length / 2 + (index / (postCount - 1)) * length;
  });
  const toeBoardSize: [number, number, number] = isX ? [length, 0.07, 0.035] : [0.035, 0.07, length];
  return (
    <group position={position}>
      {/* Top rail */}
      <mesh castShadow rotation={[isX ? 0 : Math.PI / 2, 0, isX ? Math.PI / 2 : 0]}>
        <cylinderGeometry args={[0.024, 0.024, length, 10]} />
        <meshStandardMaterial color={SAFETY_YELLOW} roughness={0.4} metalness={0.2} />
      </mesh>
      {/* Mid rail */}
      <mesh castShadow rotation={[isX ? 0 : Math.PI / 2, 0, isX ? Math.PI / 2 : 0]} position={[0, -postHeight * 0.42, 0]}>
        <cylinderGeometry args={[0.018, 0.018, length, 8]} />
        <meshStandardMaterial color={SAFETY_YELLOW} roughness={0.4} metalness={0.2} />
      </mesh>
      {/* Toe board along the walkway edge */}
      <mesh castShadow position={[0, -postHeight + 0.08, 0]}>
        <boxGeometry args={toeBoardSize} />
        <meshStandardMaterial color={SAFETY_YELLOW} roughness={0.42} metalness={0.14} />
      </mesh>
      {/* Vertical posts */}
      {postOffsets.map((offset) => (
        <mesh key={offset} position={[isX ? offset : 0, -postHeight * 0.5, isX ? 0 : offset]}>
          <cylinderGeometry args={[0.02, 0.02, postHeight, 8]} />
          <meshStandardMaterial color={SAFETY_YELLOW} roughness={0.42} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function InletModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, colors } = props;
  return (
    <group>
      {/* -- Inlet Channel (รางรับน้ำ) -- */}
      <mesh castShadow receiveShadow position={[0, 0.06, 0]}>
        <boxGeometry args={[scale.x * 1.22, 0.12, scale.z * 1.05]} />
        <meshStandardMaterial color="#8fa8b2" roughness={0.72} metalness={0.08} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.28, -scale.z * 0.28]}>
        <boxGeometry args={[scale.x * 1.08, 0.36, 0.08]} />
        <meshStandardMaterial color={colors.body} roughness={0.52} metalness={0.12} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.28, scale.z * 0.28]}>
        <boxGeometry args={[scale.x * 1.08, 0.36, 0.08]} />
        <meshStandardMaterial color={colors.body} roughness={0.52} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <boxGeometry args={[scale.x * 1.02, 0.045, scale.z * 0.42]} />
        <meshStandardMaterial color={colors.water} transparent opacity={0.78} roughness={0.16} />
      </mesh>
      <mesh position={[-scale.x * 0.22, 0.5, 0]} rotation={[0.68, 0, 0]}>
        <boxGeometry args={[scale.x * 0.44, 0.045, scale.z * 0.42]} />
        <meshStandardMaterial color="#283f49" roughness={0.38} metalness={0.35} />
      </mesh>
      {[-0.42, -0.28, -0.14, 0, 0.14, 0.28].map((x) => (
        <mesh key={x} position={[-scale.x * 0.22 + x * 0.75, 0.55, 0]} rotation={[0.68, 0, 0]}>
          <boxGeometry args={[0.024, 0.038, scale.z * 0.46]} />
          <meshStandardMaterial color="#dbe5e8" roughness={0.35} metalness={0.28} />
        </mesh>
      ))}

      {/* -- Unified Incoming Influent Pipe System (Steel A106) -- */}
      {/* 1. Long horizontal incoming pipe from factory (left to right) */}
      <group position={[-scale.x * 2.5, 0.8, scale.z * 0.6]}>
        {/* Main long pipe */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.055, 0.055, scale.x * 3, 16]} />
          <meshStandardMaterial color="#4a4a4e" roughness={0.5} metalness={0.6} />
        </mesh>
        {/* Heat indicator bands (red stripes) */}
        {[-1.5, -0.5, 0.5, 1.5].map((x) => (
          <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.058, 0.008, 8, 20]} />
            <meshStandardMaterial color="#d43030" roughness={0.4} />
          </mesh>
        ))}
        {/* Pipe Supports (Pipe Racks) */}
        {[-1.2, 0, 1.2].map((x) => (
          <group key={`support-${x}`} position={[x, -0.4, 0]}>
            <mesh>
              <boxGeometry args={[0.1, 0.8, 0.1]} />
              <meshStandardMaterial color="#5a6c74" roughness={0.7} metalness={0.2} />
            </mesh>
            <mesh position={[0, 0.42, 0]}>
              <boxGeometry args={[0.2, 0.05, 0.2]} />
              <meshStandardMaterial color="#3a4c54" roughness={0.6} metalness={0.4} />
            </mesh>
          </group>
        ))}
        {/* Pipe Spec Label */}
        <Html position={[-2.8, 0.4, 0]} center distanceFactor={14} zIndexRange={[80, 0]}>
          <div className="dosing-equipment-label">
            <b>4"</b>
            <strong>Steel A106 SCH40</strong>
            <span>Hot Influent &gt;80°C</span>
          </div>
        </Html>
      </group>

      {/* 2. Drop down into Transfer Pumps */}
      {/* Elbow down */}
      <mesh position={[-scale.x * 1.0 + 0.02, 0.8, scale.z * 0.6]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#5a5a60" roughness={0.4} metalness={0.55} />
      </mesh>
      {/* Vertical drop pipe */}
      <mesh position={[-scale.x * 1.0 + 0.02, 0.45, scale.z * 0.6]}>
        <cylinderGeometry args={[0.055, 0.055, 0.7, 16]} />
        <meshStandardMaterial color="#4a4a4e" roughness={0.5} metalness={0.6} />
      </mesh>
      {/* Elbow to pump suction */}
      <mesh position={[-scale.x * 1.0 + 0.02, 0.1, scale.z * 0.6]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#5a5a60" roughness={0.4} metalness={0.55} />
      </mesh>
      <mesh position={[-scale.x * 0.85 + 0.02, 0.1, scale.z * 0.6]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.055, 0.055, 0.3, 16]} />
        <meshStandardMaterial color="#4a4a4e" roughness={0.5} metalness={0.6} />
      </mesh>

      {/* 3. Transfer Pumps P-01 */}
      <group position={[-scale.x * 0.6, 0.08, scale.z * 0.6]}>
        {/* Concrete pump pad */}
        <mesh receiveShadow position={[0, -0.02, 0]}>
          <boxGeometry args={[0.6, 0.08, 0.6]} />
          <meshStandardMaterial color="#b0b5b8" roughness={0.8} />
        </mesh>
        {[-0.15, 0.15].map((z, i) => (
          <group key={`pump-${i}`} position={[0, 0.06, z]}>
            {/* Pump volute casing */}
            <mesh castShadow position={[-0.1, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
              <meshStandardMaterial color="#2570a8" roughness={0.4} metalness={0.35} />
            </mesh>
            {/* Pump motor */}
            <mesh castShadow position={[0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.07, 0.07, 0.2, 16]} />
              <meshStandardMaterial color="#1a4a2a" roughness={0.42} metalness={0.28} />
            </mesh>
            {/* Pipe connections */}
            {/* Suction branch */}
            <mesh position={[-0.1, 0, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.2, 12]} />
              <meshStandardMaterial color="#4a4a4e" roughness={0.5} metalness={0.6} />
            </mesh>
            {/* Discharge branch */}
            <mesh position={[-0.1, 0.1, 0]}>
              <cylinderGeometry args={[0.025, 0.025, 0.2, 12]} />
              <meshStandardMaterial color="#4a4a4e" roughness={0.5} metalness={0.6} />
            </mesh>
          </group>
        ))}
        {/* Pump Label */}
        <Html position={[0, 0.4, 0.4]} center distanceFactor={14} zIndexRange={[80, 0]}>
          <div className="dosing-equipment-label">
            <b>P-01</b>
            <strong>Transfer Pump</strong>
            <span>3 HP × 2</span>
          </div>
        </Html>
      </group>

      {/* 4. Pump discharge up into Flow Meter */}
      {/* Riser pipe */}
      <mesh position={[-scale.x * 0.7, 0.35, scale.z * 0.6]}>
        <cylinderGeometry args={[0.055, 0.055, 0.4, 16]} />
        <meshStandardMaterial color="#4a4a4e" roughness={0.5} metalness={0.6} />
      </mesh>
      
      {/* Flow Meter Assembly on riser */}
      <group position={[-scale.x * 0.7, 0.65, scale.z * 0.6]}>
        <mesh>
          <cylinderGeometry args={[0.055, 0.055, 0.3, 16]} />
          <meshStandardMaterial color="#5b7079" roughness={0.34} metalness={0.32} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.1, 0.1, 0.16, 24]} />
          <meshStandardMaterial color="#1a3d6b" roughness={0.35} metalness={0.45} />
        </mesh>
        {[-0.08, 0.08].map((y) => (
          <mesh key={`flange-${y}`} position={[0, y, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.02, 20]} />
            <meshStandardMaterial color="#6e8490" roughness={0.4} metalness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, 0, 0.12]}>
          <boxGeometry args={[0.1, 0.08, 0.06]} />
          <meshStandardMaterial color="#1a2a38" roughness={0.3} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.151]}>
          <boxGeometry args={[0.06, 0.04, 0.005]} />
          <meshStandardMaterial color="#40d890" emissive="#20a860" emissiveIntensity={0.5} roughness={0.2} />
        </mesh>
        <Html position={[0, 0.3, 0.2]} center distanceFactor={14} zIndexRange={[80, 0]}>
          <div className="dosing-equipment-label">
            <b>FM</b>
            <strong>Flow Meter</strong>
            <span>20 m³/hr</span>
          </div>
        </Html>
      </group>

      {/* 5. Elbow and horizontal discharge into inlet channel */}
      <mesh position={[-scale.x * 0.7, 0.85, scale.z * 0.6]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#5a5a60" roughness={0.4} metalness={0.55} />
      </mesh>
      {/* Horizontal pipe towards center */}
      <mesh position={[-scale.x * 0.7, 0.85, scale.z * 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, scale.z * 0.6, 16]} />
        <meshStandardMaterial color="#4a4a4e" roughness={0.5} metalness={0.6} />
      </mesh>
      {/* Elbow down */}
      <mesh position={[-scale.x * 0.7, 0.85, 0]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#5a5a60" roughness={0.4} metalness={0.55} />
      </mesh>
      {/* Downspout splashing into water */}
      <mesh position={[-scale.x * 0.7, 0.65, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.4, 16]} />
        <meshStandardMaterial color="#4a4a4e" roughness={0.5} metalness={0.6} />
      </mesh>
      {/* Splash effect */}
      <mesh position={[-scale.x * 0.7, 0.45, 0]}>
        <coneGeometry args={[0.15, 0.2, 16]} />
        <meshStandardMaterial color="#e8f4f8" emissive="#ffffff" emissiveIntensity={0.4} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

function HoldingTankModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, colors, selected, alarm } = props;
  return (
    <group>
      <Basin scale={scale} height={height * 0.88} colors={colors} selected={selected} alarm={alarm} showMixer={false} />
      {/* -- 2× Shoot Pumps 3 HP (ปั๊มดูดไป EQ) -- */}
      <group position={[scale.x * 0.42, 0.06, scale.z * 0.5]}>
        {/* Pump pad */}
        <mesh receiveShadow position={[0, 0.02, 0]}>
          <boxGeometry args={[0.64, 0.04, 0.34]} />
          <meshStandardMaterial color="#c0c8cc" roughness={0.78} metalness={0.04} />
        </mesh>
        {[-0.14, 0.14].map((x, i) => (
          <group key={i} position={[x, 0.04, 0]}>
            <mesh castShadow position={[0, 0.09, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.14, 14]} />
              <meshStandardMaterial color="#2570a8" roughness={0.4} metalness={0.35} />
            </mesh>
            <mesh castShadow position={[0, 0.09, 0.09]}>
              <cylinderGeometry args={[0.06, 0.06, 0.12, 12]} />
              <meshStandardMaterial color="#1a4a2a" roughness={0.42} metalness={0.28} />
            </mesh>
          </group>
        ))}
        <Html position={[0, 0.42, 0.35]} center distanceFactor={14} zIndexRange={[80, 0]}>
          <div className="dosing-equipment-label">
            <b>P-02</b>
            <strong>Shoot Pump</strong>
            <span>3 HP × 2 → EQ</span>
          </div>
        </Html>
      </group>
      {/* -- 4" Transfer Pipe to EQ -- */}
      <mesh castShadow position={[scale.x * 0.62, 0.32, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.048, 0.048, 0.5, 14]} />
        <meshStandardMaterial color="#5b7079" roughness={0.38} metalness={0.42} />
      </mesh>
      <Html position={[scale.x * 0.62, 0.56, -0.2]} center distanceFactor={14} zIndexRange={[80, 0]}>
        <div className="dosing-equipment-label">
          <b>4"</b>
          <strong>PVC Pipe</strong>
          <span>Holding → EQ</span>
        </div>
      </Html>
    </group>
  );
}

function SideDosingTanks({
  scale,
  height,
  equipmentNo,
  title,
  chemical
}: {
  scale: { x: number; z: number };
  height: number;
  equipmentNo: string;
  title: string;
  chemical: string;
}) {
  const tankRadius = 0.22;
  const tankHeight = height * 0.8;
  const ribs = 4;
  
  return (
    <group position={[scale.x * 0.66, 0, -scale.z * 0.48]}>
      <mesh castShadow receiveShadow position={[0, 0.04, 0]}>
        <boxGeometry args={[1.0, 0.08, 0.52]} />
        <meshStandardMaterial color="#cfd9dd" roughness={0.58} metalness={0.16} />
      </mesh>
      {[
        [-0.24, "#4faed6"],
        [0.24, "#d99a30"]
      ].map(([x, liquidColor]) => (
        <group key={`${x}`} position={[Number(x), 0.08, 0]}>
          {/* Liquid inside */}
          <mesh position={[0, tankHeight * 0.45, 0]}>
            <cylinderGeometry args={[tankRadius * 0.94, tankRadius * 0.94, tankHeight * 0.8, 24]} />
            <meshStandardMaterial color={String(liquidColor)} transparent opacity={0.7} />
          </mesh>
          {/* PE Tank Body */}
          <mesh castShadow position={[0, tankHeight / 2, 0]}>
            <cylinderGeometry args={[tankRadius, tankRadius, tankHeight, 28]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.4} roughness={0.2} metalness={0.1} />
          </mesh>
          {/* Tank Top Dome */}
          <mesh position={[0, tankHeight, 0]}>
            <sphereGeometry args={[tankRadius, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.45} roughness={0.2} />
          </mesh>
          {/* Tank Ribs */}
          {Array.from({ length: ribs }).map((_, i) => (
            <mesh key={i} position={[0, tankHeight * ((i + 1) / (ribs + 1)), 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[tankRadius, 0.012, 8, 32]} />
              <meshStandardMaterial color="#ffffff" transparent opacity={0.55} roughness={0.2} />
            </mesh>
          ))}
          
          {/* Dosing Pump on Top */}
          <group position={[0, tankHeight + 0.05, 0]}>
            {/* Pump Base */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.08, 0.02, 0.12]} />
              <meshStandardMaterial color="#d98a28" roughness={0.5} />
            </mesh>
            {/* Pump Body (Blue Diaphragm Pump) */}
            <mesh position={[0, 0.05, 0.02]}>
              <boxGeometry args={[0.06, 0.08, 0.08]} />
              <meshStandardMaterial color="#1a55cc" roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.05, -0.03]}>
              <sphereGeometry args={[0.04, 16, 16]} />
              <meshStandardMaterial color="#1a55cc" roughness={0.4} />
            </mesh>
            {/* Discharge Pipe from pump */}
            <mesh position={[0, 0.05, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.008, 0.008, 0.1, 8]} />
              <meshStandardMaterial color="#54bed0" roughness={0.3} />
            </mesh>
            {/* Suction Pipe going into tank */}
            <mesh position={[0, -tankHeight * 0.4, 0.02]}>
              <cylinderGeometry args={[0.006, 0.006, tankHeight * 0.8, 8]} />
              <meshStandardMaterial color="#ffffff" transparent opacity={0.6} />
            </mesh>
          </group>
        </group>
      ))}
      <DosingEquipmentLabel position={[0, height + 0.36, 0]} equipmentNo={equipmentNo} title={title} chemical={chemical} />
    </group>
  );
}

function DosingEquipmentLabel({
  position,
  equipmentNo,
  title,
  chemical
}: {
  position: [number, number, number];
  equipmentNo: string;
  title: string;
  chemical: string;
}) {
  return (
    <Html position={position} center distanceFactor={12} occlude={false} zIndexRange={[80, 0]}>
      <div className="dosing-equipment-label">
        <b>{equipmentNo}</b>
        <strong>{title}</strong>
        <span>{chemical}</span>
      </div>
    </Html>
  );
}

function EqualizationPhModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, colors } = props;

  return (
    <group>
      <Basin {...props} />
      {/* pH probe column */}
      <mesh position={[-scale.x * 0.47, height * 0.54, -scale.z * 0.44]}>
        <boxGeometry args={[0.18, height * 0.78, 0.08]} />
        <meshStandardMaterial color={colors.accent} roughness={0.36} metalness={0.18} />
      </mesh>

      {/* Chemical Dosing System (ถังกวน → ปั๊ม → ถังพัก → ปั๊ม → EQ) */}
      <ChemicalDosingSystem
        position={[scale.x * 0.5, 0, -scale.z * 0.56]}
        height={height}
        mixLabel="pH Mixing"
        storeLabel="pH Storage"
        pumpAId="P-03"
        pumpBId="P-04"
        pumpHP="2 HP"
        chemical="Acid/Alkali"
      />
    </group>
  );
}

/* ===== Primary Clarifier — บ่อ 4 เหลี่ยม 5×8×3m ===== */
function PrimaryClarifierModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height } = props;
  const scraperRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (scraperRef.current) {
      const t = (clock.elapsedTime * 0.15) % 1;
      scraperRef.current.position.x = (t - 0.5) * scale.x * 0.7;
    }
  });

  return (
    <group>
      <Basin {...props} />
      {/* Sludge hopper (bottom V-shape) */}
      <mesh position={[0, -0.08, 0]}>
        <boxGeometry args={[scale.x * 0.6, 0.12, scale.z * 0.6]} />
        <meshStandardMaterial color="#7a8882" roughness={0.82} metalness={0.03} />
      </mesh>
      {/* Scraper mechanism (moves back and forth) */}
      <group ref={scraperRef} position={[0, height * 0.25, 0]}>
        <mesh>
          <boxGeometry args={[0.04, height * 0.4, scale.z * 0.7]} />
          <meshStandardMaterial color="#3a4e58" roughness={0.42} metalness={0.35} />
        </mesh>
        {[-0.3, 0, 0.3].map((z) => (
          <mesh key={z} position={[0, -height * 0.18, z * scale.z * 0.4]} rotation={[0.3, 0, 0]}>
            <boxGeometry args={[0.1, 0.06, 0.02]} />
            <meshStandardMaterial color="#5a6c74" roughness={0.5} metalness={0.28} />
          </mesh>
        ))}
      </group>
      {/* Scraper rail (top) */}
      <mesh position={[0, height + 0.08, 0]}>
        <boxGeometry args={[scale.x * 0.92, 0.03, 0.04]} />
        <meshStandardMaterial color="#4a5a62" roughness={0.4} metalness={0.4} />
      </mesh>
      {/* Effluent weir (overflow) */}
      <mesh position={[scale.x * 0.48, height + 0.04, 0]}>
        <boxGeometry args={[0.04, 0.08, scale.z * 0.85]} />
        <meshStandardMaterial color="#9ca6aa" roughness={0.75} metalness={0.06} />
      </mesh>

      {/* Chemical Dosing System (PAC + Polymer) */}
      <ChemicalDosingSystem
        position={[scale.x * 0.4, 0, -scale.z * 0.62]}
        height={height}
        mixLabel="Coag Mixing"
        storeLabel="Coag Storage"
        pumpAId="P-05"
        pumpBId="P-06"
        pumpHP="2 HP"
        chemical="PAC + Polymer"
      />
    </group>
  );
}

/* ===== Reusable Chemical Dosing System ===== */
/* ถังกวน(เปิด+มอเตอร์) → ปั๊ม → ถังพัก → ปั๊ม → บ่อ */
function ChemicalDosingSystem({
  position,
  height,
  mixLabel,
  storeLabel,
  pumpAId,
  pumpBId,
  pumpHP,
  chemical
}: {
  position: [number, number, number];
  height: number;
  mixLabel: string;
  storeLabel: string;
  pumpAId: string;
  pumpBId: string;
  pumpHP: string;
  chemical: string;
}) {
  const tankR = 0.16;
  const tankH = height * 0.6;
  const motorRef = useRef<THREE.Mesh[]>([]);

  useFrame(({ clock }) => {
    motorRef.current.forEach((m) => {
      if (m) m.rotation.y = clock.elapsedTime * 3;
    });
  });

  return (
    <group position={position}>
      {/* -- 1. ถังเตรียมกวน (Open-top Mixing Tanks × 2) -- */}
      <group position={[-0.8, 0, 0]}>
        <mesh receiveShadow position={[0, 0.025, 0]}>
          <boxGeometry args={[0.8, 0.05, 0.46]} />
          <meshStandardMaterial color="#c8d0d4" roughness={0.8} metalness={0.02} />
        </mesh>
        {[-0.18, 0.18].map((x, i) => (
          <group key={i} position={[x, 0.05, 0]}>
            {/* Open-top tank (no dome — ถังเปิด) */}
            <mesh castShadow position={[0, tankH / 2, 0]}>
              <cylinderGeometry args={[tankR, tankR * 1.05, tankH, 20, 1, true]} />
              <meshStandardMaterial color="#b8c0c4" roughness={0.7} metalness={0.1} side={2} />
            </mesh>
            {/* Tank bottom */}
            <mesh position={[0, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <circleGeometry args={[tankR * 1.05, 20]} />
              <meshStandardMaterial color="#a0a8ac" roughness={0.8} />
            </mesh>
            {/* Liquid inside (visible from top) */}
            <mesh position={[0, tankH * 0.38, 0]}>
              <cylinderGeometry args={[tankR * 0.92, tankR * 0.92, tankH * 0.65, 20]} />
              <meshStandardMaterial color={i === 0 ? "#4faed6" : "#d99a30"} transparent opacity={0.6} />
            </mesh>
            {/* Tank rim (lip) */}
            <mesh position={[0, tankH, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[tankR, 0.015, 8, 24]} />
              <meshStandardMaterial color="#8a9298" roughness={0.5} metalness={0.2} />
            </mesh>
            {/* Motor mount (crossbar) */}
            <mesh position={[0, tankH + 0.06, 0]}>
              <boxGeometry args={[tankR * 2.2, 0.025, 0.04]} />
              <meshStandardMaterial color="#4a5a62" roughness={0.4} metalness={0.4} />
            </mesh>
            {/* Motor (มอเตอร์กวน) */}
            <mesh castShadow position={[0, tankH + 0.16, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 0.14, 12]} />
              <meshStandardMaterial color="#1a4a2a" roughness={0.4} metalness={0.3} />
            </mesh>
            {/* Motor top cap */}
            <mesh position={[0, tankH + 0.24, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 0.02, 10]} />
              <meshStandardMaterial color="#888" metalness={0.5} roughness={0.3} />
            </mesh>
            {/* Mixer shaft (down into liquid) */}
            <mesh position={[0, tankH * 0.55, 0]}>
              <cylinderGeometry args={[0.008, 0.008, tankH * 0.85, 6]} />
              <meshStandardMaterial color="#7a7a80" metalness={0.5} roughness={0.3} />
            </mesh>
            {/* Impeller blades */}
            <mesh ref={(n) => { if (n) motorRef.current[i] = n; }} position={[0, tankH * 0.2, 0]}>
              <boxGeometry args={[tankR * 1.2, 0.015, 0.03]} />
              <meshStandardMaterial color="#5a6a72" roughness={0.4} metalness={0.35} />
            </mesh>
          </group>
        ))}
        {/* Mini tag directly on equipment */}
        <Html position={[0, tankH + 0.3, 0]} center distanceFactor={12} zIndexRange={[80, 0]}>
          <div className="dosing-mini-tag dosing-mini-tag--blue">
            <b>MX</b>
            <span>{mixLabel} · {chemical}</span>
          </div>
        </Html>
      </group>

      {/* -- 2. ปั๊มจากถังกวน → ถังพัก -- */}
      <group position={[-0.25, 0.05, 0]}>
        {[-0.07, 0.07].map((x, i) => (
          <group key={i} position={[x, 0, 0]}>
            <mesh castShadow position={[0, 0.055, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 0.09, 12]} />
              <meshStandardMaterial color="#a83025" roughness={0.4} metalness={0.35} />
            </mesh>
            <mesh castShadow position={[0, 0.055, 0.055]}>
              <cylinderGeometry args={[0.035, 0.035, 0.07, 10]} />
              <meshStandardMaterial color="#1a4a2a" roughness={0.42} metalness={0.28} />
            </mesh>
          </group>
        ))}
        <Html position={[0, 0.16, 0]} center distanceFactor={12} zIndexRange={[80, 0]}>
          <div className="dosing-mini-tag dosing-mini-tag--red">
            <b>{pumpAId}</b>
            <span>{pumpHP}×2</span>
          </div>
        </Html>
      </group>

      {/* Pipe: Mixing → Pump */}
      <mesh position={[-0.52, 0.11, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.01, 0.01, 0.28, 8]} />
        <meshStandardMaterial color="#54bed0" roughness={0.3} />
      </mesh>

      {/* -- 3. ถังพักเคมี (Closed Storage × 2) -- */}
      <group position={[0.3, 0, 0]}>
        <mesh receiveShadow position={[0, 0.025, 0]}>
          <boxGeometry args={[0.7, 0.05, 0.42]} />
          <meshStandardMaterial color="#c8d0d4" roughness={0.8} metalness={0.02} />
        </mesh>
        {[-0.16, 0.16].map((x, i) => (
          <group key={i} position={[x, 0.05, 0]}>
            <mesh castShadow position={[0, tankH / 2, 0]}>
              <cylinderGeometry args={[tankR * 0.9, tankR * 0.9, tankH, 20]} />
              <meshStandardMaterial color="#e8e8e8" transparent opacity={0.45} roughness={0.2} />
            </mesh>
            <mesh position={[0, tankH * 0.38, 0]}>
              <cylinderGeometry args={[tankR * 0.82, tankR * 0.82, tankH * 0.65, 20]} />
              <meshStandardMaterial color={i === 0 ? "#4faed6" : "#d99a30"} transparent opacity={0.6} />
            </mesh>
            <mesh position={[0, tankH, 0]}>
              <sphereGeometry args={[tankR * 0.9, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#e8e8e8" transparent opacity={0.45} />
            </mesh>
          </group>
        ))}
        <Html position={[0, tankH + 0.18, 0]} center distanceFactor={12} zIndexRange={[80, 0]}>
          <div className="dosing-mini-tag dosing-mini-tag--green">
            <b>ST</b>
            <span>{storeLabel} · {chemical}</span>
          </div>
        </Html>
      </group>

      {/* Pipe: Pump → Storage */}
      <mesh position={[0.02, 0.11, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.01, 0.01, 0.24, 8]} />
        <meshStandardMaterial color="#54bed0" roughness={0.3} />
      </mesh>

      {/* -- 4. ปั๊มจากถังพัก → บ่อ -- */}
      <group position={[0.82, 0.05, 0]}>
        {[-0.07, 0.07].map((x, i) => (
          <group key={i} position={[x, 0, 0]}>
            <mesh castShadow position={[0, 0.055, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 0.09, 12]} />
              <meshStandardMaterial color="#a83025" roughness={0.4} metalness={0.35} />
            </mesh>
            <mesh castShadow position={[0, 0.055, 0.055]}>
              <cylinderGeometry args={[0.035, 0.035, 0.07, 10]} />
              <meshStandardMaterial color="#1a4a2a" roughness={0.42} metalness={0.28} />
            </mesh>
          </group>
        ))}
        <Html position={[0, 0.16, 0]} center zIndexRange={[80, 0]}>
          <div className="dosing-mini-tag dosing-mini-tag--red">
            <b>{pumpBId}</b>
            <span>{pumpHP}×2</span>
          </div>
        </Html>
      </group>

      {/* Pipe: Storage → Pump */}
      <mesh position={[0.56, 0.11, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.01, 0.01, 0.24, 8]} />
        <meshStandardMaterial color="#54bed0" roughness={0.3} />
      </mesh>

      {/* 1" Dosing pipes × 2 (one per chemical) → up → elbow → horizontal into basin */}
      {[-0.06, 0.06].map((zOff, i) => (
        <group key={i} position={[0, 0, zOff]}>
          {/* Vertical riser from pump */}
          <mesh position={[0.82, height * 0.55, 0]}>
            <cylinderGeometry args={[0.007, 0.007, height * 0.9, 8]} />
            <meshStandardMaterial color={i === 0 ? "#4a9ec9" : "#c97a2a"} roughness={0.3} metalness={0.2} />
          </mesh>
          {/* Elbow */}
          <mesh position={[0.82, height + 0.02, 0]}>
            <sphereGeometry args={[0.014, 8, 8]} />
            <meshStandardMaterial color={i === 0 ? "#4a9ec9" : "#c97a2a"} roughness={0.3} metalness={0.2} />
          </mesh>
          {/* Horizontal run into basin */}
          <mesh position={[0.42, height + 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.007, 0.007, 0.8, 8]} />
            <meshStandardMaterial color={i === 0 ? "#4a9ec9" : "#c97a2a"} roughness={0.3} metalness={0.2} />
          </mesh>
          {/* Injection nozzle */}
          <mesh position={[0.02, height + 0.02, 0]}>
            <sphereGeometry args={[0.015, 8, 8]} />
            <meshStandardMaterial color={i === 0 ? "#2a82c9" : "#b46a20"} roughness={0.25} metalness={0.3} />
          </mesh>
        </group>
      ))}
      {/* 1" label */}
      <Html position={[0.52, height + 0.14, 0]} center distanceFactor={14} zIndexRange={[80, 0]}>
        <div className="dosing-mini-tag" style={{ borderColor: 'rgba(74,158,201,0.3)' }}>
          <b style={{ background: '#4a9ec9' }}>1"</b>
          <span>Dosing ×2</span>
        </div>
      </Html>
    </group>
  );
}

function ConicalClarifierModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
  recycleColor?: string;
}) {
  const { scale, height, colors, selected, alarm } = props;
  const radius = Math.max(scale.x, scale.z) * 0.48;
  const scraperRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (scraperRef.current) scraperRef.current.rotation.y = clock.elapsedTime * 0.4;
  });

  return (
    <group>
      {/* Concrete tank wall */}
      <mesh castShadow receiveShadow position={[0, height * 0.52, 0]}>
        <cylinderGeometry args={[radius, radius * 1.04, height * 0.78, 56]} />
        <meshStandardMaterial color="#adb5b9" roughness={0.9} metalness={0.02} />
      </mesh>
      {/* Cone bottom */}
      <mesh castShadow receiveShadow position={[0, height * 0.13, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[radius * 0.86, height * 0.42, 56]} />
        <meshStandardMaterial color="#8a949e" roughness={0.85} metalness={0.03} />
      </mesh>
      {/* Concrete wall seams */}
      {Array.from({ length: 12 }).map((_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return (
          <mesh key={index} position={[Math.cos(angle) * radius * 1.01, height * 0.52, Math.sin(angle) * radius * 1.01]} rotation={[0, -angle, 0]}>
            <boxGeometry args={[0.02, height * 0.68, 0.035]} />
            <meshStandardMaterial color="#9aa2a8" roughness={0.85} metalness={0.03} />
          </mesh>
        );
      })}
      {/* Water surface */}
      <mesh position={[0, height + 0.02, 0]}>
        <cylinderGeometry args={[radius * 0.88, radius * 0.88, 0.05, 56]} />
        <meshStandardMaterial color={colors.water} transparent opacity={0.82} roughness={0.06} metalness={0.18} emissive={colors.water} emissiveIntensity={0.05} />
      </mesh>
      <WaterDetail scale={{ x: radius * 1.5, z: radius * 1.5 }} height={height} color={colors.water} />

      {/* Concrete coping ring */}
      <mesh position={[0, height + 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.99, 0.065, 10, 64]} />
        <meshStandardMaterial color={selected ? colors.accent : alarm ? "#d7463f" : CONCRETE_LIGHT} roughness={0.72} metalness={0.08} />
      </mesh>

      {/* Center feed well */}
      <mesh position={[0, height * 0.72, 0]}>
        <cylinderGeometry args={[radius * 0.24, radius * 0.26, height * 0.35, 28]} />
        <meshStandardMaterial color="#98a0a4" roughness={0.82} metalness={0.04} transparent opacity={0.65} />
      </mesh>
      {/* Effluent launder */}
      <mesh position={[0, height + 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.78, 0.038, 8, 48]} />
        <meshStandardMaterial color="#9ca6aa" roughness={0.75} metalness={0.06} />
      </mesh>
      {/* Bridge walkway */}
      <ServiceBridge length={radius * 2.18} width={0.36} position={[0, height + 0.24, 0]} color="#5d6970" />
      <AccessStair position={[-0.22, height + 0.25, -radius * 1.1]} direction="north" run={0.78} width={0.36} steps={5} />
      {/* Rotating scraper */}
      <group ref={scraperRef} position={[0, height * 0.28, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[0.035, radius * 1.7, 0.055]} />
          <meshStandardMaterial color="#3a4e58" roughness={0.42} metalness={0.35} />
        </mesh>
        <mesh position={[0, height * 0.3, 0]}>
          <cylinderGeometry args={[0.03, 0.03, height * 0.55, 10]} />
          <meshStandardMaterial color="#4a6068" roughness={0.38} metalness={0.38} />
        </mesh>
        {[-0.5, -0.2, 0.15, 0.45].map((x) => (
          <mesh key={x} position={[x * radius, -0.05, 0]} rotation={[0.32, 0, 0]}>
            <boxGeometry args={[0.12, 0.07, 0.022]} />
            <meshStandardMaterial color="#5a6c74" roughness={0.5} metalness={0.28} />
          </mesh>
        ))}
      </group>
      {/* Center drive unit */}
      <mesh castShadow position={[0, height + 0.42, 0]}>
        <cylinderGeometry args={[0.16, 0.18, 0.2, 20]} />
        <meshStandardMaterial color="#2a3c44" roughness={0.35} metalness={0.4} />
      </mesh>
      {/* Support columns */}
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x * radius, height * 0.15, x > 0 ? radius * 0.76 : -radius * 0.76]}>
          <cylinderGeometry args={[0.04, 0.04, height * 0.55, 10]} />
          <meshStandardMaterial color="#5a6a72" roughness={0.4} metalness={0.35} />
        </mesh>
      ))}
      {/* Sludge outlet base */}
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[radius * 0.5, radius * 0.68, 0.06, 56]} />
        <meshStandardMaterial color="#7a8882" roughness={0.82} metalness={0.03} />
      </mesh>
    </group>
  );
}

function AerationModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, colors } = props;
  const bubbleCount = 24;
  const bubbleRefs = useRef<THREE.Mesh[]>([]);
  const foamRefs = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    bubbleRefs.current.forEach((bubble, index) => {
      if (!bubble) return;
      const speed = 0.35 + (index % 4) * 0.1;
      const t = (clock.elapsedTime * speed + index * 0.12) % 1;
      bubble.position.y = 0.22 + t * (height + 0.1);
      const s = 0.25 + t * 0.9;
      bubble.scale.setScalar(s);
      (bubble.material as THREE.MeshStandardMaterial).opacity = 0.75 - t * 0.55;
    });
    foamRefs.current.forEach((foam, i) => {
      if (!foam) return;
      foam.position.y = height + 0.065 + Math.sin(clock.elapsedTime * 1.5 + i * 0.8) * 0.01;
      foam.rotation.y = clock.elapsedTime * 0.02 + i * 0.5;
    });
  });

  const diffuserPositions: [number, number][] = [];
  for (let xi = -0.42; xi <= 0.42; xi += 0.07) {
    for (let zi = -0.38; zi <= 0.38; zi += 0.095) {
      diffuserPositions.push([xi, zi]);
    }
  }

  return (
    <group>
      <Basin {...props} />
      <SideDosingTanks scale={scale} height={height * 0.9} equipmentNo="5.1" title="Support Dosing" chemical="Nutrient / pH" />

      {/* Fine bubble disc diffusers on floor — small round heads covering basin floor */}
      {diffuserPositions.map(([x, z], i) => (
        <group key={`diff-${i}`} position={[x * scale.x, 0.14, z * scale.z]}>
          {/* Base plate / mounting ring */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.042, 0.045, 0.012, 12]} />
            <meshStandardMaterial color="#3a5560" roughness={0.55} metalness={0.2} />
          </mesh>
          {/* Rubber membrane disc — round diffuser head */}
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.038, 0.038, 0.005, 12]} />
            <meshStandardMaterial color="#1e3a42" roughness={0.75} metalness={0.04} />
          </mesh>
          {/* Tiny bubble ring effect on surface of disc */}
          <mesh position={[0, 0.015, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.028, 0.004, 6, 12]} />
            <meshStandardMaterial color="#5a8a92" roughness={0.3} metalness={0.1} transparent opacity={0.5} />
          </mesh>
        </group>
      ))}

      {/* Air header pipe (main 4" steel) — runs along back wall of basin */}
      <mesh position={[0, 0.18, scale.z * 0.42]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, scale.x * 0.92, 16]} />
        <meshStandardMaterial color="#4a6570" roughness={0.35} metalness={0.4} />
      </mesh>
      {/* Header pipe flanges */}
      {[-0.42, -0.14, 0.14, 0.42].map((x) => (
        <mesh key={`hf-${x}`} position={[x * scale.x, 0.18, scale.z * 0.42]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.082, 0.082, 0.018, 16]} />
          <meshStandardMaterial color="#6a7a82" roughness={0.45} metalness={0.45} />
        </mesh>
      ))}

      {/* Branch pipes (2" PVC) from header to diffuser grid rows */}
      {[-0.35, -0.18, 0, 0.18, 0.35].map((x) => (
        <mesh key={x} position={[x * scale.x, 0.16, scale.z * 0.06]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.025, 0.025, scale.z * 0.65, 10]} />
          <meshStandardMaterial color="#5c727a" roughness={0.35} metalness={0.35} />
        </mesh>
      ))}

      {/* === 2 Root Blowers (BL-01, 10 HP × 2, duty/standby) outside basin === */}
      {/* Blower 1 (Duty) */}
      <group position={[-scale.x * 0.56, 0, -scale.z * 0.62]}>
        {/* Concrete base pad */}
        <mesh castShadow receiveShadow position={[0, 0.04, 0]}>
          <boxGeometry args={[0.72, 0.08, 0.48]} />
          <meshStandardMaterial color="#b0aaa4" roughness={0.85} metalness={0.02} />
        </mesh>
        {/* Blower housing (three-lobe root blower) */}
        <mesh castShadow receiveShadow position={[0, 0.28, 0]}>
          <boxGeometry args={[0.58, 0.36, 0.4]} />
          <meshStandardMaterial color="#264552" roughness={0.42} metalness={0.28} />
        </mesh>
        {/* Motor (green cylinder) */}
        <mesh castShadow position={[0, 0.58, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.32, 20]} />
          <meshStandardMaterial color="#239b62" roughness={0.4} metalness={0.25} />
        </mesh>
        {/* Motor shaft coupling */}
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.04, 14]} />
          <meshStandardMaterial color="#556065" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Inlet filter */}
        <mesh position={[-0.34, 0.28, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.08, 16]} />
          <meshStandardMaterial color="#7a8a92" roughness={0.45} metalness={0.3} />
        </mesh>
        {/* Ventilation grilles */}
        {[-0.06, 0, 0.06].map((y) => (
          <mesh key={y} position={[0.3, 0.28 + y, 0]}>
            <boxGeometry args={[0.02, 0.025, 0.3]} />
            <meshStandardMaterial color="#1a2e36" roughness={0.5} metalness={0.3} />
          </mesh>
        ))}
        {/* Motor nameplate */}
        <mesh position={[-0.3, 0.34, 0]}>
          <boxGeometry args={[0.02, 0.1, 0.16]} />
          <meshStandardMaterial color="#c0c8cc" roughness={0.3} metalness={0.5} />
        </mesh>
        {/* Air outlet pipe going up and into basin */}
        <CylinderBetween
          start={[0, 0.48, 0.18]}
          end={[0, 0.48, scale.z * 0.42 + scale.z * 0.62]}
          radius={0.04}
          color="#5c727a"
          roughness={0.35}
          metalness={0.35}
        />
      </group>

      {/* Blower 2 (Standby) */}
      <group position={[scale.x * 0.56, 0, -scale.z * 0.62]}>
        {/* Concrete base pad */}
        <mesh castShadow receiveShadow position={[0, 0.04, 0]}>
          <boxGeometry args={[0.72, 0.08, 0.48]} />
          <meshStandardMaterial color="#b0aaa4" roughness={0.85} metalness={0.02} />
        </mesh>
        {/* Blower housing */}
        <mesh castShadow receiveShadow position={[0, 0.28, 0]}>
          <boxGeometry args={[0.58, 0.36, 0.4]} />
          <meshStandardMaterial color="#264552" roughness={0.42} metalness={0.28} />
        </mesh>
        {/* Motor (green cylinder) */}
        <mesh castShadow position={[0, 0.58, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.32, 20]} />
          <meshStandardMaterial color="#239b62" roughness={0.4} metalness={0.25} />
        </mesh>
        {/* Motor shaft coupling */}
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 0.04, 14]} />
          <meshStandardMaterial color="#556065" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Inlet filter */}
        <mesh position={[0.34, 0.28, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.08, 16]} />
          <meshStandardMaterial color="#7a8a92" roughness={0.45} metalness={0.3} />
        </mesh>
        {/* Ventilation grilles */}
        {[-0.06, 0, 0.06].map((y) => (
          <mesh key={y} position={[-0.3, 0.28 + y, 0]}>
            <boxGeometry args={[0.02, 0.025, 0.3]} />
            <meshStandardMaterial color="#1a2e36" roughness={0.5} metalness={0.3} />
          </mesh>
        ))}
        {/* Motor nameplate */}
        <mesh position={[0.3, 0.34, 0]}>
          <boxGeometry args={[0.02, 0.1, 0.16]} />
          <meshStandardMaterial color="#c0c8cc" roughness={0.3} metalness={0.5} />
        </mesh>
        {/* Air outlet pipe going up and into basin */}
        <CylinderBetween
          start={[0, 0.48, 0.18]}
          end={[0, 0.48, scale.z * 0.42 + scale.z * 0.62]}
          radius={0.04}
          color="#5c727a"
          roughness={0.35}
          metalness={0.35}
        />
      </group>

      {/* Rising air bubble clusters */}
      {Array.from({ length: bubbleCount }).map((_, index) => {
        const xPos = ((index % 6) - 2.5) * 0.16 * scale.x + (index % 2 === 0 ? 0.05 : -0.05);
        const zPos = ((index % 4) - 1.5) * 0.18 * scale.z;
        const size = 0.035 + (index % 3) * 0.015;
        return (
          <mesh
            key={index}
            ref={(node) => { if (node) bubbleRefs.current[index] = node; }}
            position={[xPos, 0.5, zPos]}
          >
            <sphereGeometry args={[size, 8, 8]} />
            <meshStandardMaterial
              color="#c5f2ff"
              transparent
              opacity={0.65}
              emissive="#88ddf0"
              emissiveIntensity={0.18}
              roughness={0.08}
              metalness={0.08}
            />
          </mesh>
        );
      })}

      {/* Surface foam patches from aeration */}
      {[
        [-0.18, -0.15, 0.32], [0.08, 0.2, 0.28], [-0.25, 0.12, 0.22],
        [0.22, -0.08, 0.25], [0.02, 0.3, 0.2], [-0.12, -0.28, 0.18]
      ].map(([x, z, r], i) => (
        <mesh
          key={`foam-${i}`}
          ref={(node) => { if (node) foamRefs.current[i] = node; }}
          position={[x * scale.x, height + 0.065, z * scale.z]}
          rotation={[-Math.PI / 2, 0, i * 1.2]}
        >
          <circleGeometry args={[r, 10]} />
          <meshStandardMaterial color="#e8f2e8" emissive="#d0e8d0" emissiveIntensity={0.1} transparent opacity={0.4} roughness={0.3} />
        </mesh>
      ))}

      {/* Blower label */}
      <Html position={[0, 1.1, -scale.z * 0.62]} center distanceFactor={14} occlude={false} zIndexRange={[80, 0]}>
        <div className="site-equipment-label">
          <strong>Root Blower BL-01</strong>
          <span>10 HP × 2 (duty/standby)</span>
        </div>
      </Html>
    </group>
  );
}


function SecondaryClarifierModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, colors, selected, alarm } = props;
  const scraperRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (scraperRef.current) {
      const t = (clock.elapsedTime * 0.08) % 1;
      scraperRef.current.position.x = (t - 0.5) * scale.x * 0.62;
    }
  });
  const launderZ = Math.max(0.8, scale.z - 0.95);

  return (
    <group>
      <Basin {...props} showMixer={false} showServiceBridge={false} />

      {/* Inlet stilling box from aeration side */}
      <group position={[-scale.x * 0.38, height + 0.06, 0]}>
        <SoftBox args={[0.72, 0.18, Math.min(1.2, scale.z * 0.34)]} radius={0.025}>
          <meshStandardMaterial color="#8f9ba0" roughness={0.78} metalness={0.06} />
        </SoftBox>
        <mesh position={[0.18, 0.08, 0]}>
          <boxGeometry args={[0.055, 0.18, Math.min(0.92, scale.z * 0.28)]} />
          <meshStandardMaterial color="#6d7c82" roughness={0.68} metalness={0.12} />
        </mesh>
      </group>

      {/* Twin effluent launders at outlet end */}
      {[-0.18, 0.18].map((z) => (
        <mesh key={`sec-launder-${z}`} castShadow receiveShadow position={[scale.x / 2 - 0.42, height + 0.11, z * launderZ]}>
          <boxGeometry args={[0.2, 0.12, launderZ * 0.46]} />
          <meshStandardMaterial color="#a0aab0" roughness={0.75} metalness={0.08} />
        </mesh>
      ))}

      {/* Scum baffle and outlet weir plate */}
      <mesh position={[scale.x / 2 - 0.68, height + 0.075, 0]}>
        <boxGeometry args={[0.045, 0.12, launderZ * 0.78]} />
        <meshStandardMaterial color="#7f9095" roughness={0.6} metalness={0.14} />
      </mesh>
      <mesh position={[scale.x / 2 - 0.28, height + 0.04, 0]}>
        <boxGeometry args={[0.055, 0.08, launderZ * 0.82]} />
        <meshStandardMaterial color={colors.water} emissive={colors.water} emissiveIntensity={0.12} transparent opacity={0.7} roughness={0.18} />
      </mesh>

      {/* Fixed walkway / service bridge (does NOT move, oriented along X to match other basins) */}
      <ServiceBridge length={Math.max(1.5, scale.x * 0.72)} width={0.42} position={[0, height + 0.31, 0]} orientation="x" color="#5d6970" />

      {/* Travelling scraper/skimmer mechanism (moves back and forth) */}
      <group ref={scraperRef} position={[0, height + 0.2, 0]}>
        {/* Surface skimmer beam spanning Z axis */}
        <mesh position={[0, -0.05, 0]}>
          <boxGeometry args={[0.15, 0.12, scale.z * 0.9]} />
          <meshStandardMaterial color="#4a5a60" roughness={0.6} metalness={0.2} />
        </mesh>
        {/* Vertical shaft from bridge level down to basin floor */}
        <mesh position={[0, -height * 0.72, 0]}>
          <boxGeometry args={[0.065, height * 0.7, 0.07]} />
          <meshStandardMaterial color="#3a5058" roughness={0.42} metalness={0.36} />
        </mesh>
        {/* Scraper blades at bottom */}
        {[-0.34, 0, 0.34].map((z) => (
          <mesh key={`sec-blade-${z}`} position={[0.08, -height * 0.98, z * scale.z]} rotation={[0.34, 0, 0]}>
            <boxGeometry args={[0.42, 0.06, 0.024]} />
            <meshStandardMaterial color="#5a6e76" roughness={0.5} metalness={0.3} />
          </mesh>
        ))}
        {/* Drive motor on top of scraper */}
        <mesh position={[0, 0.18, -scale.z * 0.34]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.055, 0.055, 0.32, 16]} />
          <meshStandardMaterial color="#2a3c44" roughness={0.35} metalness={0.42} />
        </mesh>
      </group>

      {/* Sludge draw-off trench */}
      <mesh position={[-scale.x * 0.12, 0.13, 0]}>
        <boxGeometry args={[scale.x * 0.58, 0.045, 0.18]} />
        <meshStandardMaterial color="#5a6a63" roughness={0.82} metalness={0.04} />
      </mesh>
    </group>
  );
}

function SludgeStorageModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, colors, selected, alarm } = props;
  const bayWidth = scale.x * 0.92;
  const bayDepth = scale.z * 0.78;
  const wallHeight = Math.max(0.46, height * 0.48);
  const columnHeight = Math.max(1.25, height * 1.1);
  const roofY = columnHeight + 0.12;
  const roofAngle = 0.22;
  const concreteColor = "#6f7c80";
  
  return (
    <group>
      {/* Concrete containment slab with raised edge */}
      <mesh castShadow receiveShadow position={[0, 0.055, 0]}>
        <boxGeometry args={[bayWidth, 0.11, bayDepth]} />
        <meshStandardMaterial color="#59666b" roughness={0.82} metalness={0.04} />
      </mesh>
      <mesh receiveShadow position={[0, 0.12, 0]}>
        <boxGeometry args={[bayWidth * 0.82, 0.018, bayDepth * 0.66]} />
        <meshStandardMaterial color="#738488" roughness={0.86} metalness={0.02} />
      </mesh>

      {/* Low RC containment walls: open front for loader/truck access */}
      <mesh castShadow receiveShadow position={[0, wallHeight / 2 + 0.06, -bayDepth / 2]}>
        <boxGeometry args={[bayWidth, wallHeight, 0.16]} />
        <meshStandardMaterial color={concreteColor} roughness={0.78} metalness={0.04} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`side-wall-${side}`} castShadow receiveShadow position={[side * bayWidth / 2, wallHeight / 2 + 0.06, 0]}>
          <boxGeometry args={[0.16, wallHeight, bayDepth]} />
          <meshStandardMaterial color={concreteColor} roughness={0.78} metalness={0.04} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, 0.24, bayDepth / 2]}>
        <boxGeometry args={[bayWidth * 0.72, 0.22, 0.16]} />
        <meshStandardMaterial color="#78878b" roughness={0.78} metalness={0.03} />
      </mesh>

      {/* Galvanized steel frame */}
      {[-1, 1].flatMap((xSide) =>
        [-1, 1].map((zSide) => (
          <mesh key={`post-${xSide}-${zSide}`} castShadow position={[xSide * bayWidth * 0.46, columnHeight / 2 + 0.06, zSide * bayDepth * 0.43]}>
            <boxGeometry args={[0.12, columnHeight, 0.12]} />
            <meshStandardMaterial color="#6f8087" roughness={0.36} metalness={0.46} />
          </mesh>
        ))
      )}
      {[-1, 1].map((zSide) => (
        <mesh key={`eave-${zSide}`} castShadow position={[0, columnHeight + 0.08, zSide * bayDepth * 0.39]}>
          <boxGeometry args={[bayWidth * 0.88, 0.09, 0.09]} />
          <meshStandardMaterial color="#60727a" roughness={0.38} metalness={0.44} />
        </mesh>
      ))}

      {/* Pitched corrugated metal roof */}
      {[-1, 1].map((side) => (
        <group key={`roof-side-${side}`} position={[side * bayWidth * 0.24, roofY, 0]} rotation={[0, 0, -side * roofAngle]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[bayWidth * 0.58, 0.07, bayDepth * 1.08]} />
            <meshStandardMaterial color="#52666f" roughness={0.54} metalness={0.34} />
          </mesh>
          {[-0.42, -0.25, -0.08, 0.09, 0.26, 0.43].map((z) => (
            <mesh key={`corrugation-${side}-${z}`} position={[0, 0.045, z * bayDepth]}>
              <boxGeometry args={[bayWidth * 0.55, 0.018, 0.018]} />
              <meshStandardMaterial color="#6f8087" roughness={0.44} metalness={0.42} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh castShadow position={[0, roofY + 0.1, 0]}>
        <boxGeometry args={[0.12, 0.1, bayDepth * 0.92]} />
        <meshStandardMaterial color="#3f535c" roughness={0.42} metalness={0.44} />
      </mesh>
      {[-1, 1].map((zSide) => (
        <mesh key={`roof-end-cap-${zSide}`} castShadow position={[0, roofY + 0.02, zSide * bayDepth * 0.48]}>
          <boxGeometry args={[bayWidth * 0.88, 0.08, 0.07]} />
          <meshStandardMaterial color="#4b5e66" roughness={0.56} metalness={0.24} />
        </mesh>
      ))}

      {/* Sludge cake piles visible inside the bay */}
      {[[-0.2, -0.08, 1.3, 0.4, 0.78], [0.18, 0.1, 0.95, 0.34, 0.62], [0.02, -0.26, 0.7, 0.24, 0.48]].map(([x, z, w, h, d], i) => (
        <mesh key={`cake-pile-${i}`} castShadow receiveShadow position={[x * bayWidth, 0.22 + h * 0.22, z * bayDepth]} scale={[w, h, d]}>
          <sphereGeometry args={[0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={i % 2 ? "#4f3a25" : "#60462e"} roughness={0.98} metalness={0.0} />
        </mesh>
      ))}
      {[-0.32, -0.12, 0.08, 0.29].map((x, i) => (
        <mesh key={`cake-lump-${i}`} castShadow position={[x * bayWidth, 0.22, bayDepth * (0.08 + i * 0.045)]}>
          <sphereGeometry args={[0.08 + i * 0.012, 10, 8]} />
          <meshStandardMaterial color="#43301f" roughness={0.98} metalness={0.0} />
        </mesh>
      ))}

      {/* Wheel stops, leachate trench, and incoming cake chute */}
      {[-0.28, 0.28].map((x) => (
        <mesh key={`wheel-stop-${x}`} castShadow position={[x * bayWidth, 0.19, bayDepth * 0.43]}>
          <boxGeometry args={[0.62, 0.14, 0.12]} />
          <meshStandardMaterial color="#2f3b40" roughness={0.7} metalness={0.1} />
        </mesh>
      ))}
      <mesh receiveShadow position={[0, 0.145, bayDepth * 0.3]}>
        <boxGeometry args={[bayWidth * 0.72, 0.035, 0.08]} />
        <meshStandardMaterial color="#29343a" roughness={0.74} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[bayWidth * 0.54, 0.72, -bayDepth * 0.18]} rotation={[0, 0, -0.28]}>
        <boxGeometry args={[0.92, 0.1, 0.36]} />
        <meshStandardMaterial color="#7b5a35" roughness={0.58} metalness={0.16} />
      </mesh>

      {/* Status indicator */}
      <mesh position={[0, wallHeight + 0.24, -bayDepth * 0.5]}>
        <boxGeometry args={[bayWidth * 0.48, 0.08, 0.1]} />
        <meshStandardMaterial color={selected ? colors.accent : alarm ? "#d7463f" : "#5a6a72"} roughness={0.5} />
      </mesh>
    </group>
  );
}

function BarScreenModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, colors } = props;
  return (
    <group>
      <Basin {...props} />
      <group position={[0, height + 0.22, 0]} rotation={[0.55, 0, 0]}>
        <mesh castShadow>
          <boxGeometry args={[scale.x * 0.7, 0.08, scale.z * 0.86]} />
          <meshStandardMaterial color="#2e4650" roughness={0.38} metalness={0.35} />
        </mesh>
        {[-0.28, -0.14, 0, 0.14, 0.28].map((x) => (
          <mesh key={x} position={[x * scale.x, 0.06, 0]}>
            <boxGeometry args={[0.035, 0.05, scale.z * 0.9]} />
            <meshStandardMaterial color="#dce8eb" roughness={0.35} metalness={0.25} />
          </mesh>
        ))}
      </group>
      <mesh position={[scale.x * 0.48, 0.18, -scale.z * 0.36]}>
        <boxGeometry args={[0.22, 0.36, 0.28]} />
        <meshStandardMaterial color={colors.accent} />
      </mesh>
    </group>
  );
}

function DosingSkid(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, selected, alarm, colors } = props;
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[scale.x * 1.1, 0.34, scale.z]} />
        <meshStandardMaterial color="#d8e2e6" roughness={0.55} metalness={0.14} />
      </mesh>
      {[
        [-0.42, "#d99a30"],
        [0, "#2588bd"],
        [0.42, "#b9c5ca"]
      ].map(([x, color]) => (
        <group key={`${x}`} position={[Number(x) * scale.x, 0, 0]}>
          <mesh castShadow position={[0, height * 0.45, 0]}>
            <cylinderGeometry args={[0.18, 0.18, height * 0.9, 24]} />
            <meshStandardMaterial color={String(color)} roughness={0.34} metalness={0.18} />
          </mesh>
          <mesh position={[0, height + 0.03, 0]}>
            <sphereGeometry args={[0.18, 16, 8]} />
            <meshStandardMaterial color={String(color)} roughness={0.34} metalness={0.18} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, height + 0.24, -scale.z * 0.47]}>
        <boxGeometry args={[scale.x, 0.08, 0.18]} />
        <meshStandardMaterial color={selected ? colors.accent : alarm ? "#d7463f" : "#ffffff"} />
      </mesh>
    </group>
  );
}

function LamellaModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, colors } = props;
  return (
    <group>
      <Basin {...props} />
      {[-0.3, -0.1, 0.1, 0.3].map((x) => (
        <mesh key={x} position={[x * scale.x, height + 0.18, 0]} rotation={[0.68, 0, 0]}>
          <boxGeometry args={[0.045, 0.06, scale.z * 0.75]} />
          <meshStandardMaterial color="#8ecfe0" transparent opacity={0.48} roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, height + 0.12, 0]}>
        <boxGeometry args={[scale.x * 0.85, 0.06, scale.z * 0.72]} />
        <meshStandardMaterial color={colors.water} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function MBRModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height } = props;
  return (
    <group>
      <Basin {...props} />
      {[-0.35, -0.18, 0, 0.18, 0.35].map((x) => (
        <mesh key={x} position={[x * scale.x, height + 0.2, 0]} castShadow>
          <boxGeometry args={[0.045, 1.0, scale.z * 0.72]} />
          <meshStandardMaterial color="#23343c" roughness={0.32} metalness={0.26} />
        </mesh>
      ))}
      <mesh position={[scale.x * 0.55, 0.36, scale.z * 0.2]} castShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.55, 18]} />
        <meshStandardMaterial color="#2a82c9" roughness={0.4} metalness={0.25} />
      </mesh>
    </group>
  );
}

function CircularTank({
  radius,
  height,
  colors,
  selected,
  alarm
}: {
  radius: number;
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const mixer = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (mixer.current) mixer.current.rotation.y = clock.elapsedTime * 1.6;
  });

  return (
    <group>
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <cylinderGeometry args={[radius, radius * 1.06, height, 48]} />
        <meshStandardMaterial color={colors.body} roughness={0.55} metalness={0.12} />
      </mesh>
      <mesh position={[0, height + 0.04, 0]}>
        <cylinderGeometry args={[radius * 0.86, radius * 0.86, 0.07, 48]} />
        <meshStandardMaterial color={colors.water} transparent opacity={0.74} roughness={0.2} />
      </mesh>
      {/* Concrete coping ring */}
      <mesh position={[0, height + 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 0.98, 0.055, 12, 48]} />
        <meshStandardMaterial color={selected ? colors.accent : alarm ? "#d7463f" : CONCRETE_LIGHT} roughness={0.5} />
      </mesh>
      <AccessStair position={[radius * 0.28, height + 0.14, -radius - 0.05]} direction="north" run={0.72} width={0.34} steps={5} />
      <group ref={mixer} position={[0, height + 0.18, 0]}>
        <mesh>
          <cylinderGeometry args={[0.035, 0.035, height * 0.9, 12]} />
          <meshStandardMaterial color="#6d7d86" />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <boxGeometry args={[radius * 1.1, 0.045, 0.08]} />
          <meshStandardMaterial color="#39545f" />
        </mesh>
      </group>
    </group>
  );
}

function SiloModel({
  radius,
  height,
  colors,
  selected,
  alarm
}: {
  radius: number;
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const coneHeight = radius * 1.2;
  const cylinderHeight = height - coneHeight;
  const legHeight = coneHeight + 0.2; // Legs hold the cone above ground

  return (
    <group position={[0, legHeight, 0]}>
      {/* Silo Cylinder Body */}
      <mesh castShadow receiveShadow position={[0, cylinderHeight / 2, 0]}>
        <cylinderGeometry args={[radius, radius, cylinderHeight, 32]} />
        <meshStandardMaterial color={colors.body} roughness={0.4} metalness={0.6} />
      </mesh>
      
      {/* Silo Conical Bottom */}
      <mesh castShadow receiveShadow position={[0, -coneHeight / 2, 0]}>
        <cylinderGeometry args={[radius, 0.1, coneHeight, 32]} />
        <meshStandardMaterial color={colors.body} roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Silo Top Dome/Cap */}
      <mesh castShadow receiveShadow position={[0, cylinderHeight, 0]}>
        <sphereGeometry args={[radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={colors.body} roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Legs */}
      {[0, 1, 2, 3].map((i) => {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        const lx = Math.cos(angle) * (radius - 0.1);
        const lz = Math.sin(angle) * (radius - 0.1);
        return (
          <mesh key={`leg-${i}`} castShadow receiveShadow position={[lx, -legHeight / 2, lz]}>
            <cylinderGeometry args={[0.08, 0.08, legHeight, 8]} />
            <meshStandardMaterial color="#556" roughness={0.6} metalness={0.4} />
          </mesh>
        );
      })}

      {/* Safety/Access Ring at the top */}
      <mesh position={[0, cylinderHeight - 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius * 1.05, 0.04, 8, 32]} />
        <meshStandardMaterial color={selected ? colors.accent : alarm ? "#d7463f" : "#889"} roughness={0.5} />
      </mesh>
      
      {/* Pipe connecting bottom of cone */}
      <mesh castShadow receiveShadow position={[0, -coneHeight - 0.1, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.2, 16]} />
        <meshStandardMaterial color="#667" roughness={0.4} />
      </mesh>
    </group>
  );
}

function FilterSkid({
  scale,
  height,
  colors,
  selected,
  alarm,
  mediaColor = "#c6a168",
  vesselColor = "#aab4bd"
}: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
  mediaColor?: string;
  vesselColor?: string;
}) {
  const r = 0.38;
  const bodyH = height * 0.82;
  const skidW = Math.min(scale.x * 0.9, 1.65);
  const skidD = scale.z * 0.88;
  const metalColor = "#5c6b72";

  return (
    <group>

      {/* Pressure vessel body */}
      <mesh castShadow receiveShadow position={[0, height / 2 + 0.14, 0]}>
        <cylinderGeometry args={[r, r, bodyH, 48]} />
        <meshStandardMaterial color={vesselColor} roughness={0.42} metalness={0.28} />
      </mesh>

      {/* Top dished head */}
      <mesh castShadow position={[0, height * 0.96 + 0.05, 0]}>
        <sphereGeometry args={[r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={vesselColor} roughness={0.38} metalness={0.3} />
      </mesh>

      {/* Bottom dished head */}
      <mesh castShadow position={[0, 0.18, 0]} rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={vesselColor} roughness={0.42} metalness={0.26} />
      </mesh>

      {/* Flange rings */}
      {[0.28, height * 0.55, height * 0.92].map((y, i) => (
        <mesh key={i} position={[0, y + 0.14, 0]}>
          <torusGeometry args={[r + 0.01, 0.028, 8, 32]} />
          <meshStandardMaterial color="#8a949a" roughness={0.5} metalness={0.35} />
        </mesh>
      ))}

      {/* Media visible through vessel */}
      <mesh position={[0, height * 0.42 + 0.14, 0]}>
        <cylinderGeometry args={[r * 0.88, r * 0.88, bodyH * 0.42, 32]} />
        <meshStandardMaterial color={mediaColor} transparent opacity={0.72} roughness={0.55} />
      </mesh>

      {/* Sight glass (small window) */}
      <mesh position={[r * 0.98, height * 0.55 + 0.14, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.025, 16]} />
        <meshStandardMaterial color="#d4eaf4" transparent opacity={0.85} roughness={0.1} metalness={0.2} />
      </mesh>
      <mesh position={[r * 1.02, height * 0.55 + 0.14, 0]}>
        <torusGeometry args={[0.055, 0.012, 8, 16]} />
        <meshStandardMaterial color={metalColor} roughness={0.45} metalness={0.45} />
      </mesh>

      {/* Pressure gauge on top */}
      <mesh position={[0.14, height + 0.18, 0]} rotation={[0, 0, -0.3]}>
        <cylinderGeometry args={[0.06, 0.06, 0.025, 16]} />
        <meshStandardMaterial color="#e8ecee" roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh position={[0.14, height + 0.2, 0]} rotation={[0, 0, -0.3]}>
        <torusGeometry args={[0.065, 0.008, 8, 16]} />
        <meshStandardMaterial color="#3a4c55" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* Inlet/outlet pipe stubs */}
      <mesh position={[0, height * 0.82 + 0.14, -r - 0.08]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.22, 12]} />
        <meshStandardMaterial color={metalColor} roughness={0.4} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.28, r + 0.08]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.22, 12]} />
        <meshStandardMaterial color={metalColor} roughness={0.4} metalness={0.4} />
      </mesh>

      {/* Valve handwheel */}
      <mesh position={[0, 0.28, r + 0.22]}>
        <torusGeometry args={[0.065, 0.012, 6, 16]} />
        <meshStandardMaterial color="#d04040" roughness={0.6} metalness={0.15} />
      </mesh>

      {/* Support legs */}
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} castShadow position={[x, 0.14, -0.28]}>
          <cylinderGeometry args={[0.03, 0.03, 0.2, 8]} />
          <meshStandardMaterial color={metalColor} roughness={0.4} metalness={0.4} />
        </mesh>
      ))}
      {[-0.22, 0.22].map((x) => (
        <mesh key={`b-${x}`} castShadow position={[x, 0.14, 0.28]}>
          <cylinderGeometry args={[0.03, 0.03, 0.2, 8]} />
          <meshStandardMaterial color={metalColor} roughness={0.4} metalness={0.4} />
        </mesh>
      ))}

      <AccessStair position={[r + 0.05, height * 0.88, 0]} direction="east" run={0.68} width={0.32} steps={5} />
    </group>
  );
}

function OzoneSkid(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, colors, selected, alarm } = props;
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.16, 0]}>
        <boxGeometry args={[scale.x * 1.15, 0.3, scale.z]} />
        <meshStandardMaterial color="#dce5e9" />
      </mesh>
      <mesh castShadow position={[-scale.x * 0.28, height * 0.55, 0]}>
        <cylinderGeometry args={[0.18, 0.18, height * 1.05, 24]} />
        <meshStandardMaterial color="#d9e2e6" roughness={0.38} metalness={0.22} />
      </mesh>
      <mesh castShadow position={[scale.x * 0.23, height * 0.48, 0]}>
        <boxGeometry args={[0.55, height * 0.85, 0.5]} />
        <meshStandardMaterial color="#f5f8fa" roughness={0.5} metalness={0.1} />
      </mesh>
      <Text position={[scale.x * 0.23, height * 0.75, -0.27]} rotation={[0, 0, 0]} fontSize={0.2} color="#2a82c9">
        O3
      </Text>
      <mesh position={[0, height + 0.18, -scale.z * 0.46]}>
        <boxGeometry args={[scale.x, 0.08, 0.18]} />
        <meshStandardMaterial color={selected ? colors.accent : alarm ? "#d7463f" : "#ffffff"} />
      </mesh>
    </group>
  );
}

function MonitoringSkid(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, colors, selected, alarm } = props;
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, height * 0.42, 0]}>
        <boxGeometry args={[scale.x * 0.9, height * 0.84, scale.z * 0.75]} />
        <meshStandardMaterial color="#eef3f5" roughness={0.45} metalness={0.12} />
      </mesh>
      <mesh position={[0, height * 0.55, -scale.z * 0.39]}>
        <boxGeometry args={[scale.x * 0.48, height * 0.34, 0.04]} />
        <meshStandardMaterial color="#10242c" roughness={0.28} metalness={0.18} />
      </mesh>
      <mesh position={[scale.x * 0.38, height + 0.15, 0]}>
        <cylinderGeometry args={[0.04, 0.04, height * 0.85, 10]} />
        <meshStandardMaterial color={colors.accent} />
      </mesh>
      <mesh position={[0, height + 0.1, -scale.z * 0.43]}>
        <boxGeometry args={[scale.x * 0.8, 0.07, 0.16]} />
        <meshStandardMaterial color={selected ? colors.accent : alarm ? "#d7463f" : "#ffffff"} />
      </mesh>
    </group>
  );
}

function SamplerSkid(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, colors, selected, alarm } = props;
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.16, 0]}>
        <boxGeometry args={[scale.x * 1.05, 0.32, scale.z * 0.95]} />
        <meshStandardMaterial color="#d8e2e6" />
      </mesh>
      <mesh castShadow position={[0, height * 0.5, 0]}>
        <boxGeometry args={[scale.x * 0.42, height, scale.z * 0.48]} />
        <meshStandardMaterial color="#edf3f5" roughness={0.45} metalness={0.16} />
      </mesh>
      <mesh castShadow position={[-scale.x * 0.32, height * 0.33, 0]}>
        <cylinderGeometry args={[0.12, 0.12, height * 0.62, 18]} />
        <meshStandardMaterial color="#9eb0b7" />
      </mesh>
      <mesh position={[0, height + 0.12, -scale.z * 0.43]}>
        <boxGeometry args={[scale.x * 0.82, 0.07, 0.16]} />
        <meshStandardMaterial color={selected ? colors.accent : alarm ? "#d7463f" : "#ffffff"} />
      </mesh>
    </group>
  );
}

function FlowMeterModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, colors, selected, alarm } = props;
  return (
    <group>
      <mesh castShadow position={[0, 0.42, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, scale.x * 0.9, 18]} />
        <meshStandardMaterial color="#2a82c9" roughness={0.28} metalness={0.34} />
      </mesh>
      <mesh castShadow position={[0, height * 0.55, -0.02]}>
        <cylinderGeometry args={[0.34, 0.34, 0.12, 32]} />
        <meshStandardMaterial color="#edf3f5" roughness={0.34} metalness={0.25} />
      </mesh>
      <mesh position={[0, height * 0.55, -0.09]}>
        <cylinderGeometry args={[0.23, 0.23, 0.03, 32]} />
        <meshStandardMaterial color={colors.accent} emissive={colors.accent} emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, height + 0.12, -scale.z * 0.36]}>
        <boxGeometry args={[scale.x * 0.8, 0.07, 0.16]} />
        <meshStandardMaterial color={selected ? colors.accent : alarm ? "#d7463f" : "#ffffff"} />
      </mesh>
    </group>
  );
}

function FilterPressModel(props: {
  scale: { x: number; z: number };
  height: number;
  colors: { body: string; water: string; accent: string };
  selected: boolean;
  alarm: boolean;
}) {
  const { scale, height, colors, selected, alarm } = props;
  const machineLength = Math.min(scale.x * 0.9, 4.45);
  const machineWidth = Math.min(scale.z * 0.58, 1.46);
  const frameHeight = Math.max(1.08, height * 1.02);
  const pressBlue = "#1d8ff0";
  const deepBlue = "#1460ba";
  const steel = "#aab2b7";
  const plateCount = 24;
  const platePackLength = machineLength * 0.54;
  const plateThickness = platePackLength / plateCount * 0.62;
  const plateHeight = frameHeight * 0.58;
  const plateWidth = machineWidth * 0.72;
  const plateY = 0.34 + plateHeight / 2;
  const plateStart = -platePackLength / 2;

  return (
    <group>
      {/* Chamber filter press skid, sized inside the 5 x 3 m footprint */}
      <mesh castShadow receiveShadow position={[0, 0.045, 0]}>
        <boxGeometry args={[machineLength * 1.03, 0.09, machineWidth * 0.92]} />
        <meshStandardMaterial color="#59666c" roughness={0.7} metalness={0.28} />
      </mesh>

      {/* Blue press frame: legs, top rails, lower rails, and end frames */}
      {[-1, 1].flatMap((xSide) =>
        [-1, 1].map((zSide) => (
          <mesh key={`filter-press-leg-${xSide}-${zSide}`} castShadow position={[xSide * machineLength * 0.47, frameHeight * 0.5 + 0.09, zSide * machineWidth * 0.43]}>
            <boxGeometry args={[0.11, frameHeight, 0.11]} />
            <meshStandardMaterial color={pressBlue} roughness={0.36} metalness={0.36} />
          </mesh>
        ))
      )}
      {[frameHeight + 0.05, frameHeight * 0.62, 0.28].flatMap((y) =>
        [-1, 1].map((zSide) => (
          <mesh key={`filter-press-rail-${y}-${zSide}`} castShadow position={[0, y, zSide * machineWidth * 0.43]}>
            <boxGeometry args={[machineLength * 0.98, y > frameHeight * 0.9 ? 0.11 : 0.075, 0.075]} />
            <meshStandardMaterial color={y === frameHeight * 0.62 ? deepBlue : pressBlue} roughness={0.34} metalness={0.34} />
          </mesh>
        ))
      )}
      {[frameHeight + 0.05, 0.28].flatMap((y) =>
        [-1, 1].map((xSide) => (
          <mesh key={`filter-press-end-${y}-${xSide}`} castShadow position={[xSide * machineLength * 0.47, y, 0]}>
            <boxGeometry args={[0.09, y > frameHeight * 0.9 ? 0.11 : 0.075, machineWidth * 0.86]} />
            <meshStandardMaterial color={pressBlue} roughness={0.34} metalness={0.34} />
          </mesh>
        ))
      )}

      {/* Fixed and moving press heads */}
      {[
        [-machineLength * 0.35, deepBlue, 0.16],
        [machineLength * 0.33, "#d9dee0", 0.13]
      ].map(([x, color, thickness], index) => (
        <mesh key={`filter-press-head-${index}`} castShadow receiveShadow position={[x as number, plateY, 0]}>
          <boxGeometry args={[thickness as number, plateHeight * 1.12, plateWidth * 1.12]} />
          <meshStandardMaterial color={color as string} roughness={0.48} metalness={0.18} />
        </mesh>
      ))}

      {/* Filter plates: thin white chamber plates with dark gasket gaps */}
      {Array.from({ length: plateCount }).map((_, index) => {
        const x = plateStart + (index + 0.5) * (platePackLength / plateCount);
        return (
          <group key={`filter-plate-${index}`} position={[x, plateY, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[plateThickness, plateHeight, plateWidth]} />
              <meshStandardMaterial color={index % 2 === 0 ? "#f4f0de" : "#e8e2cf"} roughness={0.58} metalness={0.02} />
            </mesh>
            <mesh position={[0, 0, -plateWidth * 0.52]}>
              <boxGeometry args={[plateThickness * 0.72, plateHeight * 0.9, 0.012]} />
              <meshStandardMaterial color="#596269" roughness={0.5} metalness={0.2} />
            </mesh>
          </group>
        );
      })}

      {/* Plate suspension bars and comb-like handles visible along the front */}
      {[-1, 1].map((zSide) => (
        <mesh key={`filter-press-suspension-${zSide}`} castShadow position={[0, frameHeight * 0.88, zSide * plateWidth * 0.58]}>
          <boxGeometry args={[platePackLength * 1.18, 0.05, 0.035]} />
          <meshStandardMaterial color={steel} roughness={0.34} metalness={0.5} />
        </mesh>
      ))}
      {Array.from({ length: 18 }).map((_, index) => {
        const x = -platePackLength * 0.47 + (index / 17) * platePackLength * 0.94;
        return (
          <mesh key={`plate-hanger-${index}`} castShadow position={[x, frameHeight * 0.79, -plateWidth * 0.62]}>
            <boxGeometry args={[0.018, 0.22, 0.028]} />
            <meshStandardMaterial color="#cdd4d8" roughness={0.42} metalness={0.3} />
          </mesh>
        );
      })}

      {/* Filtrate drip tray and two collection boxes below the plate pack */}
      <mesh receiveShadow position={[0, 0.23, 0]}>
        <boxGeometry args={[platePackLength * 1.1, 0.05, machineWidth * 0.56]} />
        <meshStandardMaterial color="#69757a" roughness={0.62} metalness={0.22} />
      </mesh>
      {[-0.24, 0.24].map((x) => (
        <mesh key={`filtrate-box-${x}`} castShadow receiveShadow position={[x * machineLength, 0.17, 0]}>
          <boxGeometry args={[machineLength * 0.16, 0.28, machineWidth * 0.34]} />
          <meshStandardMaterial color="#efe9d4" roughness={0.7} metalness={0.04} />
        </mesh>
      ))}

      {/* Hydraulic compression cylinder on the inlet end */}
      <group position={[-machineLength * 0.43, plateY, 0]}>
        <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.13, 0.13, 0.34, 20]} />
          <meshStandardMaterial color="#2b3f48" roughness={0.36} metalness={0.42} />
        </mesh>
        <mesh castShadow position={[0.22, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.055, 0.055, 0.42, 16]} />
          <meshStandardMaterial color="#c5ccd0" roughness={0.18} metalness={0.65} />
        </mesh>
      </group>

      {/* Feed pipe entering the fixed head */}
      <mesh castShadow position={[-machineLength * 0.5, plateY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.055, 0.055, 0.42, 16]} />
        <meshStandardMaterial color="#1688bd" roughness={0.28} metalness={0.42} />
      </mesh>

      {/* Cake discharge chute under the plates */}
      <mesh castShadow receiveShadow position={[0, 0.17, machineWidth * 0.34]} rotation={[0.08, 0, 0]}>
        <boxGeometry args={[platePackLength * 0.92, 0.045, machineWidth * 0.22]} />
        <meshStandardMaterial color="#7c8589" roughness={0.58} metalness={0.24} />
      </mesh>
      <mesh position={[machineLength * 0.2, 0.22, machineWidth * 0.35]}>
        <boxGeometry args={[machineLength * 0.2, 0.055, machineWidth * 0.13]} />
        <meshStandardMaterial color="#5b422f" roughness={0.94} metalness={0.0} />
      </mesh>

      {/* Hydraulic power pack / motor on side skid, matching the reference layout */}
      <group position={[machineLength * 0.58, 0.08, -machineWidth * 0.68]}>
        <mesh receiveShadow position={[0, 0.035, 0]}>
          <boxGeometry args={[0.62, 0.07, 0.42]} />
          <meshStandardMaterial color={deepBlue} roughness={0.45} metalness={0.28} />
        </mesh>
        <mesh castShadow position={[0.05, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.24, 20]} />
          <meshStandardMaterial color="#1f2428" roughness={0.38} metalness={0.4} />
        </mesh>
        <mesh castShadow position={[-0.18, 0.22, 0]}>
          <boxGeometry args={[0.18, 0.2, 0.2]} />
          <meshStandardMaterial color="#4b555a" roughness={0.48} metalness={0.34} />
        </mesh>
        <mesh position={[-0.42, 0.24, 0.1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.026, 0.026, 0.62, 10]} />
          <meshStandardMaterial color="#1688bd" roughness={0.32} metalness={0.35} />
        </mesh>
      </group>

      {/* Compact local control panel */}
      <group position={[machineLength * 0.47, 0.4, machineWidth * 0.38]}>
        <mesh castShadow>
          <boxGeometry args={[0.18, 0.34, 0.14]} />
          <meshStandardMaterial color="#d0c8b8" roughness={0.6} metalness={0.1} />
        </mesh>
        <mesh position={[0.1, 0, 0]}>
          <boxGeometry args={[0.005, 0.26, 0.1]} />
          <meshStandardMaterial color="#c8c0b0" roughness={0.5} metalness={0.15} />
        </mesh>
        <mesh position={[0.103, 0.08, 0]}>
          <boxGeometry args={[0.01, 0.08, 0.08]} />
          <meshStandardMaterial color="#1a2a30" emissive="#1a5a8a" emissiveIntensity={0.15} />
        </mesh>
        <mesh position={[0.105, -0.1, 0]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshStandardMaterial color={alarm ? "#cc3030" : "#30aa40"} emissive={alarm ? "#cc3030" : "#30aa40"} emissiveIntensity={0.4} />
        </mesh>
      </group>

      <DosingEquipmentLabel
        position={[machineLength * 0.5, frameHeight + 0.48, machineWidth * 0.34]}
        equipmentNo="10.1"
        title="Polymer Dosing"
        chemical="Dewatering polymer"
      />

      {/* Status bar */}
      <mesh position={[0, frameHeight + 0.24, -machineWidth * 0.48]}>
        <boxGeometry args={[machineLength * 0.72, 0.07, 0.13]} />
        <meshStandardMaterial color={selected ? colors.accent : alarm ? "#d7463f" : "#e0e0e0"} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Mixer({ height }: { height: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.elapsedTime * 2.1;
  });
  return (
    <group position={[0, height + 0.2, 0]}>
      {/* Motor housing */}
      <mesh castShadow position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.2, 16]} />
        <meshStandardMaterial color="#239b62" roughness={0.4} metalness={0.25} />
      </mesh>
      {/* Motor cooling fins */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={`fin-${i}`} position={[0, 0.22, 0]} rotation={[0, i * Math.PI / 3, 0]}>
          <boxGeometry args={[0.22, 0.14, 0.008]} />
          <meshStandardMaterial color="#1e8456" roughness={0.5} metalness={0.2} />
        </mesh>
      ))}
      {/* Shaft coupling */}
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.08, 12]} />
        <meshStandardMaterial color="#4a5a62" roughness={0.4} metalness={0.45} />
      </mesh>
      {/* Shaft guide bracket */}
      <mesh position={[0, -height * 0.25, 0]}>
        <torusGeometry args={[0.04, 0.012, 8, 16]} />
        <meshStandardMaterial color="#5a6a72" roughness={0.45} metalness={0.35} />
      </mesh>
      {/* Rotating shaft + impeller */}
      <group ref={ref}>
        <mesh>
          <cylinderGeometry args={[0.025, 0.025, height * 0.78, 10]} />
          <meshStandardMaterial color="#617883" roughness={0.35} metalness={0.4} />
        </mesh>
        {/* Impeller blades */}
        <group position={[0, -height * 0.32, 0]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={`blade-${i}`} rotation={[0, i * Math.PI / 2, 0.15]}>
              <boxGeometry args={[0.42, 0.035, 0.06]} />
              <meshStandardMaterial color="#335462" roughness={0.4} metalness={0.35} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

function AlarmBeacon({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 5) * 0.14;
      ref.current.scale.setScalar(pulse);
    }
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.18, 18, 18]} />
      <meshStandardMaterial color="#d7463f" emissive="#8c1d18" emissiveIntensity={1.2} />
    </mesh>
  );
}

function FlowNetwork({
  ids,
  unitMap,
  isRunning,
  color,
  sludge = false
}: {
  ids: string[];
  unitMap: Record<string, TreatmentUnit>;
  isRunning: boolean;
  color: string;
  sludge?: boolean;
}) {
  return (
    <group>
      {ids.slice(0, -1).map((id, index) => {
        const from = unitMap[id];
        const to = unitMap[ids[index + 1]];
        if (!from || !to) return null;
        return <Pipe key={`${id}-${to.id}`} from={from} to={to} color={color} isRunning={isRunning} sludge={sludge} />;
      })}
    </group>
  );
}

function Pipe({ from, to, color, isRunning, sludge }: { from: TreatmentUnit; to: TreatmentUnit; color: string; isRunning: boolean; sludge: boolean }) {
  const fromPos = worldPosition(from);
  const toPos = worldPosition(to);
  const routeKey = `${from.id}->${to.id}`;
  const routePoints = useMemo(() => pipeRoutePoints(from, to, fromPos, toPos, sludge), [from, fromPos.x, fromPos.z, sludge, to, toPos.x, toPos.z]);
  const curve = useMemo(() => pipePolylineCurve(routePoints), [routePoints]);
  const routeLength = useMemo(() => routePointsLength(routePoints), [routePoints]);
  const supportFractions = useMemo(() => (routeLength > 13 ? [0.25, 0.5, 0.75] : routeLength > 7 ? [0.35, 0.7] : routeLength > 4 ? [0.5] : []), [routeLength]);
  const flangeFractions = useMemo(() => (routeLength > 13 ? [0.18, 0.5, 0.82] : routeLength > 7 ? [0.28, 0.72] : routeLength > 4 ? [0.5] : []), [routeLength]);
  const supportPoints = useMemo(() => supportFractions.map((t) => curve.getPointAt(t)), [curve, supportFractions]);
  const showValve = routeLength > 9;
  const valvePoint = useMemo(() => curve.getPointAt(sludge ? 0.42 : 0.68), [curve, sludge]);
  const valveTangent = useMemo(() => curve.getTangentAt(sludge ? 0.42 : 0.68).normalize(), [curve, sludge]);
  const beadRef = useRef<THREE.Mesh>(null);
  const arrowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = isRunning ? (clock.elapsedTime * (sludge ? 0.12 : 0.22)) % 1 : 0.45;
    const point = curve.getPointAt(t);
    if (beadRef.current) beadRef.current.position.copy(point);
    if (arrowRef.current) {
      const arrowT = 0.74;
      const arrowTangent = curve.getTangentAt(Math.min(0.99, arrowT + 0.01));
      arrowRef.current.position.copy(curve.getPointAt(arrowT));
      arrowRef.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arrowTangent.normalize());
    }
  });

  return (
    <group>
      <mesh castShadow>
        <tubeGeometry args={[curve, 30, sludge ? 0.06 : 0.075, 12, false]} />
        <meshStandardMaterial color={color} roughness={0.22} metalness={0.42} envMapIntensity={0.5} />
      </mesh>
      {/* Inline pipe flanges */}
      {flangeFractions.map((t) => {
        const pt = curve.getPointAt(t);
        const tg = curve.getTangentAt(t).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg);
        return (
          <mesh key={`flange-${t}`} position={pt} quaternion={q}>
            <cylinderGeometry args={[sludge ? 0.1 : 0.12, sludge ? 0.1 : 0.12, 0.025, 16]} />
            <meshStandardMaterial color="#7a8890" roughness={0.4} metalness={0.5} />
          </mesh>
        );
      })}
      {supportPoints.map((point, index) => (
        <PipeSupport key={`${routeKey}-support-${index}`} point={point} sludge={sludge} />
      ))}
      {showValve && <ValveAssembly point={valvePoint} tangent={valveTangent} color={color} sludge={sludge} />}
      <mesh ref={beadRef}>
        <sphereGeometry args={[sludge ? 0.13 : 0.16, 16, 16]} />
        <meshStandardMaterial color={sludge ? "#7b5a35" : "#69d9eb"} emissive={color} emissiveIntensity={0.35} />
      </mesh>
      <mesh ref={arrowRef}>
        <coneGeometry args={[0.2, 0.46, 18]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

function pipePolylineCurve(points: THREE.Vector3[]) {
  const path = new THREE.CurvePath<THREE.Vector3>();
  points.slice(0, -1).forEach((point, index) => {
    path.add(new THREE.LineCurve3(point, points[index + 1]));
  });
  return path;
}

function routePointsLength(points: THREE.Vector3[]) {
  return points.slice(0, -1).reduce((sum, point, index) => sum + point.distanceTo(points[index + 1]), 0);
}

function PipeSupport({ point, sludge }: { point: THREE.Vector3; sludge: boolean }) {
  return (
    <group position={[point.x, 0.05, point.z]}>
      <mesh castShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[0.08, 0.36, 0.08]} />
        <meshStandardMaterial color="#5f6d74" roughness={0.48} metalness={0.26} />
      </mesh>
      <mesh castShadow position={[0, 0.38, 0]}>
        <boxGeometry args={[0.42, 0.06, 0.14]} />
        <meshStandardMaterial color={sludge ? "#8a663e" : "#6f95a2"} roughness={0.42} metalness={0.26} />
      </mesh>
      <mesh position={[0, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[sludge ? 0.09 : 0.11, 0.01, 8, 24]} />
        <meshStandardMaterial color="#cfd9dd" roughness={0.35} metalness={0.34} />
      </mesh>
    </group>
  );
}

function ValveAssembly({
  point,
  tangent,
  color,
  sludge
}: {
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  color: string;
  sludge: boolean;
}) {
  const angle = Math.atan2(tangent.z, tangent.x);
  return (
    <group position={point} rotation={[0, -angle, 0]}>
      {/* Valve body (butterfly/gate body) */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.26, 0.18, 0.22]} />
        <meshStandardMaterial color={color} roughness={0.28} metalness={0.4} />
      </mesh>
      {/* Body flange rings */}
      {[-0.18, 0.18].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[sludge ? 0.1 : 0.12, sludge ? 0.1 : 0.12, 0.035, 18]} />
          <meshStandardMaterial color="#808a90" roughness={0.3} metalness={0.45} />
        </mesh>
      ))}
      {/* Flange bolts */}
      {[-0.18, 0.18].map((x) =>
        [0, 1, 2, 3].map((b) => {
          const r = sludge ? 0.08 : 0.1;
          const a = (b * Math.PI) / 2;
          return (
            <mesh key={`bolt-${x}-${b}`} position={[x, Math.sin(a) * r, Math.cos(a) * r]}>
              <sphereGeometry args={[0.012, 6, 6]} />
              <meshStandardMaterial color="#a0a8ae" roughness={0.35} metalness={0.55} />
            </mesh>
          );
        })
      )}
      {/* Valve stem */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.12, 8]} />
        <meshStandardMaterial color="#b0b8be" roughness={0.2} metalness={0.6} />
      </mesh>
      {/* Yoke bracket */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.06, 0.04, 0.06]} />
        <meshStandardMaterial color="#707a80" roughness={0.4} metalness={0.4} />
      </mesh>
      {/* Handwheel */}
      <mesh position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.11, 0.012, 8, 26]} />
        <meshStandardMaterial color={SAFETY_YELLOW} roughness={0.3} metalness={0.3} />
      </mesh>
      {/* Handwheel spokes */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={`spoke-${i}`} position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, (i * Math.PI) / 2]}>
          <cylinderGeometry args={[0.008, 0.008, 0.2, 4]} />
          <meshStandardMaterial color={SAFETY_YELLOW} roughness={0.32} metalness={0.28} />
        </mesh>
      ))}
    </group>
  );
}

function PipeTerminal({ point, color, sludge }: { point: THREE.Vector3; color: string; sludge: boolean }) {
  const r = sludge ? 0.11 : 0.13;
  return (
    <group position={point}>
      {/* Terminal ball */}
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[sludge ? 0.075 : 0.085, 14, 14]} />
        <meshStandardMaterial color={color} roughness={0.25} metalness={0.4} />
      </mesh>
      {/* Flange plate */}
      <mesh castShadow receiveShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r, 0.06, 20]} />
        <meshStandardMaterial color="#808a90" roughness={0.3} metalness={0.45} />
      </mesh>
      {/* Bolt circle */}
      {[0, 1, 2, 3, 4, 5].map((b) => {
        const a = (b * Math.PI * 2) / 6;
        return (
          <mesh key={`tb-${b}`} position={[Math.cos(a) * r * 0.78, 0, Math.sin(a) * r * 0.78]}>
            <sphereGeometry args={[0.012, 6, 6]} />
            <meshStandardMaterial color="#a0a8ae" roughness={0.3} metalness={0.55} />
          </mesh>
        );
      })}
    </group>
  );
}

function tankWallExtent(unit: TreatmentUnit, axis: "x" | "z" = "x"): number | null {
  if (unit.id === "sludge-holding") return 0.35; // Match SiloModel visual radius
  if (unit.id === "sand-filter" || unit.id === "carbon-filter") return 0.38;
  if (unit.id === "sludge-storage") return axis === "x" ? unit.w * 0.46 : unit.h * 0.39;
  return null;
}

function pipeRoutePoints(from: TreatmentUnit, to: TreatmentUnit, fromPos: THREE.Vector3, toPos: THREE.Vector3, sludge: boolean) {
  const fromScale = unitScale(from);
  const toScale = unitScale(to);
  const key = `${from.id}->${to.id}`;
  const waterY = 0.78;
  const tertiaryY = 0.62;
  const sludgeY = 0.22;

  /* === Sludge pipes === */
  if (key === "secondary-clarifier->primary-clarifier") {
    /* RAS: shortest low-level return from rectangular secondary up to primary clarifier. */
    const out = new THREE.Vector3(fromPos.x, sludgeY, fromPos.z - fromScale.z / 2 - 0.14);
    const inn = new THREE.Vector3(toPos.x, sludgeY, toPos.z + toScale.z / 2 + 0.14);
    return [
      out,
      new THREE.Vector3(inn.x, sludgeY, out.z),
      inn
    ];
  }

  if (key === "primary-clarifier->sludge-holding") {
    /* Primary sludge: rectangular primary east-south corner to circular sludge-holding north pole. */
    const sludgeR = tankWallExtent(to, "z") ?? toScale.z / 2;
    const out = new THREE.Vector3(fromPos.x + fromScale.x / 2 + 0.12, sludgeY, fromPos.z + fromScale.z / 2 + 0.18);
    const inn = new THREE.Vector3(toPos.x, sludgeY, toPos.z - sludgeR - 0.05);
    /* Route ALONGSIDE Basin 5 (which is between Basin 3 and Basin 8) to avoid going under it */
    return [
      out,
      new THREE.Vector3(out.x, sludgeY, toPos.z - sludgeR - 0.6), // Route north (along Z) on the right side of Basin 5
      new THREE.Vector3(inn.x, sludgeY, toPos.z - sludgeR - 0.6), // Turn west to align with Sludge Holding
      inn
    ];
  }

  if (key === "sludge-holding->sludge-press") {
    /* Sludge holding (circular) west pole → press east face. */
    const sludgeR = tankWallExtent(from, "x") ?? fromScale.x / 2;
    const out = new THREE.Vector3(fromPos.x - sludgeR - 0.05, sludgeY, fromPos.z);
    const inn = new THREE.Vector3(toPos.x + toScale.x / 2 + 0.12, sludgeY, toPos.z);
    return [
      out,
      new THREE.Vector3((out.x + inn.x) / 2, sludgeY, out.z),
      new THREE.Vector3((out.x + inn.x) / 2, sludgeY, inn.z),
      inn
    ];
  }

  if (key === "sludge-press->sludge-storage") {
    /* Press → storage: direct cake/sludge route between adjacent equipment. */
    const storageR = tankWallExtent(to, "x") ?? toScale.x / 2;
    const out = new THREE.Vector3(fromPos.x - fromScale.x / 2 - 0.12, sludgeY, fromPos.z);
    const inn = new THREE.Vector3(toPos.x + storageR + 0.05, sludgeY, toPos.z);
    return [
      out,
      new THREE.Vector3((out.x + inn.x) / 2, sludgeY, out.z),
      new THREE.Vector3((out.x + inn.x) / 2, sludgeY, inn.z),
      inn
    ];
  }

  /* === Water pipes === */
  if (key === "secondary-clarifier->sand-filter") {
    /* Secondary → sand filter: rack at filter x, drop Y at top, run south to vessel north pole. */
    const vesselR = tankWallExtent(to, "z") ?? toScale.z / 2;
    const out = new THREE.Vector3(fromPos.x + fromScale.x / 2 + 0.14, waterY, fromPos.z + fromScale.z / 2 + 0.18);
    const inn = new THREE.Vector3(toPos.x, tertiaryY, toPos.z - vesselR - 0.05);
    const rackX = inn.x;
    return [
      out,
      new THREE.Vector3(rackX, waterY, out.z),
      new THREE.Vector3(rackX, tertiaryY, out.z),
      inn
    ];
  }

  if (key === "sand-filter->carbon-filter") {
    /* Sand vessel west pole → carbon vessel east pole. */
    const fromR = tankWallExtent(from, "x") ?? fromScale.x / 2;
    const toR = tankWallExtent(to, "x") ?? toScale.x / 2;
    const out = new THREE.Vector3(fromPos.x - fromR - 0.05, tertiaryY, fromPos.z);
    const inn = new THREE.Vector3(toPos.x + toR + 0.05, tertiaryY, toPos.z);
    return [
      out,
      inn
    ];
  }

  const start = new THREE.Vector3(fromPos.x, unitElevation(from.id) + (sludge ? 0.52 : 0.9), fromPos.z);
  const end = new THREE.Vector3(toPos.x, unitElevation(to.id) + (sludge ? 0.5 : 0.9), toPos.z);
  const mid = new THREE.Vector3((start.x + end.x) / 2, (start.y + end.y) / 2 + (sludge ? 0.02 : 0.05), (start.z + end.z) / 2);
  return [start, mid, end];
}

function SampleMarker({ label, position, color }: { label: string; position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh receiveShadow position={[0, 0.012, 0]}>
        <boxGeometry args={[1.05, 0.024, 0.46]} />
        <meshStandardMaterial color="#eef4f5" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[-0.36, 0.24, -0.16]}>
        <cylinderGeometry args={[0.025, 0.025, 0.46, 10]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh castShadow position={[0.36, 0.24, -0.16]}>
        <cylinderGeometry args={[0.025, 0.025, 0.46, 10]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh castShadow position={[0, 0.5, -0.16]}>
        <boxGeometry args={[0.96, 0.42, 0.045]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.725, -0.16]}>
        <boxGeometry args={[1.02, 0.035, 0.055]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.12} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <sphereGeometry args={[0.11, 14, 14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.32} />
      </mesh>
      <Html position={[0, 0.5, -0.19]} center distanceFactor={14} zIndexRange={[80, 0]}>
        <div className="sample-label sample-label--mounted">{label}</div>
      </Html>
    </group>
  );
}
