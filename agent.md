# Agent Instructions — Golden Thread ETP Training Simulator

> This file provides concise, actionable instructions for any AI agent working on this codebase.
> Read `claude.md` first for full project context and domain knowledge.

---

## Quick Reference

| What | Where |
|------|-------|
| **Entry point** | `src/main.tsx` → `src/App.tsx` |
| **Types** | `src/types.ts` |
| **Data** | `src/data/units.ts`, `limits.ts`, `scenarios.ts` |
| **Simulation** | `src/simulation/model.ts`, `sizing.ts` |
| **3D Scene** | `src/components/Plant3D.tsx` |
| **Styles** | `src/styles.css` (single file, vanilla CSS) |
| **Tests** | `src/App.test.tsx`, `src/simulation/model.test.ts` |
| **Dev** | `npm run dev` |
| **Test** | `npm test` |
| **Build** | `npm run build` |

---

## Rules & Conventions

### Code Style
- **TypeScript strict mode** — no `any` unless absolutely necessary
- **Functional React** — hooks only, no class components
- **Named exports** for utilities, **default export** for `App`
- **Inline sub-components** in `App.tsx` — components like `StatusPill`, `ControlPanel`, `CompliancePanel` are defined in the same file
- **BEM-ish CSS classes** — e.g., `scenario-card--active`, `status-pill--pass`, `unit--alarm`
- **Bilingual labels** — every user-facing string must have both Thai and English

### Adding a Treatment Unit
1. Add entry to `src/data/units.ts` with all fields (`id`, `order`, `name`, `thaiName`, `kind`, `x`, `y`, `w`, `h`, `purpose`, `designBasis`, `equipmentSpec`, `expectedRemoval`, `riskParameters`, `relatedLimits`)
2. Add physical spec to `physicalSpecs` in `Plant3D.tsx` if dimensions are known
3. Add overflow datum to `overflowDatumCm` if gravity-fed
4. Create 3D model component in `Plant3D.tsx` and add to `UnitModel` switch
5. Add to `flowTourIds` array in `App.tsx`
6. Add `tourNotes`, `tourSizeSpecs`, `tourChemicalNotes` entries if relevant
7. Update simulation stages in `model.ts` if it affects water quality

### Adding a Scenario
1. Add to `scenarios` array in `src/data/scenarios.ts`
2. Provide `id`, `name`, `thaiName`, `description`, `inlet` (QualityState), `controlOverrides`, `targetUnitId`
3. The scenario will automatically appear in the UI

### Adding a ZDHC Parameter
1. Add key to `ParameterKey` union in `types.ts`
2. Add limit entry in `src/data/limits.ts`
3. Add to `baselineInfluent` in `scenarios.ts`
4. Add handling in `multiplyInfluent()`, `applyPrimary()`, `applyBiological()`, `applyTertiary()`, `applyFinalPolishing()` in `model.ts`
5. Add to `focusParameters` in `App.tsx` if it should show in the compliance panel
6. Update `QualityState` default values across scenarios

### Modifying Simulation
- The simulation uses a **fraction reduction model**: `reduce(q, key, fraction)` means `q[key] *= (1 - fraction)`
- Fractions are modified by control slider values (0-100% normalized via `pct()`)
- Stages are sequential: Influent → Primary → Biological → Tertiary → Final Polishing
- **Do not** change the order of stages without understanding cascade effects
- ZDHC compliance is evaluated only on the final effluent

### Modifying 3D Scene
- `Plant3D.tsx` is large (~2054 lines) — each unit has its own model function
- Position is computed from `worldPosition(unit)` using `x, y, w, h` from unit data
- Scale is computed from `unitScale(unit)` using physical specs or fallback
- Colors are per `UnitKind` from `kindColors` map
- Flow pipes use `CatmullRomCurve3` with animated beads (`useFrame`)
- Water surfaces animate with `sin()` wave in `useFrame`
- Labels use `@react-three/drei` `Html` components

---

## Domain Knowledge Cheat Sheet

### Treatment Process (น้ำเสียโรงงานสิ่งทอ)
```
น้ำเสีย → ถังพัก → ปรับ pH → ตกตะกอนเคมี → เติมอากาศ → แยกตะกอน → กรองทราย → กรองคาร์บอน → ปล่อย
                                    ↓ sludge                    ↑ RAS
                              บ่อพักตะกอน → press → เก็บ         │
                                                                  │
                              Secondary Clarifier ────────────────┘
```

### Key Engineering Constraints
- **RAS**: Secondary Clarifier (5) → Primary Clarifier (3) only. No direct pipe to Sludge Holding (8)
- **Holding → EQ**: Uses transfer pump, NOT overflow
- **EQ → Primary → Aeration**: Uses cascade launder (gravity overflow, 5-10 cm drop per step)
- **Overflow datum**: Each basin has progressively lower level (inlet +7cm, EQ -7cm, primary -14cm, aeration -21cm, secondary -28cm)

### ZDHC Compliance Tiers
- **Foundational**: Minimum compliance (pH 6-9, BOD ≤30, COD ≤150, TSS ≤50, etc.)
- **Progressive**: Stricter limits
- **Aspirational**: Most stringent

### Common Failure Troubleshooting
| Parameter Failing | Check These |
|-------------------|-------------|
| pH out of range | EQ+pH dosing, final pH correction |
| Color high | Coagulant/polymer dose, carbon condition |
| BOD/COD high | Aeration health, air flow, organic shock load |
| TSS high | Primary/secondary clarifiers, sand filter |
| NH4-N high | Air flow, aeration health (DO) |
| Sb/metals high | Coagulant dose, final pH correction |

---

## Testing

```bash
# Run all tests
npm test

# Tests verify:
# 1. model.test.ts - Sizing calculations, compliance evaluation, scenario recovery
# 2. App.test.tsx - UI rendering, unit inspector, scenario switching, process manual
```

### Key Test Behaviors
- Normal operation should pass all ZDHC Foundational limits
- Antimony scenario should fail, then recover with `coagulantDose: 96, finalPhCorrection: 96`
- Low air flow should increase COD and NH4 in effluent
- All 11 treatment units should render and be clickable

---

## File Sizes (for context)

| File | Lines | Notes |
|------|-------|-------|
| `App.tsx` | 916 | Main component + all sub-components |
| `Plant3D.tsx` | 2054 | 3D scene — largest file |
| `styles.css` | ~800 | Complete CSS |
| `model.ts` | 227 | Simulation engine |
| `units.ts` | 194 | Unit definitions |
| `scenarios.ts` | 107 | Training scenarios |
| `types.ts` | 114 | TypeScript interfaces |
| `limits.ts` | 27 | ZDHC limit data |
| `sizing.ts` | 33 | Equipment sizing |

---

## Project History (จาก conversation logs)

โปรเจกต์นี้ถูกพัฒนาผ่านหลาย conversation:
- วิเคราะห์ระบบบำบัดน้ำเสีย 2 vendor (Perfect Group vs Thongsathit)
- สร้าง dashboard เปรียบเทียบราคาอุปกรณ์จาก Alibaba
- แปลง PDF ใบเสนอราคาเป็น Excel BOQ
- พัฒนา 3D ETP simulator ตัวนี้จาก Golden Thread design
- ปรับแก้ layout, flow routing, overflow datum, dosing points ตาม CAD จริง
