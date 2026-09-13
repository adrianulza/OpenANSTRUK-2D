/**
 * Top-level design criteria wrapper. Holds one block per material so a mixed
 * concrete + steel model designs correctly in a single run — each member uses
 * the criteria block matching its section's materialClass.
 *
 * There is no `material` selector here. It used to exist as a UI hint, telling
 * the standalone Design Criteria tool which block to edit; since v1.2.0 each
 * material's preferences live inside that material's own design tool, so the
 * active tool *is* the answer and the field had no readers left.
 *
 * Pure domain module: no React imports.
 */

import { defaultRcCriteria, type RcCriteria } from "../rc/criteria"
import { defaultSteelCriteria, type SteelCriteria } from "../steel/criteria"

export interface DesignCriteria {
  rc: RcCriteria
  steel: SteelCriteria
}

export function defaultDesignCriteria(): DesignCriteria {
  return {
    rc: defaultRcCriteria(),
    steel: defaultSteelCriteria(),
  }
}
