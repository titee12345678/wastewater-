import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, BookOpen, CheckCircle2, ChevronUp, Clock3, Droplet, Gauge, Globe2, Map, Maximize2, Minimize2, Pause, Play, RotateCcw, SkipBack, SkipForward, Square, SlidersHorizontal, X } from "lucide-react";
import { treatmentUnits, unitsById } from "./data/units";
import { baseControls, scenarios } from "./data/scenarios";
import { calculateSizing } from "./simulation/sizing";
import { applyScenarioControls, runSimulation } from "./simulation/model";
import { Plant3D } from "./components/Plant3D";
import type { ComplianceResult, ParameterKey, SimulationControls, SimulationResult, TreatmentUnit, ViewAngle } from "./types";

const sizing = calculateSizing(500);

const controlMeta: Array<{
  key: keyof SimulationControls;
  label: string;
  thai: string;
  min?: number;
  max?: number;
  suffix?: string;
}> = [
  { key: "inletShock", label: "Inlet shock", thai: "โหลดแกว่ง", suffix: "%" },
  { key: "dyeColorLoad", label: "Dye color load", thai: "โหลดสี", suffix: "%" },
  { key: "codBodLoad", label: "COD/BOD load", thai: "สารอินทรีย์", suffix: "%" },
  { key: "sbLoad", label: "Sb load", thai: "Antimony", suffix: "%" },
  { key: "coagulantDose", label: "Coagulant dose", thai: "PAC/FeCl3", suffix: "%" },
  { key: "polymerDose", label: "Polymer dose", thai: "พอลิเมอร์", suffix: "%" },
  { key: "mbrHealth", label: "Aeration health", thai: "สภาพบ่อเติมอากาศ", suffix: "%" },
  { key: "airFlow", label: "Air flow", thai: "อากาศ", suffix: "%" },
  { key: "gacCondition", label: "Carbon condition", thai: "ถังคาร์บอน", suffix: "%" },
  { key: "ozoneDose", label: "Polishing reserve", thai: "กำลัง polishing", suffix: "%" },
  { key: "finalPhCorrection", label: "Final pH correction", thai: "ปรับ pH/Sb", suffix: "%" }
];

const focusParameters: ParameterKey[] = ["pH", "cod", "bod", "tss", "color436", "color525", "color620", "sb", "cu", "nh4", "tn", "aox"];
const FLOW_TOUR_DWELL_MS = 6000;
const FLOW_TOUR_OVERVIEW_ID = "__overview";
const flowTourIds = [
  "inlet",
  "holding-tank",
  "equalization",
  "__eq-chemical",
  "primary-clarifier",
  "__primary-chemical",
  "aeration",
  "secondary-clarifier",
  "sand-filter",
  "carbon-filter",
  "sludge-holding",
  "sludge-press",
  "sludge-storage"
];
const flowTourSteps = [...flowTourIds, FLOW_TOUR_OVERVIEW_ID];

const tourNotes: Record<string, string> = {
  inlet: "จุดรับน้ำเสียจากโรงงานก่อนเข้าสู่ระบบบำบัด ใช้ดู flow จริง, สี, กลิ่น, pH เบื้องต้น และเป็นจุดเก็บตัวอย่าง S1 เพื่อเทียบกับน้ำหลังบำบัด จุดนี้ยังไม่กำจัดมลพิษหลัก แต่สำคัญมากสำหรับการรู้ว่าโหลดที่เข้าระบบวันนี้หนักแค่ไหน",
  "holding-tank": "ถังพักทำหน้าที่ buffer น้ำเสียก่อนส่งต่อ ขนาด target 120 m3 ใช้ลดการกระชากของ flow และความเข้มข้น ถ้าไม่มีจุดนี้ downstream จะเจอ shock load ง่าย ระดับน้ำและ transfer pump ต้องนิ่งเพื่อให้ Equalization ทำงานต่อเนื่อง จุดนี้ปกติยังไม่ใส่เคมีหลัก",
  equalization: "บ่อ Equalization รวมการปรับ pH ในตัว ขนาด 500 m3 หรือประมาณ 13 x 13 x 3 m ทำให้น้ำเสียมี pH, สี และ COD เฉลี่ยสม่ำเสมอก่อนเข้าตกตะกอน มีถัง dosing กรด/ด่างด้านข้างและมอเตอร์กวนเพื่อกระจายเคมี จุดนี้เป็นหัวใจของการกัน batch shock จากงานย้อม",
  "primary-clarifier": "บ่อตกตะกอนขนาด 5 x 8 x 3 m รับ PAC/coagulant และ polymer จากถัง dosing ด้านข้าง เพื่อจับสี ตะกอนหนัก และโลหะบางชนิด ตะกอนที่ตกลงก้นบ่อจะถูกส่งไปสาย sludge ถ้าจุดนี้ dose ต่ำ TSS และสีจะไหลไปกดภาระบ่อเติมอากาศ",
  aeration: "บ่อเติมอากาศขนาด 12 x 18 x 3 m เป็นหน่วยชีวภาพหลัก จุลินทรีย์ใช้ DO จาก blower/diffuser เพื่อย่อย BOD/COD และลด NH4-N มีถัง dosing ด้านข้างสำหรับ nutrient, pH support หรือเคมีช่วยควบคุมสภาพบ่อเมื่อจำเป็น ต้องดู air flow, DO, foam, MLSS และสุขภาพจุลินทรีย์",
  "secondary-clarifier": "บ่อ secondary clarification ขนาด 7 x 7 x 3 m แยก activated sludge ออกจากน้ำใสหลัง aeration มีแหวนรับน้ำใสและท่อ RAS ส่งตะกอนจากบ่อ 5 กลับไปบ่อ 3 เท่านั้น ไม่มีท่อตรงจากบ่อ 5 ไปบ่อ 8 ใน layout นี้ ถ้า sludge blanket สูง น้ำออกจะขุ่นและ TSS fail",
  "sand-filter": "ถังกรองทรายเป็น pressure vessel สำหรับดักตะกอนละเอียดที่หลุดจาก secondary clarifier ช่วยลด turbidity และป้องกันไม่ให้ carbon filter อุดตันเร็ว ต้องดู differential pressure และแผน backwash",
  "carbon-filter": "ถังคาร์บอนใช้ activated carbon ดูดซับสี สารอินทรีย์ตกค้าง กลิ่น และ AOX บางส่วน เป็นจุด polishing ก่อน discharge ถ้า media หมดอายุ สี/COD จะเริ่มหลุด ต้องเปลี่ยนหรือ regenerate media ตามค่า breakthrough",
  "sludge-holding": "บ่อพักตะกอนขนาด 40 m3 รับตะกอนจากบ่อ 3 primary clarifier ก่อนเข้าเครื่อง press ทำให้ feed sludge สม่ำเสมอ ต้องกวนช้าเพื่อกันตะกอนนอนก้นและควบคุมกลิ่น/น้ำล้นกลับระบบ จุดนี้เน้นพักและป้อนตะกอน ไม่ใช่จุด dosing หลัก",
  "sludge-press": "เครื่อง press อัดรีดน้ำออกจากตะกอนให้เป็น cake มีถัง dosing polymer สำหรับช่วย dewatering ต้องดูความชื้น cake, filtrate, feed consistency และความสะอาดสายพาน/สกรู น้ำที่รีดออกควรถูกส่งกลับระบบบำบัด",
  "sludge-storage": "ที่พักตะกอนเก็บ sludge cake เพื่อรอชั่งน้ำหนักและส่งกำจัด ต้องมีพื้นกันซึม หลังคา/ระบบกันน้ำฝน และเอกสาร manifest เพราะ ZDHC ให้ความสำคัญกับการจัดการ sludge ไม่ใช่แค่น้ำทิ้ง",
  "__eq-chemical": "ชุดเตรียมเคมี pH ของบ่อ EQ ประกอบด้วย 2 ถังกวน (ถังเปิดมีมอเตอร์กวน) สำหรับเตรียมสารละลาย NaOH/กรด → ปั๊ม P-03 (2HP×2) ส่งไปถังพักเคมี 2 ถัง → แล้วปั๊ม P-04 (2HP×2) จ่ายเข้าบ่อ EQ ถ้า dose ไม่พอ pH จะไม่เข้าเป้า 6.5-8.0 ก่อนเข้าบ่อตกตะกอน",
  "__primary-chemical": "ชุดเตรียมเคมีตกตะกอนของบ่อ 3 Primary Clarifier ประกอบด้วย 2 ถังกวน (ถังเปิดมีมอเตอร์กวน) สำหรับเตรียม PAC/Polymer → ปั๊ม P-05 (2HP×2) ส่งไปถังพัก 2 ถัง → แล้วปั๊ม P-06 (2HP×2) จ่ายเข้าบ่อตกตะกอน ถ้า dose ต่ำ สีและ TSS จะหลุดไปกดภาระบ่อเติมอากาศ"
};

