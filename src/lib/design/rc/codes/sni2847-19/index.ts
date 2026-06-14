/**
 * ACI 318-25 / SNI 2847:2019 RC code module — barrel.
 *
 * Bundles this code's beam + column + report math behind one namespace so the
 * strategy/UI can swap codes by importing a different folder. Geometry stays in
 * ../../shared/; only the clause math lives here.
 */

export * from "./beam"
export * from "./column"
export * from "./report"
export { beta1, EPS_CU, EPS_T_MIN, asMin, maxCrackSpacing } from "./rules"
