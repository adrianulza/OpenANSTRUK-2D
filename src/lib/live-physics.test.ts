import { describe, it, expect } from "vitest"
import {
  ropeToForce,
  newSpring,
  springStep,
  springKick,
  springSettled,
  releaseFade,
  SQUISHY_SPRING,
  CALM_SPRING,
} from "@/lib/live-physics"

describe("ropeToForce", () => {
  const anchor = { x: 1, y: 2 }

  it("is linear in rope length below the cap and points along the rope", () => {
    const f = ropeToForce(anchor, { x: 1, y: 1.5 }, 2, 100)
    expect(f.P).toBeCloseTo(25, 12)
    expect(f.px).toBeCloseTo(0, 12)
    expect(f.py).toBeCloseTo(-25, 12)
    expect(f.angleDeg).toBeCloseTo(-90, 12)
    expect(f.capped).toBe(false)
  })

  it("caps the magnitude but keeps following the direction past the cap", () => {
    const f = ropeToForce(anchor, { x: 11, y: 2 }, 2, 100)
    expect(f.P).toBe(100)
    expect(f.px).toBeCloseTo(100, 12)
    expect(f.capped).toBe(true)
    expect(f.ropeLen).toBeCloseTo(10, 12)
  })

  it("gives zero force for a zero-length rope", () => {
    const f = ropeToForce(anchor, anchor, 2, 100)
    expect(f.P).toBe(0)
    expect(f.px).toBe(0)
    expect(f.py).toBe(0)
  })

  it("snaps the angle to 45° steps without changing the magnitude", () => {
    const f = ropeToForce({ x: 0, y: 0 }, { x: 1, y: 0.8 }, 10, 100, true)
    expect(f.angleDeg).toBeCloseTo(45, 12)
    expect(f.P).toBeCloseTo(100 * Math.hypot(1, 0.8) / 10, 12)
    expect(f.px).toBeCloseTo(f.py, 12)
    const g = ropeToForce({ x: 0, y: 0 }, { x: 0.1, y: -1 }, 10, 100, true)
    expect(g.px).toBe(0)
    expect(g.angleDeg).toBeCloseTo(-90, 12)
  })
})

describe("spring", () => {
  it("overshoots (squishy), then settles on the target", () => {
    const s = newSpring()
    const target = { x: 100, y: 0 }
    let peak = 0
    for (let t = 0; t < 4; t += 1 / 60) {
      springStep(s, target, 1 / 60, SQUISHY_SPRING)
      peak = Math.max(peak, s.x)
    }
    expect(peak).toBeGreaterThan(110)
    expect(springSettled(s, target, 100)).toBe(true)
  })

  it("reduced-motion spring never overshoots", () => {
    const s = newSpring()
    let peak = 0
    for (let t = 0; t < 3; t += 1 / 60) {
      springStep(s, { x: 100, y: 0 }, 1 / 60, CALM_SPRING)
      peak = Math.max(peak, s.x)
    }
    expect(peak).toBeLessThanOrEqual(100 + 1e-9)
    expect(s.x).toBeGreaterThan(99)
  })

  it("stays finite with huge or negative frame gaps", () => {
    const s = newSpring()
    springStep(s, { x: 1e6, y: -1e6 }, 10, SQUISHY_SPRING)
    springStep(s, { x: 1e6, y: -1e6 }, -1, SQUISHY_SPRING)
    expect(Number.isFinite(s.x) && Number.isFinite(s.vy)).toBe(true)
  })

  it("a kick produces a bump of roughly the requested amplitude", () => {
    const s = newSpring()
    const target = { x: 0, y: 0 }
    springKick(s, 0, 1, 8, SQUISHY_SPRING)
    let peak = 0
    for (let t = 0; t < 1; t += 1 / 240) {
      springStep(s, target, 1 / 240, SQUISHY_SPRING)
      peak = Math.max(peak, s.y)
    }
    expect(peak).toBeGreaterThan(5)
    expect(peak).toBeLessThan(8)
  })
})

describe("releaseFade", () => {
  it("goes from 1 to 0 monotonically", () => {
    expect(releaseFade(0, 150)).toBe(1)
    expect(releaseFade(75, 150)).toBeCloseTo(0.25, 12)
    expect(releaseFade(150, 150)).toBe(0)
    expect(releaseFade(500, 150)).toBe(0)
  })
})