const tourSizeSpecs: Record<string, string> = {
  "holding-tank": "120 m3 target; 3 x 5 x 3 m per cell/module",
  equalization: "500 m3; 13 x 13 x 3 m",
  "primary-clarifier": "5 x 8 x 3 m",
  aeration: "12 x 18 x 3 m",
  "secondary-clarifier": "7 x 7 x 3 m",
  "sludge-holding": "40 m3"
};

const tourChemicalNotes: Record<string, string> = {
  "holding-tank": "ปกติไม่ใส่เคมีหลัก ใช้พักน้ำและคุม flow ก่อนใช้ transfer pump ยิงขึ้นเข้าบ่อ EQ ไม่ใช่ระบบน้ำล้น",
  equalization: "มีถัง dosing กรด/ด่างสำหรับปรับ pH พร้อม pH probe และมอเตอร์กวนให้เคมีกระจายทั่วบ่อ",
  "primary-clarifier": "มีถัง dosing PAC/coagulant และ polymer เพื่อจับตะกอน สี และโลหะ ก่อนตกตะกอน",
  aeration: "มีถัง dosing ด้านข้างสำหรับ nutrient, pH support หรือเคมีช่วยควบคุมสภาพบ่อเมื่อจำเป็น",
  "secondary-clarifier": "โดยปกติไม่ใช่จุดใส่เคมีหลัก เน้นแยกน้ำใสกับตะกอน และส่งตะกอนกลับบ่อ 3 ผ่านท่อ RAS เส้นเดียว",
  "sludge-holding": "เน้นพักตะกอนก่อน press; จุด dosing polymer หลักอยู่ที่หน้าเครื่อง press",
  "sludge-press": "มีถัง dosing polymer เพื่อช่วยรีดน้ำออกจากตะกอนให้ cake แห้งขึ้น",
  "__eq-chemical": "ถังกวนเปิด (MX) 2 ถังพร้อมมอเตอร์กวน → ปั๊ม P-03 (2HP×2) → ถังพัก (ST) 2 ถัง → ปั๊ม P-04 (2HP×2) → จ่ายเข้าบ่อ EQ",
  "__primary-chemical": "ถังกวนเปิด (MX) 2 ถังพร้อมมอเตอร์กวน → ปั๊ม P-05 (2HP×2) → ถังพัก (ST) 2 ถัง → ปั๊ม P-06 (2HP×2) → จ่ายเข้าบ่อตกตะกอน"
};

const waterFlowRoute = ["S1", "1", "2", "3", "4", "5", "6", "7", "S2"];
const rasFlowRoute = ["5", "3"];
const sludgeFlowRoute = ["3", "8", "9", "10", "S3"];

function unitDisplayBadge(unit: TreatmentUnit) {
  return unit.id === "inlet" ? "S1" : String(unit.order);
}

function FlowRouteMap() {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isExpanded) {
    return (
      <button 
        className="flow-route-map flow-route-map--collapsed" 
        onClick={() => setIsExpanded(true)}
        aria-label="Show flow route map"
      >
        <Map size={14} />
        <span>ดู Flow Route Map</span>
      </button>
    );
  }

  return (
    <div className="flow-route-map" aria-label="Correct process pipe flow">
      <div className="flow-route-map__header">
        <strong>Flow Route Map</strong>
        <button onClick={() => setIsExpanded(false)} aria-label="Collapse"><ChevronUp size={14} /></button>
      </div>
      <FlowRouteRow label="สายน้ำ" english="Water" nodes={waterFlowRoute} tone="water" />
      <FlowRouteRow label="RAS" english="Return" nodes={rasFlowRoute} tone="sludge" />
      <FlowRouteRow label="ตะกอน" english="Sludge" nodes={sludgeFlowRoute} tone="sludge" />
      <div className="flow-route-map__note">บ่อ 5 ส่งตะกอนกลับบ่อ 3 เท่านั้น ไม่มีท่อตรงไปบ่อ 8</div>
    </div>
  );
}

