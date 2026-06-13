/**
 * Top-level design criteria wrapper. Holds one block per material so a mixed
 * concrete + steel model designs correctly in a single run — each member uses
 * the criteria block matching its section's materialClass. The `material` field
 * is a UI hint only (which block the Design Criteria tool is currently editing).
 *
 * Pure domain module: no React imports.
 */

import type { DesignMaterial } from "./types"
import { defaultRcCriteria, type RcCriteria } from "../rc/criteria"
import { defaultSteelCriteria, type SteelCriteria } from "../steel/criteria"

export interface DesignCriteria {
  /** Which material block the criteria tool is editing (UI only). */
  material: DesignMaterial
  rc: RcCriteria
  steel: SteelCriteria
}

export function defaultDesignCriteria(): DesignCriteria {
  return {
    material: "rc",
    rc: defaultRcCriteria(),
    steel: defaultSteelCriteria(),
  }
}
