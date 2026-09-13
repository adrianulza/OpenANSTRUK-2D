/**
 * AISC 360-16 section classification for local buckling (Chapter B, Table B4.1).
 *
 * Two independent classifications, because the limits differ:
 *   - FLEXURE (Table B4.1b): compact / noncompact / slender
 *   - AXIAL  (Table B4.1a):  nonslender / slender  (there is no "compact" for
 *     pure compression — an element either reaches Fy or it does not)
 *
 * Pure domain module: no React imports. All inputs mm / MPa.
 *
 * Reference: CSI "Steel Frame Design AISC 360-16" Tables 3-1 and 3-2, which
 * reproduce AISC Table B4.1b and B4.1a respectively.
 */

import type { SectionShape } from "@/lib/model"

export type ElementClass = "compact" | "noncompact" | "slender"
/** Governing class for the whole section = worst of its elements. */
export type SectionClass = ElementClass

export interface ElementCheck {
  /** "flange" | "web" | "wall" — which plate element. */
  name: string
  /** Width-to-thickness ratio λ. */
  lambda: number
  /** Compact limit λp (undefined for axial, which has no compact limit). */
  lambdaP?: number
  /** Noncompact limit λr — beyond this the element is slender. */
  lambdaR: number
  cls: ElementClass
}

export interface Classification {
  /** Worst element governs. */
  cls: SectionClass
  elements: ElementCheck[]
}

/** Rank so the worst element can be picked without a comparison chain. */
const RANK: Record<ElementClass, number> = { compact: 0, noncompact: 1, slender: 2 }

function worst(elements: ElementCheck[]): SectionClass {
  return elements.reduce<SectionClass>(
    (acc, e) => (RANK[e.cls] > RANK[acc] ? e.cls : acc),
    "compact",
  )
}

function classify(lambda: number, lambdaP: number | undefined, lambdaR: number): ElementClass {
  if (lambdaP !== undefined && lambda <= lambdaP) return "compact"
  if (lambda <= lambdaR) return "noncompact"
  return "slender"
}

/**
 * kc for built-up I-shape flanges (AISC Table B4.1b note a), clamped to
 * 0.35 ≤ kc ≤ 0.76. Our parametric IWF is always treated as built-up (welded)
 * because it carries no fillet data — the same idealisation CSI uses in its
 * "built-up wide flange" verification example.
 */
export function kc(h: number, tw: number): number {
  if (!(h > 0 && tw > 0)) return 0.76
  const raw = 4 / Math.sqrt(h / tw)
  return Math.min(0.76, Math.max(0.35, raw))
}

// ── Geometry extraction ──────────────────────────────────────────────────────

export interface SteelGeom {
  kind: SectionShape
  /** Flange width / overall width, mm. */
  b: number
  /** Overall depth, mm. */
  h: number
  /** Flange thickness (or wall thickness for hollow shapes), mm. */
  tf: number
  /** Web thickness (or wall thickness for hollow shapes), mm. */
  tw: number
  /**
   * Depth used for web/stem classification, mm.
   *   I-shape : clear web between flanges, h − 2·tf
   *   box     : clear web, h − 2·t
   *   tee     : the FULL nominal depth h — CSI §3.3(d), "for stems of tees, d is
   *             taken as the full nominal depth of the section"
   *   angle   : the vertical leg length d
   */
  hw: number
  /** Outside diameter, mm (chs only). */
  D?: number
}

