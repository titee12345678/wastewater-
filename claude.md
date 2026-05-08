# Golden Thread ETP Training Simulator — Project Context

## ภาพรวม / Overview

โปรเจกต์นี้คือ **ZDHC V2.2 ETP (Effluent Treatment Plant) Training Simulator** สำหรับ **Golden Thread Co., Ltd.** — โรงงานสิ่งทอ
เป็น React + TypeScript web app ที่จำลองระบบบำบัดน้ำเสีย 500 m3/day พร้อม 3D visualization ด้วย Three.js
วัตถุประสงค์: ใช้ฝึกอบรมทีมปฏิบัติงาน ให้เข้าใจว่าการปรับเคมี/อุปกรณ์มีผลต่อคุณภาพน้ำทิ้งอย่างไร และผ่านเกณฑ์ ZDHC Foundational หรือไม่

> **ข้อสำคัญ**: Simulator นี้ไม่ใช่แบบวิศวกรรมรับรองผลจริง ใช้เพื่อฝึกอบรมและวางภาพรวมเท่านั้น

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript (strict) |
| Build | Vite 7 |
| 3D | Three.js via `@react-three/fiber` + `@react-three/drei` |
| Icons | `lucide-react` |
| CSS | Vanilla CSS (no Tailwind) — `src/styles.css` |
| Test | Vitest + Testing Library + Playwright |
| Lang | HTML `lang="th"` — bilingual Thai/English UI |

### Commands
```bash
npm run dev       # Dev server (0.0.0.0)
npm run build     # TypeScript check + Vite production build
npm test          # Vitest unit tests
npm run preview   # Preview production build
```

---

## สถาปัตยกรรม / Architecture

```
src/
├── main.tsx              # Entry point: renders <App />
├── App.tsx               # Main component (~916 lines) — state, UI layout, all sub-components
├── types.ts              # Core TypeScript types
├── styles.css            # All CSS (27KB)
├── components/
│   └── Plant3D.tsx       # 3D scene (~2054 lines) — Three.js/R3F
├── data/
│   ├── units.ts          # Treatment unit definitions (11 units)
│   ├── limits.ts         # ZDHC V2.2 parameter limits (20 parameters)
│   └── scenarios.ts      # 7 training scenarios + baseline influent
├── simulation/
│   ├── model.ts          # Simulation engine — runs water quality through treatment chain
│   ├── model.test.ts     # Unit tests for simulation
│   └── sizing.ts         # Equipment sizing formulas (500 m3/day basis)
└── App.test.tsx          # Integration tests for UI
```

---

## ระบบบำบัดน้ำเสีย / Treatment Process Flow

### สายน้ำ (Water Line): S1 → S2
```
S1 Influent Inlet → 1 Holding Tank → 2 Equalization+pH → 3 Primary Clarifier
→ 4 Aeration Tank → 5 Secondary Clarifier → 6 Sand Filter → 7 Carbon Filter → S2 Discharge
```

### สายตะกอน (Sludge Line): → S3
```
5 Secondary Clarifier ─(RAS)→ 3 Primary Clarifier ─(sludge)→ 8 Sludge Holding
→ 9 Sludge Press → 10 Sludge Storage (S3)
```

> **สำคัญ**: บ่อ 5 (Secondary Clarifier) ส่งตะกอนกลับบ่อ 3 ผ่าน RAS เส้นเดียว ไม่มีท่อตรงไปบ่อ 8

### Treatment Units (11 หน่วย)