function FlowRouteRow({ label, english, nodes, tone }: { label: string; english: string; nodes: string[]; tone: "water" | "sludge" }) {
  return (
    <div className={`flow-route-map__row flow-route-map__row--${tone}`}>
      <strong>
        {label}
        <span>{english}</span>
      </strong>
      <div className="flow-route-map__sequence">
        {nodes.map((node, index) => (
          <span key={`${tone}-${node}-${index}`} className="flow-route-map__step">
            <span className="flow-route-map__node">{node}</span>
            {index < nodes.length - 1 && <span className="flow-route-map__arrow">→</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

type ManualSection = {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  points: string[];
  checks?: string[];
};

const manualSections: ManualSection[] = [
  {
    id: "overview",
    title: "ภาพรวมระบบบำบัด",
    subtitle: "500 m3/day ETP process overview",
    summary:
      "ระบบนี้จำลอง ETP สำหรับน้ำเสียโรงงานสิ่งทอ กำลังบำบัด 500 m3/day หรือเฉลี่ย 20.83 m3/hr น้ำเสียจะไหลจากทางน้ำเข้า S1 ไปถังพัก, บ่อ EQ+pH, บ่อตกตะกอน, บ่อเติมอากาศ, บ่อเคลียร์ตะกอน, ถังกรองทราย, ถังคาร์บอน และจุดน้ำหลังบำบัด S2 ส่วนตะกอนจะถูกแยกไปบ่อพักตะกอน, เครื่อง press และที่พักตะกอน S3",
    points: [
      "S1 น้ำเข้าไม่ใช่บ่อ เป็นจุดรับน้ำเสียและจุดเก็บตัวอย่างก่อนบำบัด ใช้เทียบกับ S2 หลังบำบัด",
      "หมายเลขบ่อจริงเริ่มที่ 1 Holding Tank เพราะเป็นถังแรกที่รับและพักน้ำเสีย",
      "บ่อ 2-5 เป็นสาย process หลักที่ควรดูเป็นลำดับ: Holding, EQ+pH, Primary Clarifier, Aeration, Secondary Clarifier",
      "สีน้ำฟ้าหมายถึงเส้นน้ำหรือน้ำใส สีน้ำตาลหมายถึงเส้นตะกอนหรือ sludge line",
      "Flow Tour ใช้สอนทีมงานทีละจุด กล้องจะหยุด 6 วินาทีต่อขั้นและวนอัตโนมัติ"
    ],
    checks: [
      "ดูว่า flow น้ำเดินครบจาก S1 ไป S2",
      "ดูว่าเส้นตะกอนไม่ปนกับเส้นน้ำ",
      "ดูค่า ZDHC ที่ panel ด้านล่างว่าผ่านหรือไม่ผ่าน"
    ]
  },
  {
    id: "water-line",
    title: "ขบวนการน้ำเสีย",
    subtitle: "Water treatment line",
    summary:
      "ขบวนการน้ำเสียคือสายหลักของระบบ เริ่มจากรับน้ำเสียจากโรงงาน เข้าถังพักเพื่อกัน flow surge แล้วปั๊มขึ้น EQ เพื่อปรับ pH และผสมให้สม่ำเสมอ จากนั้นจึงตกตะกอน, เติมอากาศ, แยกตะกอนชีวภาพ และกรอง polishing ก่อนปล่อยออก",
    points: [
      "S1 Influent Inlet: ทางน้ำเสียเข้าและตะแกรงหยาบ ดักของแข็งชิ้นใหญ่เบื้องต้นก่อนเข้าถังพัก จุดนี้ไม่ถือเป็นบ่อบำบัด",
      "1 Holding Tank: ถังพักน้ำเสียประมาณ 120 m3 ใช้กันน้ำเข้ากระชาก มี transfer pump ยิงขึ้นไปบ่อ EQ ไม่ใช่ระบบน้ำล้น",
      "2 Equalization + pH: บ่อ EQ+pH ขนาด 500 m3 ประมาณ 13 x 13 x 3 m ผสมให้น้ำเสียมี pH, สี, COD และ flow สม่ำเสมอ มี pH probe, มอเตอร์กวน และถัง dosing กรด/ด่าง",
      "3 Primary Clarifier: บ่อตกตะกอน 5 x 8 x 3 m ใช้ PAC/coagulant และ polymer ช่วยจับตะกอน สี และโลหะบางส่วนก่อนเข้าชีวภาพ",
      "4 Aeration Tank: บ่อเติมอากาศ 12 x 18 x 3 m ใช้จุลินทรีย์ย่อย BOD/COD และลด NH4-N ต้องควบคุม air flow, DO, MLSS และสภาพฟอง",
      "5 Secondary Clarifier: บ่อเคลียร์ตะกอน 7 x 7 x 3 m แยกน้ำใสออกจาก activated sludge น้ำใสไปถังกรองทราย ส่วนตะกอนกลับไปบ่อ 3 ผ่านท่อ RAS เส้นเดียว",
      "6 Sand Filter: ถังกรองทรายดักตะกอนละเอียด ลด TSS/turbidity ก่อนเข้าคาร์บอน",
      "7 Carbon Filter: ถังคาร์บอนดูดซับสี, กลิ่น, COD/AOX ตกค้าง ก่อนเป็นน้ำหลังบำบัด S2"
    ],
    checks: [
      "ถ้า pH แกว่ง ให้ดู EQ+pH และ dosing กรด/ด่าง",
      "ถ้า TSS สูง ให้ดู Primary, Secondary และ Sand Filter",
      "ถ้าสีหรือ COD สูง ให้ดู coagulant/polymer, Aeration และ Carbon condition"
    ]
  },
  {
    id: "sludge-line",
    title: "ขบวนการตะกอน",
    subtitle: "Sludge and RAS line",
    summary:
      "ตะกอนเกิดจากการตกตะกอนเคมีและจากจุลินทรีย์ในระบบชีวภาพ ใน layout นี้ตะกอนจากบ่อ 5 กลับไปบ่อ 3 ผ่านท่อ RAS เส้นเดียว และตะกอนจากบ่อ 3 จึงส่งต่อไปบ่อ 8 เพื่อพักก่อนเข้าเครื่อง press",
    points: [
      "RAS = Return Activated Sludge คือ ตะกอนจุลินทรีย์ที่สูบกลับจากบ่อ 5 Secondary Clarifier ไปบ่อ 3 Primary Clarifier ในแบบนี้มีท่อ RAS เส้นเดียว",
      "บ่อ 5 ไม่มีท่อตรงไปบ่อ 8 เพราะตะกอนจากบ่อ 5 ต้องกลับไปบ่อ 3 ก่อน",
      "Primary sludge คือ ตะกอนหนักจากบ่อ 3 หลังรับตะกอนกลับจากบ่อ 5 แล้วจึงส่งไปบ่อ 8 เพื่อพักตะกอน",
      "8 Sludge Holding Tank: บ่อพักตะกอน 40 m3 รับตะกอนจากบ่อ 3 ให้ feed ไป press สม่ำเสมอ",
      "9 Sludge Press: เครื่อง press อัดตะกอน ใช้ polymer dosing ช่วยให้ตะกอนจับตัวและรีดน้ำออกได้ดีขึ้น",
      "10 Sludge Storage: ที่พักตะกอน cake หลัง press ต้องมีพื้นกันซึม กันน้ำฝน และเอกสารการส่งกำจัด"
    ],
    checks: [
      "ถ้า Secondary Clarifier ขุ่น ให้สงสัย sludge blanket สูงหรือ RAS กลับบ่อ 3 ไม่สมดุล",
      "ถ้า sludge feed ไป press แกว่ง ให้ดูบ่อพักตะกอนและ mixer",
      "ถ้า cake แฉะ ให้ดู polymer dose, feed solids และสภาพเครื่อง press"
    ]
  },
  {
    id: "chemicals",
    title: "การใส่เคมีและถัง Dosing",
    subtitle: "Chemical dosing points",
    summary:
      "เคมีในระบบนี้ใช้เพื่อควบคุม pH, จับตะกอน, ลดสี, ช่วยตกตะกอน และช่วยรีดน้ำตะกอน ไม่ควรเพิ่มเคมีทุกจุดโดยไม่มีเหตุผล เพราะจะเพิ่ม sludge, ค่าใช้จ่าย และอาจรบกวนชีวภาพ",
    points: [
      "EQ+pH มีถัง dosing กรด/ด่าง ใช้ปรับ pH ก่อนเข้ากระบวนการตกตะกอนและชีวภาพ เป้าหมายโดยทั่วไปควรอยู่ใกล้ pH 6.5-8.0",
      "Primary Clarifier มี dosing PAC/coagulant และ polymer ใช้จับสี ตะกอน และโลหะบางส่วน หาก dose ต่ำ น้ำจะขุ่นหรือสีหลุด หาก dose สูงเกินจะสร้าง sludge มาก",
      "Aeration มี support dosing สำหรับ nutrient หรือ pH support ตามความจำเป็น ไม่ควรใส่เคมีที่ฆ่าหรือกดจุลินทรีย์",
      "Sludge Press มี polymer dosing ช่วย dewatering ถ้า polymer ไม่พอดี cake จะเปียกหรือ filtrate ขุ่น",
      "Carbon Filter ไม่ใช่จุด dosing หลัก แต่เป็น media polishing ต้องดูอายุถ่านและ breakthrough"
    ],
    checks: [
      "ปรับเคมีทีละตัวแล้วดูผลใน compliance panel",
      "ถ้าแก้สี ให้ดู coagulant/polymer และ carbon condition",
      "ถ้าแก้ pH ให้เริ่มที่ EQ+pH และ final pH correction"
    ]
  },
  {
    id: "alarms",
    title: "การอ่านค่า Alarm และ ZDHC",
    subtitle: "Compliance and troubleshooting",
    summary:
      "ระบบนี้เป็น training simulator ไม่ใช่แบบวิศวกรรมรับรองผลจริง แต่ช่วยให้ทีมเข้าใจว่า parameter ใดทำให้ผ่านหรือไม่ผ่าน ZDHC Foundational และควรเริ่มตรวจจากจุดไหน",
    points: [
      "pH ต้องอยู่ในช่วง 6-9 ถ้านอกช่วงให้ดู EQ+pH และ final pH correction",
      "BOD/COD สูง มักเกี่ยวกับ shock load, aeration health, air flow หรือ carbon exhaustion",
      "TSS สูง มักเกี่ยวกับ primary settling, secondary clarifier, sludge blanket หรือ sand filter",
      "Color สูง มักเกี่ยวกับ batch dye load, coagulant/polymer dose และ carbon condition",
      "NH4-N สูง มักเกี่ยวกับ DO ต่ำ, aeration health ต่ำ หรือ biomass ไม่พอ",
      "Sb/metal สูง มักต้องดู chemical precipitation/coagulation และ pH condition"
    ],
    checks: [
      "เริ่มจากดู alarm badge บนหน่วยที่ fail",
      "กดหน่วยนั้นเพื่ออ่าน purpose, design basis, equipment และ risk parameters",
      "ใช้ scenario เช่น High Color, COD Shock หรือ Antimony Exceedance เพื่อฝึกแก้ทีละเคส"
    ]
  },
  {
    id: "how-to-use",
    title: "วิธีใช้ simulator",
    subtitle: "Training workflow",
    summary:
      "วิธีใช้ที่แนะนำคือเริ่มจาก Flow Tour เพื่อเข้าใจลำดับระบบก่อน จากนั้นเลือก scenario ปัญหา แล้วปรับ slider เพื่อดูว่าการเดินระบบแต่ละจุดมีผลต่อคุณภาพน้ำอย่างไร",
    points: [
      "กด Play Flow Tour เพื่อให้ระบบพาไปทีละจุด กล้องจะซูมเข้าแต่ละอุปกรณ์พร้อมคำอธิบายละเอียด",
      "กด Pause อ่านก่อน ถ้าต้องการหยุดอยู่ที่จุดนั้น แล้วกด Play เพื่อเดินต่อ",
      "กดอุปกรณ์ใน 3D เพื่อเปิด inspector ด้านขวา อ่านหน้าที่ ขนาด เคมี และความเสี่ยงของหน่วยนั้น",
      "เลือก scenario ด้านซ้าย เช่น High Color หรือ COD Shock เพื่อจำลองปัญหาจริง",
      "ปรับ slider ด้านล่าง เช่น coagulant dose, polymer dose, air flow, carbon condition เพื่อฝึกแก้ค่า fail",
      "ดู Compliance panel ด้านล่างว่า pH, Color, BOD, COD, TSS, NH4, Sb และค่าอื่นผ่านหรือไม่"
    ],
    checks: [
      "ฝึกเคส High Color: เพิ่ม coagulant/polymer และดูผลที่ Color",
      "ฝึกเคส COD Shock: ดู EQ buffer, aeration health และ carbon condition",
      "ฝึกเคส Sb: ปรับ chemical/pH แล้วดู Sb ใน compliance panel"
    ]
  }
];

function App() {
  const [scenarioId, setScenarioId] = useState("normal");
  const [controls, setControls] = useState<SimulationControls>(baseControls);
  const [selectedUnitId, setSelectedUnitId] = useState("equalization");
  const [viewAngle, setViewAngle] = useState<ViewAngle>("iso");
  const [isRunning, setIsRunning] = useState(true);
  const [isFlowTourRunning, setIsFlowTourRunning] = useState(false);
  const [isFlowTourPaused, setIsFlowTourPaused] = useState(false);
  const [flowTourIndex, setFlowTourIndex] = useState(0);
  const [isManualOpen, setIsManualOpen] = useState(false);

  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const simulation = useMemo(() => runSimulation(scenario.inlet, controls), [scenario.inlet, controls]);
  const selectedUnit = unitsById[selectedUnitId] ?? treatmentUnits[0];
  const tourStepId = isFlowTourRunning ? flowTourSteps[flowTourIndex] : undefined;
  const isTourOverview = tourStepId === FLOW_TOUR_OVERVIEW_ID;
  const isChemicalStep = tourStepId === "__eq-chemical" || tourStepId === "__primary-chemical";
  const chemicalParentId = tourStepId === "__eq-chemical" ? "equalization" : tourStepId === "__primary-chemical" ? "primary-clarifier" : undefined;
  const tourUnitId = tourStepId && !isTourOverview && !isChemicalStep ? tourStepId : chemicalParentId;
  const tourUnit = tourUnitId ? unitsById[tourUnitId] : undefined;
  const focusedUnitId = isTourOverview ? FLOW_TOUR_OVERVIEW_ID : isChemicalStep ? tourStepId : tourUnitId;

  useEffect(() => {
    if (!isFlowTourRunning || isFlowTourPaused) return undefined;
    const nextStepId = flowTourSteps[flowTourIndex];
    if (nextStepId !== FLOW_TOUR_OVERVIEW_ID) {
      const parentMap: Record<string, string> = { "__eq-chemical": "equalization", "__primary-chemical": "primary-clarifier" };
      setSelectedUnitId(parentMap[nextStepId] ?? nextStepId);
    }
    setIsRunning(true);

    const timer = window.setTimeout(() => {
      setFlowTourIndex((current) => (current >= flowTourSteps.length - 1 ? 0 : current + 1));
    }, FLOW_TOUR_DWELL_MS);

    return () => window.clearTimeout(timer);
  }, [flowTourIndex, isFlowTourPaused, isFlowTourRunning]);

  const selectScenario = (id: string) => {
    const next = scenarios.find((item) => item.id === id) ?? scenarios[0];
    setScenarioId(next.id);
    setControls(applyScenarioControls(baseControls, next.controlOverrides));
    setSelectedUnitId(next.targetUnitId ?? "equalization");
    setIsRunning(true);
    setIsFlowTourRunning(false);
    setIsFlowTourPaused(false);
  };

  const updateControl = (key: keyof SimulationControls, value: number) => {
    setControls((current) => ({ ...current, [key]: value }));
  };

  const reset = () => selectScenario(scenarioId);

  const startFlowTour = () => {
    setFlowTourIndex(0);
    setIsFlowTourRunning(true);
    setIsFlowTourPaused(false);
    setSelectedUnitId(flowTourIds[0]);
    setIsRunning(true);
  };

  const stopFlowTour = () => {
    setIsFlowTourRunning(false);
    setIsFlowTourPaused(false);
    setFlowTourIndex(0);
  };

  const toggleFlowTourPause = () => setIsFlowTourPaused((value) => !value);

  const nextFlowTourStep = () => {
    setFlowTourIndex((current) => (current >= flowTourSteps.length - 1 ? 0 : current + 1));
    setIsFlowTourPaused(true);
  };

  const prevFlowTourStep = () => {
    setFlowTourIndex((current) => (current <= 0 ? flowTourSteps.length - 1 : current - 1));
    setIsFlowTourPaused(true);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">GT</div>
          <div>
            <strong>GOLDEN THREAD</strong>
            <span>CO., LTD.</span>
          </div>
        </div>
        <div className="sim-title">
          <p className="eyeline">ZDHC V2.2 Training Simulator</p>
          <h1>ETP Training Simulator</h1>
        </div>
        <div className="topbar__status">
          <div className="water-capacity">
            <Droplet size={28} />
            <div>
              <span>กำลังการบำบัด</span>
              <strong>500 m3/day</strong>
            </div>
          </div>
          <StatusPill result={simulation} />
          <div className="time-pill">
            <Clock3 size={17} />
            <span>10:24:15</span>
          </div>
          <div className="capacity-pill">
            <Gauge size={17} />
            <span>{sizing.flowM3Hour} m3/hr</span>
          </div>
          <button type="button" className="manual-open-button" onClick={() => setIsManualOpen(true)}>
            <BookOpen size={17} />
            <span>คู่มือระบบ</span>
          </button>
          <Bell className="top-icon" size={19} />
          <Globe2 className="top-icon" size={19} />
        </div>
      </header>

      <section className="workspace">
        <section
          className={[
            "plant-stage plant-stage--fullscreen",
            isFlowTourRunning ? "plant-stage--touring" : ""
          ].filter(Boolean).join(" ")}
          aria-label="3D wastewater treatment plant"
        >
          <div className="scene-toolbar" aria-label="3D scene controls">

            <button type="button" className="scene-toolbar__primary" onClick={isFlowTourRunning ? stopFlowTour : startFlowTour}>
              {isFlowTourRunning ? <Square size={15} /> : <Play size={17} />}
              <span>{isFlowTourRunning ? "หยุด Flow Tour" : "Play Flow Tour"}</span>
            </button>
            {isFlowTourRunning && (
              <button type="button" onClick={toggleFlowTourPause}>
                {isFlowTourPaused ? <Play size={16} /> : <Pause size={16} />}
                <span>{isFlowTourPaused ? "เล่นต่อ" : "Pause อ่านก่อน"}</span>
              </button>
            )}
          </div>
          <Plant3D
            units={treatmentUnits}
            selectedUnitId={selectedUnitId}
            focusedUnitId={focusedUnitId}
            simulation={simulation}
            isRunning={isRunning}
            viewAngle={viewAngle}
            onSelectUnit={(id) => {
              setViewAngle("iso");
              setSelectedUnitId(id);
            }}
          />
          <FlowRouteMap />
          {(tourUnit || isChemicalStep) && (
            <FlowTourOverlay
              unit={tourUnit!}
              index={flowTourIndex}
              total={flowTourSteps.length}
              runtime={simulation.unitRuntime[tourUnit?.id ?? ""]}
              isPaused={isFlowTourPaused}
              onTogglePause={toggleFlowTourPause}
              onStop={stopFlowTour}
              onPrev={prevFlowTourStep}
              onNext={nextFlowTourStep}
              overrideStepId={isChemicalStep ? tourStepId : undefined}
            />
          )}
          {isTourOverview && (
            <FlowTourOverviewOverlay
              index={flowTourIndex}
              total={flowTourSteps.length}
              isPaused={isFlowTourPaused}
              onTogglePause={toggleFlowTourPause}
              onStop={stopFlowTour}
              onPrev={prevFlowTourStep}
              onNext={nextFlowTourStep}
            />
          )}
        </section>
      </section>

      <ProcessManual open={isManualOpen} onClose={() => setIsManualOpen(false)} />
    </main>
  );
}

function StatusPill({ result }: { result: SimulationResult }) {
  const failing = result.compliance.filter((item) => item.status === "fail").length;
  return (
    <div className={result.overallStatus === "pass" ? "status-pill status-pill--pass" : "status-pill status-pill--fail"}>
      {result.overallStatus === "pass" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      <span>{result.overallStatus === "pass" ? "ผ่าน ZDHC Foundational" : `ไม่ผ่าน ${failing} ค่า`}</span>
    </div>
  );
}

function ProcessManual({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [activeSectionId, setActiveSectionId] = useState(manualSections[0].id);
  const activeSection = manualSections.find((section) => section.id === activeSectionId) ?? manualSections[0];

  if (!open) return null;

  return (
    <div className="manual-backdrop" role="presentation">
      <section className="manual-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <header className="manual-dialog__header">
          <div>
            <p>ETP Training Manual</p>
            <h2 id="manual-title">คู่มืออธิบายขบวนการทำงาน</h2>
          </div>
          <button type="button" className="manual-dialog__close" onClick={onClose} aria-label="Close process manual">
            <X size={19} />
          </button>
        </header>

        <div className="manual-dialog__body">
          <nav className="manual-nav" aria-label="Manual sections">
            {manualSections.map((section, index) => (
              <button
                key={section.id}
                type="button"
                aria-label={`${index + 1} ${section.title} ${section.subtitle}`}
                className={section.id === activeSection.id ? "manual-nav__item manual-nav__item--active" : "manual-nav__item"}
                onClick={() => setActiveSectionId(section.id)}
              >
                <span>{index + 1}</span>
                <strong>{section.title}</strong>
                <em>{section.subtitle}</em>
              </button>
            ))}
          </nav>

          <article className="manual-content">
            <div className="manual-content__title">
              <span>{manualSections.findIndex((section) => section.id === activeSection.id) + 1}</span>
              <div>
                <h3>{activeSection.title}</h3>
                <p>{activeSection.subtitle}</p>
              </div>
            </div>

            <p className="manual-content__summary">{activeSection.summary}</p>

            <div className="manual-block">
              <h4>รายละเอียดการทำงาน</h4>
              <ol>
                {activeSection.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ol>
            </div>

            {activeSection.checks && (
              <div className="manual-block manual-block--checks">
                <h4>จุดที่ควรตรวจ / Training check</h4>
                <ul>
                  {activeSection.checks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="manual-warning">
              <strong>หมายเหตุ</strong>
              <span>
                Simulator นี้ใช้เพื่อฝึกอบรมและวางภาพรวมการเดินระบบ ไม่ใช่แบบวิศวกรรมรับรองผลจริง ก่อนสร้างหรือปรับระบบจริงต้องใช้ข้อมูลน้ำเสียจริง,
                jar test, pilot test, รายงาน lab และวิศวกรผู้ออกแบบ
              </span>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

function FlowTourOverlay({
  unit,
  index,
  total,
  runtime,
  isPaused,
  onTogglePause,
  onStop,
  onPrev,
  onNext,
  overrideStepId
}: {
  unit: TreatmentUnit;
  index: number;
  total: number;
  runtime?: SimulationResult["unitRuntime"][string];
  isPaused: boolean;
  onTogglePause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  overrideStepId?: string;
}) {
  const stepId = overrideStepId ?? unit.id;
  const isChemStep = stepId.startsWith("__");
  const chemTitles: Record<string, { en: string; th: string }> = {
    "__eq-chemical": { en: "pH Chemical Dosing System", th: "ชุดเตรียมเคมี pH (บ่อ EQ)" },
    "__primary-chemical": { en: "Coagulation Chemical Dosing", th: "ชุดเตรียมเคมีตกตะกอน (บ่อ 3)" }
  };
  const displayName = isChemStep ? (chemTitles[stepId]?.en ?? unit.name) : unit.name;
  const displayThai = isChemStep ? (chemTitles[stepId]?.th ?? unit.thaiName) : unit.thaiName;
  const displayBadge = isChemStep ? "⚗" : unitDisplayBadge(unit);
  const related = unit.relatedLimits.length ? unit.relatedLimits.join(", ") : "ไม่มีค่าจำเพาะ";
  const sizeSpec = tourSizeSpecs[stepId] ?? tourSizeSpecs[unit.id];
  const chemicalNote = tourChemicalNotes[stepId] ?? tourChemicalNotes[unit.id];
  return (
    <article className="flow-tour-card" aria-live="polite">
      <div className="flow-tour-card__top">
        <span>FLOW TOUR {index + 1}/{total} · 6 sec/step</span>
        <div className="flow-tour-card__actions">
          <button type="button" onClick={onPrev} aria-label="Previous step">
            <SkipBack size={14} /> Prev
          </button>
          <button type="button" onClick={onTogglePause} aria-label={isPaused ? "Resume flow tour" : "Pause flow tour"}>
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            {isPaused ? "Play" : "Pause"}
          </button>
          <button type="button" onClick={onNext} aria-label="Next step">
            Next <SkipForward size={14} />
          </button>
          <button type="button" onClick={onStop} aria-label="Stop flow tour">Stop</button>
        </div>
      </div>
      <h2>
        <b>{displayBadge}</b>
        {displayName}
      </h2>
      <h3>{displayThai}</h3>
      <p>{tourNotes[stepId] ?? tourNotes[unit.id] ?? unit.purpose}</p>
      <dl>
        <div>
          <dt>หน้าที่ / Purpose</dt>
          <dd>{unit.purpose}</dd>
        </div>
        <div>
          <dt>Design basis</dt>
          <dd>{unit.designBasis}</dd>
        </div>
        {sizeSpec && (
          <div>
            <dt>ขนาด / Volume</dt>
            <dd>{sizeSpec}</dd>
          </div>
        )}
        {chemicalNote && (
          <div>
            <dt>เคมีและถัง dosing</dt>
            <dd>{chemicalNote}</dd>
          </div>
        )}
        <div>
          <dt>Equipment</dt>
          <dd>{unit.equipmentSpec}</dd>
        </div>
        <div>
          <dt>Expected removal</dt>
          <dd>{unit.expectedRemoval}</dd>
        </div>
      </dl>
      <div className="flow-tour-card__footer">
        <span className={runtime?.alarm ? "flow-tour-status flow-tour-status--alarm" : "flow-tour-status"}>
          {runtime?.alarm ? "Alarm" : "Normal"} · Efficiency {Math.round((runtime?.efficiency ?? 0) * 100)}%
        </span>
        <span>ZDHC focus: {related}</span>
      </div>
      <div className="flow-tour-progress">
        <span style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
    </article>
  );
}

function FlowTourOverviewOverlay({
  index,
  total,
  isPaused,
  onTogglePause,
  onStop,
  onPrev,
  onNext
}: {
  index: number;
  total: number;
  isPaused: boolean;
  onTogglePause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <article className="flow-tour-card flow-tour-card--overview" aria-live="polite">
      <div className="flow-tour-card__top">
        <span>FLOW TOUR {index + 1}/{total} · OVERVIEW · 6 sec</span>
        <div className="flow-tour-card__actions">
          <button type="button" onClick={onPrev} aria-label="Previous step">
            <SkipBack size={14} /> Prev
          </button>
          <button type="button" onClick={onTogglePause} aria-label={isPaused ? "Resume flow tour" : "Pause flow tour"}>
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            {isPaused ? "Play" : "Pause"}
          </button>
          <button type="button" onClick={onNext} aria-label="Next step">
            Next <SkipForward size={14} />
          </button>
          <button type="button" onClick={onStop} aria-label="Stop flow tour">Stop</button>
        </div>
      </div>
      <h2>
        <b>↺</b>
        ภาพรวมทั้งระบบ
      </h2>
      <h3>45° full system overview</h3>
      <p>
        ขั้นสุดท้ายกล้องซูมออกเป็นมุมกว้างประมาณ 45 องศา เพื่อให้เห็นภาพรวมการไหลทั้งหมด:
        ทางน้ำเสียเข้า S1, บ่อ 1 ถังพัก, EQ+pH, ตกตะกอน, เติมอากาศ, secondary clarification, กรองทราย,
        กรองคาร์บอน และสายตะกอนจากบ่อพักตะกอนไปเครื่อง press จนถึงที่พักตะกอน จากนั้นระบบจะวนกลับไปทางน้ำเข้า S1 อัตโนมัติ
      </p>
      <dl>
        <div>
          <dt>Loop behavior</dt>
          <dd>เมื่อครบ overview แล้ว Flow Tour จะเริ่มใหม่ที่ทางน้ำเข้า S1 โดยไม่หยุดเอง; หมายเลขบ่อจริงเริ่มที่ Holding Tank = 1</dd>
        </div>
        <div>
          <dt>Pause / Play</dt>
          <dd>กด Pause เพื่อค้างกล้องและข้อความไว้ อ่านจบแล้วกด Play เพื่อเดินต่อ</dd>
        </div>
      </dl>
      <div className="flow-tour-card__footer">
        <span className="flow-tour-status">System overview</span>
        <span>มองเห็น process ทั้งหมดก่อนวนรอบถัดไป</span>
      </div>
      <div className="flow-tour-progress">
        <span style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
    </article>
  );
}

function PlantMap({
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
  const mainFlow = [
    "bar-screen",
    "equalization",
    "ph-adjust",
    "coagulation",
    "flocculation",
    "lamella",
    "anoxic",
    "mbr",
    "sand-filter",
    "gac",
    "ozone",
    "sb-coag",
    "final-clarifier",
    "final-ph",
    "monitoring",
    "sampler",
    "flow-meter"
  ];
  const sludgeFlow = ["lamella", "sludge-thickener", "sludge-conditioning", "filter-press"];
  const mbrSludge = ["mbr", "sludge-thickener"];
  const finalSludge = ["final-clarifier", "sludge-thickener"];
  const unitMap = Object.fromEntries(units.map((unit) => [unit.id, unit]));

  const renderPath = (ids: string[], className = "flow-path") =>
    ids.slice(0, -1).map((id, index) => {
      const from = unitMap[id];
      const to = unitMap[ids[index + 1]];
      const x1 = from.x + from.w / 2;
      const y1 = from.y + from.h / 2;
      const x2 = to.x + to.w / 2;
      const y2 = to.y + to.h / 2;
      const curve = Math.abs(x2 - x1) > Math.abs(y2 - y1) ? `C ${x1 + 9} ${y1}, ${x2 - 9} ${y2}, ${x2} ${y2}` : `C ${x1} ${y1 + 8}, ${x2} ${y2 - 8}, ${x2} ${y2}`;
      return <path key={`${id}-${to.id}`} className={className} d={`M ${x1} ${y1} ${curve}`} />;
    });

  return (
    <div className={isRunning ? "plant-map plant-map--running" : "plant-map"} data-testid="plant-map">
      <svg className="flow-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {renderPath(mainFlow)}
        {renderPath(sludgeFlow, "flow-path flow-path--sludge")}
        {renderPath(mbrSludge, "flow-path flow-path--sludge")}
        {renderPath(finalSludge, "flow-path flow-path--sludge")}
      </svg>

      <div className="sample-point sample-point--untreated">Untreated</div>
      <div className="sample-point sample-point--discharged">Discharged</div>
      <div className="sample-point sample-point--sludge">Sludge</div>

      {units.map((unit) => {
        const runtime = simulation.unitRuntime[unit.id];
        const selected = selectedUnitId === unit.id;
        return (
          <button
            type="button"
            key={unit.id}
            className={`unit unit--${unit.kind} ${selected ? "unit--selected" : ""} ${runtime?.alarm ? "unit--alarm" : ""}`}
            style={{ left: `${unit.x}%`, top: `${unit.y}%`, width: `${unit.w}%`, height: `${unit.h}%` }}
            onClick={() => onSelectUnit(unit.id)}
            aria-pressed={selected}
          >
            <span className="unit__top" />
            <span className="unit__name">{unit.name}</span>
            <span className="unit__thai">{unit.thaiName}</span>
            <span className="unit__meter">
              <span style={{ width: `${Math.round((runtime?.efficiency ?? 0.8) * 100)}%` }} />
            </span>
            {runtime?.alarm && <span className="alarm-badge">!</span>}
          </button>
        );
      })}
    </div>
  );
}

function UnitInspector({ unit, simulation }: { unit: TreatmentUnit; simulation: SimulationResult }) {
  const runtime = simulation.unitRuntime[unit.id];
  const related = simulation.compliance.filter((item) => unit.relatedLimits.includes(item.key));

  return (
    <aside className="inspector" aria-label="Selected treatment unit inspector">
      <div className="inspector__header">
        <span className={`kind-dot kind-dot--${unit.kind}`} />
        <div>
          <p>{unit.thaiName}</p>
          <h2>{unit.name}</h2>
        </div>
      </div>
      <div className={runtime?.alarm ? "unit-state unit-state--alarm" : "unit-state"}>
        <strong>{runtime?.alarm ? "Alarm / ต้องตรวจสอบ" : "Normal / เดินระบบปกติ"}</strong>
        <span>{runtime?.reason}</span>
      </div>

      <dl className="detail-list">
        <div>
          <dt>Purpose</dt>
          <dd>{unit.purpose}</dd>
        </div>
        <div>
          <dt>Design basis</dt>
          <dd>{unit.designBasis}</dd>
        </div>
        <div>
          <dt>Equipment</dt>
          <dd>{unit.equipmentSpec}</dd>
        </div>
        <div>
          <dt>Expected removal</dt>
          <dd>{unit.expectedRemoval}</dd>
        </div>
      </dl>

      <div className="mini-table">
        <div className="mini-table__head">
          <span>Related limit</span>
          <span>Effluent</span>
        </div>
        {related.map((item) => (
          <div key={item.key} className={item.status === "fail" ? "mini-row mini-row--fail" : "mini-row"}>
            <span>{item.label}</span>
            <strong>{formatValue(item)}</strong>
          </div>
        ))}
      </div>

      <div className="sizing-card">
        <span>500 m3/day design anchor</span>
        <strong>{sizing.capacityM3Day} m3/day</strong>
        <p>Q {sizing.flowM3Hour} m3/hr · EQ {sizing.equalizationM3} m3 · Aeration {sizing.mbrM3} m3</p>
      </div>
    </aside>
  );
}

function ControlPanel({
  controls,
  onUpdate,
  onReset,
  isRunning,
  onToggleRun
}: {
  controls: SimulationControls;
  onUpdate: (key: keyof SimulationControls, value: number) => void;
  onReset: () => void;
  isRunning: boolean;
  onToggleRun: () => void;
}) {
  return (
    <div className="control-panel">
      <div className="console-main">
        <div className="console-module console-module--transport">
          <h3>SIMULATION CONTROL</h3>
          <div className="transport">
            <button className="transport__button" onClick={onToggleRun}>
              {isRunning ? <Pause size={17} /> : <Play size={17} />}
              <span>{isRunning ? "Pause" : "Play"}</span>
            </button>
            <button className="transport__button transport__button--ghost" onClick={onReset}>
              <RotateCcw size={17} />
              <span>Reset</span>
            </button>
            <button
              className="transport__button transport__button--tune"
              onClick={() => {
                onUpdate("coagulantDose", 96);
                onUpdate("finalPhCorrection", 96);
              }}
            >
              <span>Tune Chem/pH</span>
            </button>
          </div>
        </div>
        <div className="console-module console-module--speed">
          <h3>SIMULATION SPEED</h3>
          <input type="range" min="0" max="4" value="1" readOnly />
          <div className="speed-scale">
            <span>0.5x</span>
            <strong>1x</strong>
            <span>2x</span>
            <span>4x</span>
          </div>
        </div>
        <div className="console-module console-module--elapsed">
          <h3>ELAPSED TIME</h3>
          <div className="elapsed-readout">
            <Clock3 size={18} />
            <strong>10:24:15</strong>
          </div>
          <span>Training run / เวลาจำลอง</span>
        </div>
      </div>
      <div className="slider-grid">
        {controlMeta.map((meta) => (
          <label key={meta.key} className="control-slider">
            <span>
              <strong>{meta.thai}</strong>
              <em>{meta.label}</em>
            </span>
            <input
              type="range"
              min={meta.min ?? 0}
              max={meta.max ?? 100}
              value={controls[meta.key]}
              onChange={(event) => onUpdate(meta.key, Number(event.target.value))}
            />
            <b>{controls[meta.key]}{meta.suffix}</b>
          </label>
        ))}
      </div>
      <div className="console-strip">
        <span><i className="legend-line legend-line--water" />น้ำ (Water)</span>
        <span><i className="legend-line legend-line--sludge" />ตะกอน (Sludge)</span>
        <span><b className="legend-dot">2</b> Alarm</span>
        <strong>Flow: inlet to holding to EQ/pH to clarifier to aeration to secondary clarifier to sand to carbon</strong>
      </div>
    </div>
  );
}

function CompliancePanel({ compliance }: { compliance: ComplianceResult[] }) {
  const filtered = compliance.filter((item) => focusParameters.includes(item.key));
  const failing = filtered.filter((item) => item.status === "fail").length;
  return (
    <div className="compliance-panel" aria-label="ZDHC Foundational compliance results">
      <div className="panel-title">
        <CheckCircle2 size={18} />
        <span>ZDHC Foundational</span>
      </div>
      <div className="compliance-grid">
        {filtered.map((item) => (
          <div key={item.key} className={item.status === "fail" ? "compliance-chip compliance-chip--fail" : "compliance-chip"}>
            <span>{item.label}</span>
            <strong>{formatValue(item)}</strong>
          </div>
        ))}
      </div>
      <div className={failing === 0 ? "overall-result overall-result--pass" : "overall-result overall-result--fail"}>
        <span>ผลรวม / Overall</span>
        <strong>{failing === 0 ? "PASS" : `${failing} FAIL`}</strong>
      </div>
    </div>
  );
}

function formatLimit(item: ComplianceResult) {
  const limit = item.limit.foundational;
  if (Array.isArray(limit)) return `${limit[0]}-${limit[1]}`;
  if (typeof limit === "number") return `<=${limit}`;
  return "S&R";
}

function formatValue(item: ComplianceResult) {
  const digits = item.value < 1 ? 3 : item.value < 10 ? 2 : 1;
  return `${item.value.toFixed(digits)} / ${formatLimit(item)} ${item.unit}`;
}

export default App;