export function steelGeom(kind: SectionShape, dims: Record<string, number>): SteelGeom {
  switch (kind) {
    case "iwf": {
      const { b, h, tf, tw } = dims
      return { kind, b, h, tf, tw, hw: h - 2 * tf }
    }
    case "rhs": {
      // AISC B4.1b(d) allows "outside dimension minus three times the
      // thickness" when the corner radius is unknown — but that allowance
      // exists for COLD-FORMED HSS, which have a corner radius. OpenAnstruk's
      // `rhs` is a SHARP-CORNERED welded box: `sections/shapes/rhs.ts` computes
      // its properties from bi = b − 2t and hi = h − 2t, with no radius. The
      // flat width is therefore exactly the outside dimension less TWO
      // thicknesses, and using 3t here would both contradict our own section
      // geometry and understate λ (unconservative for classification).
      // SAP2000 models SetTube the same way — confirmed by matching φVn in
      // validation/sap2000-bridge/cases/steel_shapes.json.
      const { b, h, t } = dims
      return { kind, b: b - 2 * t, h, tf: t, tw: t, hw: h - 2 * t }
    }
    case "chs": {
      const { d, t } = dims
      return { kind, b: d, h: d, tf: t, tw: t, hw: d, D: d }
    }
    case "tee": {
      // Steel WT: flange on top, stem down. `bw` is the stem thickness.
      // `hw = h`, NOT h − tf: AISC measures a tee stem over the full nominal
      // depth (CSI §3.3(d)), because the stem is an unstiffened element free
      // along its bottom edge rather than a plate framed between two flanges.
      const { bf, tf, bw, h } = dims
      return { kind, b: bf, h, tf, tw: bw, hw: h }
    }
    case "angle": {
      // Single angle. `b` = horizontal leg (along geometric axis 3), `d` =
      // vertical leg (axis 2), one thickness `t` for both. Legs are unstiffened
      // outstands, so each is classified on its FULL width (CSI §3.3(b), "for
      // legs of angles ... the width b is the full leg width") — there is no
      // half-width as there is for an I-shape flange.
      const b = dims.b
      const t = dims.t
      const d = dims.d ?? b // back-compat with pre-unequal-leg sections
      return { kind, b, h: d, tf: t, tw: t, hw: d }
    }
    default:
      throw new Error(`steelGeom: shape ${kind} has no AISC classification mapping`)
  }
}

// ── Flexural classification (Table B4.1b / CSI Table 3-1) ────────────────────

/**
 * @param momentSign Sign of the design moment, for singly symmetric shapes where
 *   which element is in COMPRESSION depends on it. Only the tee reads it: AISC
 *   classifies compression elements, so a tee stem in tension is not classified
 *   at all, and neither is a flange in tension. Verified against SAP2000, which
 *   reports the same tee as "Compact" sagging and "Non-Compact" hogging.
 *   Defaults to +1 (sagging), which is inert for every doubly symmetric shape.
 */