| # | ID | Name | Thai | Kind | Dimensions |
|---|-----|------|------|------|------------|
| S1 | `inlet` | Influent Inlet | น้ำเข้า | pretreatment | ราง/จุดรับน้ำ |
| 1 | `holding-tank` | Holding Tank | ถังพักน้ำเสีย | pretreatment | 3×5×3 m (target 120 m3) |
| 2 | `equalization` | Equalization + pH | บ่อ EQ ปรับ pH | pretreatment | 13×13×3 m (500 m3) |
| 3 | `primary-clarifier` | Primary Clarifier | บ่อตกตะกอน | primary | 5×8×3 m |
| 4 | `aeration` | Aeration Tank | บ่อเติมอากาศ | biological | 12×18×3 m |
| 5 | `secondary-clarifier` | Secondary Clarifier | บ่อเคลียร์ตะกอน | biological | 7×7×3 m |
| 6 | `sand-filter` | Sand Filter | ถังกรองทราย | tertiary | pressure vessel |
| 7 | `carbon-filter` | Carbon Filter | ถังคาร์บอน | tertiary | GAC EBCT 20-30 min |
| 8 | `sludge-holding` | Sludge Holding Tank | บ่อพักตะกอน | sludge | 40 m3 |
| 9 | `sludge-press` | Sludge Press | เครื่อง press | sludge | Belt/screw press |
| 10 | `sludge-storage` | Sludge Storage | ที่พักตะกอน | sludge | Covered storage |

---

## Simulation Engine

### การทำงานของ model.ts

```typescript
runSimulation(inlet, controls) → SimulationResult
```

1. **multiplyInfluent()** — ปรับ influent ตาม inlet shock, dye load, COD/BOD load, Sb load
2. **applyPrimary()** — ตกตะกอนเคมี: ลด TSS 72%, สี 40-44%, COD 22%
3. **applyBiological()** — เติมอากาศ: ลด BOD 99%, COD 84%, NH4 93%
4. **applyTertiary()** — กรองทราย + คาร์บอน: ลดสี 65-86%, COD 32-36%
5. **applyFinalPolishing()** — ปรับ pH สุดท้าย + ลดโลหะ (Sb, Cu, Cr, Ni, Zn)
6. **evaluateCompliance()** — เทียบกับ ZDHC Foundational limits

### SimulationControls (11 sliders)

| Key | Thai | What it affects |
|-----|------|-----------------|
| `inletShock` | โหลดแกว่ง | ขนาด shock load |
| `dyeColorLoad` | โหลดสี | ความเข้มสีจาก batch ย้อม |
| `codBodLoad` | สารอินทรีย์ | COD/BOD concentration |
| `sbLoad` | Antimony | Sb concentration (polyester) |
| `coagulantDose` | PAC/FeCl3 | ประสิทธิภาพ coagulation |
| `polymerDose` | พอลิเมอร์ | ประสิทธิภาพ flocculation |
| `mbrHealth` | สภาพบ่อเติมอากาศ | Aeration system health |
| `airFlow` | อากาศ | DO / blower output |
| `gacCondition` | ถังคาร์บอน | Media age/condition |
| `ozoneDose` | กำลัง polishing | Polishing reserve |
| `finalPhCorrection` | ปรับ pH/Sb | Final pH + metal removal |

### ZDHC V2.2 Parameters (20 ค่า)

จาก `limits.ts` — เกณฑ์ Foundational / Progressive / Aspirational:
- **pH** (6-9 range), **Color** 436/525/620 nm, **BOD5**, **COD**, **TSS**
- **NH4-N**, **TN**, **TP**, **AOX**, **Oil & Grease**, **Phenol**, **Cyanide**
- **Metals**: Sb, Cu, Cr, Cr(VI), Ni, Zn

---

## 7 Training Scenarios

| ID | Name | Thai | Focus |
|----|------|------|-------|
| `normal` | Normal Operation | เดินระบบปกติ | Baseline balanced |
| `high-color` | High Color Batch | น้ำสีเข้ม | Color, COD, carbon |
| `cod-shock` | COD Shock | COD shock load | Organic load, aeration |
| `sb-exceed` | Antimony Exceedance | Sb เกินเกณฑ์ | Metal precipitation |
| `aeration-low-air` | Under-aeration | อากาศต่ำ | Biological treatment |
| `gac-exhausted` | Carbon Exhausted | ถ่านหมดอายุ | Polishing capacity |
| `carbon-polishing-low` | Low Polishing | polishing ต่ำ | Combined removal |