export function classifyFlexure(
  g: SteelGeom, Fy: number, E: number, momentSign: 1 | -1 = 1,
): Classification {
  const sq = Math.sqrt(E / Fy)
  const elements: ElementCheck[] = []

  if (g.kind === "iwf") {
    // Case 11 — flexural compression in flanges of BUILT-UP I-shapes.
    // λp = 0.38√(E/Fy); λr = 0.95√(kc·E/FL) with FL = 0.7Fy (Note b).
    const lamF = g.b / (2 * g.tf)
    const FL = 0.7 * Fy
    const lamRF = 0.95 * Math.sqrt((kc(g.hw, g.tw) * E) / FL)
    elements.push({
      name: "flange", lambda: lamF, lambdaP: 0.38 * sq, lambdaR: lamRF,
      cls: classify(lamF, 0.38 * sq, lamRF),
    })
    // Case 15 — flexure in web: λp = 3.76√(E/Fy), λr = 5.70√(E/Fy).
    const lamW = g.hw / g.tw
    elements.push({
      name: "web", lambda: lamW, lambdaP: 3.76 * sq, lambdaR: 5.70 * sq,
      cls: classify(lamW, 3.76 * sq, 5.70 * sq),
    })
  } else if (g.kind === "rhs") {
    // Case 17 — flange: λp = 1.12√(E/Fy), λr = 1.40√(E/Fy).
    //
    // CSI Table 3-1 splits "Rectangular HSS" (λr = 1.40√(E/Fy)) from "Box"
    // (λr = 1.49√(E/Fy)), and since `steelGeom` models this shape as a welded
    // box it is tempting to take the 1.49 row. That is wrong here, and F7-2
    // says why: its constants are calibrated against 1.40. At λ = 1.40√(E/Fy),
    //     3.57·λ·√(Fy/E) − 4.0  =  3.57·1.40 − 4.0  =  1.0  (exactly)
    // so F7-2 lands precisely on My and hands over to F7-3 with no step. Pair
    // it with 1.49 and the bracket reaches 1.319, F7-2 undershoots My, and the
    // F7-2 → F7-3 handover opens a 0.16% upward discontinuity — caught by the
    // monotonicity check in validation/steel_boundary_sweep.mts. AISC Table
    // B4.1b case 17, which Chapter F7 actually references, covers "rectangular
    // HSS AND BOXES of uniform thickness" in ONE row at 1.40. CSI's 1.49 row
    // matches case 18 (cover/diaphragm plates between lines of welds), which is
    // not the case F7 is written against.
    const lamF = g.b / g.tf
    elements.push({
      name: "flange", lambda: lamF, lambdaP: 1.12 * sq, lambdaR: 1.40 * sq,
      cls: classify(lamF, 1.12 * sq, 1.40 * sq),
    })
    // Case 19 — web: λp = 2.42√(E/Fy), λr = 5.70√(E/Fy). Identical for the
    // rectangular-HSS and box rows, so no distinction is needed here.
    const lamW = g.hw / g.tw
    elements.push({
      name: "web", lambda: lamW, lambdaP: 2.42 * sq, lambdaR: 5.70 * sq,
      cls: classify(lamW, 2.42 * sq, 5.70 * sq),
    })
  } else if (g.kind === "chs") {
    // Case 20 — round HSS in flexure, D/t based (note these are E/Fy, NOT √).
    const lam = (g.D ?? g.h) / g.tf
    elements.push({
      name: "wall", lambda: lam,
      lambdaP: (0.07 * E) / Fy, lambdaR: (0.31 * E) / Fy,
      cls: classify(lam, (0.07 * E) / Fy, (0.31 * E) / Fy),
    })
  } else if (g.kind === "tee") {
    // A tee is singly symmetric, so only ONE of its two elements is in
    // compression at a time. Sagging (momentSign +1) puts the flange in
    // compression and the stem in tension; hogging reverses it. Table B4.1b
    // classifies COMPRESSION elements, so the tension-side element is left out
    // — which is why SAP2000 reports this same section as "Compact" sagging and
    // "Non-Compact" hogging.
    if (momentSign >= 0) {
      // Case 10 — flanges of tees: λp = 0.38√(E/Fy), λr = 1.0√(E/Fy).
      //
      // Note the asymmetry with our IWF above, which uses the BUILT-UP case 11
      // (λr = 0.95√(kc·E/FL), kc-dependent). CSI Table 3-1's T-Shape row is
      // case 10 — the rolled limit — with no built-up variant offered, and AISC
      // F9.3 references case 10 directly. A WT is made by splitting a rolled
      // I-shape, so the rolled row is also the physically right one. Kept as the
      // code writes it rather than "harmonised" with the IWF treatment.
      const lamF = g.b / (2 * g.tf)
      elements.push({
        name: "flange", lambda: lamF, lambdaP: 0.38 * sq, lambdaR: 1.0 * sq,
        cls: classify(lamF, 0.38 * sq, 1.0 * sq),
      })
    } else {
      // Case 14 — compression in stems: λp = 0.84√(E/Fy), λr = 1.52√(E/Fy),
      // on the FULL depth d/tw.
      const lamS = g.hw / g.tw
      elements.push({
        name: "stem", lambda: lamS, lambdaP: 0.84 * sq, lambdaR: 1.52 * sq,
        cls: classify(lamS, 0.84 * sq, 1.52 * sq),
      })
    }
  } else if (g.kind === "angle") {
    // Case 12 — flexural compression in ANY leg of a single angle:
    // λp = 0.54√(E/Fy), λr = 0.91√(E/Fy). Both legs are checked and the worse
    // governs, which matters once the legs may be unequal.
    const lamB = g.b / g.tf
    elements.push({
      name: "leg-b", lambda: lamB, lambdaP: 0.54 * sq, lambdaR: 0.91 * sq,
      cls: classify(lamB, 0.54 * sq, 0.91 * sq),
    })
    const lamD = g.hw / g.tw
    elements.push({
      name: "leg-d", lambda: lamD, lambdaP: 0.54 * sq, lambdaR: 0.91 * sq,
      cls: classify(lamD, 0.54 * sq, 0.91 * sq),
    })
  }

  return { cls: worst(elements), elements }
}