---

## UI Layout

```
┌─ Topbar: Brand, title, capacity badge, ZDHC status, manual button ──────┐
│                                                                           │
│  ┌── Scenario Panel ──┐  ┌── 3D Plant Stage (Plant3D) ──┐  ┌── Unit ──┐ │
│  │ 7 scenario cards   │  │ Three.js isometric view       │  │Inspector│ │
│  │ Description        │  │ Flow Tour overlay             │  │ Details │ │
│  └────────────────────┘  └───────────────────────────────┘  └─────────┘ │
│                                                                           │
│  ┌── Control Panel (sliders) ──────────┐ ┌── Compliance Panel ─────────┐ │
│  │ 11 simulation controls              │ │ ZDHC Foundational results   │ │
│  │ Play/Pause/Reset, Tune Chem/pH      │ │ PASS/FAIL for each param   │ │
│  └─────────────────────────────────────┘ └─────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3D Features
- Isometric view with OrbitControls
- Cascade launders (น้ำล้น) between basins with animated flow beads
- Transfer pump pipe (holding → EQ) with animated bead
- Sludge network (RAS return + primary sludge)
- Treated discharge pipe to S2
- Per-unit overflow datum labels (cm levels)
- Alarm beacons on failing units
- **Flow Tour**: Auto-rotating camera through all 11 units + overview (6 sec/step)
- **Process Manual**: 6-section bilingual training guide (modal)

---

## Reference Documents (ไฟล์อ้างอิง)

| File | Description |
|------|-------------|
| `Wastewaterguidelines2.2.pdf` | ZDHC Wastewater Guidelines V2.2 (official) |
| `ZDHC_V2.2_GoldenThread_FullETP.docx` | Full ETP design document for Golden Thread |
| `ZDHC_V2.2_Tier2_Compliance_GoldenThread.docx` | Tier 2 compliance analysis |

---

## ข้อควรระวังสำหรับ AI / Important Notes for AI Agents

1. **ภาษา**: UI เป็น bilingual Thai/English ทุก label มีทั้งสองภาษา ถ้าเพิ่มข้อมูลใหม่ต้องมีทั้ง `name` (EN) และ `thaiName` (TH)
2. **หน่วยบำบัดเรียงตาม order**: `inlet(0)` → `holding-tank(1)` → ... → `sludge-storage(10)`
3. **S1/S2/S3 หมายเลข**: S1 = น้ำเข้า, S2 = น้ำหลังบำบัด, S3 = ตะกอน — ไม่ใช่หมายเลขบ่อ
4. **RAS routing**: Secondary Clarifier → Primary Clarifier เส้นเดียว ห้ามวาดท่อจากบ่อ 5 ไปบ่อ 8 ตรง
5. **Holding → EQ ใช้ pump ไม่ใช่ overflow**: Transfer pump ยิงขึ้นเข้าบ่อ EQ
6. **Simulation formula**: ใช้ fraction reduction model ไม่ใช่ ODE ที่ซับซ้อน เหมาะกับการฝึก ไม่ใช่ engineering design
7. **3D component ใหญ่**: Plant3D.tsx มี 2054 lines เป็น R3F components ทั้งหมด
8. **No routing**: App เป็น single-page ไม่มี React Router
9. **CSS เดี่ยว**: `styles.css` เดียว ไม่มี CSS modules หรือ preprocessor
10. **Test coverage**: 2 test files — `model.test.ts` (simulation logic) + `App.test.tsx` (UI integration)

---

## การ run โปรเจกต์

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Build production
npm run build
```

---

## แนวทางการพัฒนาต่อ (Potential Future Work)

- เพิ่ม scenario ใหม่ (เช่น heavy metal, nutrient shock)
- เพิ่ม Progressive/Aspirational tier comparison
- Real-time data integration from actual ETP sensors
- Multi-language support beyond Thai/English
- Export compliance report (PDF/Excel)
- Mobile responsive layout optimization
- Compare multiple vendor designs (System 1 vs System 2 from past conversations)