// ── Axial classification (Table B4.1a / CSI Table 3-2) ───────────────────────

/**
 * Compression has no "compact" tier — only nonslender (reported here as
 * `noncompact`) or slender. Only λr is defined.
 */
export function classifyAxial(g: SteelGeom, Fy: number, E: number): Classification {
  const sq = Math.sqrt(E / Fy)
  const elements: ElementCheck[] = []

  if (g.kind === "iwf") {
    // Case 2 — flanges of built-up I-shapes: λr = 0.64√(kc·E/Fy).
    const lamF = g.b / (2 * g.tf)
    const lamRF = 0.64 * Math.sqrt((kc(g.hw, g.tw) * E) / Fy)
    elements.push({
      name: "flange", lambda: lamF, lambdaR: lamRF,
      cls: classify(lamF, undefined, lamRF),
    })
    // Case 5 — web in axial compression: λr = 1.49√(E/Fy).
    const lamW = g.hw / g.tw
    elements.push({
      name: "web", lambda: lamW, lambdaR: 1.49 * sq,
      cls: classify(lamW, undefined, 1.49 * sq),
    })
  } else if (g.kind === "rhs") {
    // Case 6 — walls of rectangular HSS: λr = 1.40√(E/Fy).
    const lamF = g.b / g.tf
    const lamW = g.hw / g.tw
    elements.push({
      name: "flange", lambda: lamF, lambdaR: 1.40 * sq,
      cls: classify(lamF, undefined, 1.40 * sq),
    })
    elements.push({
      name: "web", lambda: lamW, lambdaR: 1.40 * sq,
      cls: classify(lamW, undefined, 1.40 * sq),
    })
  } else if (g.kind === "chs") {
    // Case 9 — round HSS in axial compression: λr = 0.11·E/Fy.
    const lam = (g.D ?? g.h) / g.tf
    elements.push({
      name: "wall", lambda: lam, lambdaR: (0.11 * E) / Fy,
      cls: classify(lam, undefined, (0.11 * E) / Fy),
    })
  } else if (g.kind === "tee") {
    // Case 2 — axial compression in flanges of tees: λr = 0.56√(E/Fy).
    const lamF = g.b / (2 * g.tf)
    elements.push({
      name: "flange", lambda: lamF, lambdaR: 0.56 * sq,
      cls: classify(lamF, undefined, 0.56 * sq),
    })
    // Case 4 — compression in stems of tees: λr = 0.75√(E/Fy), on d/tw.
    const lamS = g.hw / g.tw
    elements.push({
      name: "stem", lambda: lamS, lambdaR: 0.75 * sq,
      cls: classify(lamS, undefined, 0.75 * sq),
    })
  } else if (g.kind === "angle") {
    // Case 3 — axial compression in any leg of a single angle: λr = 0.45√(E/Fy).
    const lamB = g.b / g.tf
    elements.push({
      name: "leg-b", lambda: lamB, lambdaR: 0.45 * sq,
      cls: classify(lamB, undefined, 0.45 * sq),
    })
    const lamD = g.hw / g.tw
    elements.push({
      name: "leg-d", lambda: lamD, lambdaR: 0.45 * sq,
      cls: classify(lamD, undefined, 0.45 * sq),
    })
  }

  return { cls: worst(elements), elements }
}

/** Human label matching SAP2000's "Compact"/"NonCompact"/"Slender" output. */
export function classLabel(c: SectionClass): string {
  return c === "compact" ? "Compact" : c === "noncompact" ? "NonCompact" : "Slender"
}
