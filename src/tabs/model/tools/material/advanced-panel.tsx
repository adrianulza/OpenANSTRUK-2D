import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApplyButton, ToggleButton } from "@/components/flyout-shared"
import type { Section } from "@/lib/model"
import type { UnitSettings } from "@/lib/units"
import {
  displayE, parseE, labelE,
  displayI, parseI, labelI,
  displayA, parseA, labelA,
} from "@/lib/units"
import { shearModulus } from "@/lib/sections/materials"
import { computeSectionFromParametric } from "@/lib/sections/compute"
import { fmt } from "./section-select"

interface Props {
  open: boolean
  onClose: () => void  // reserved for future use (Esc key, outside-click)
  section: Section
  u: UnitSettings
  canOverride: boolean
  onCommitOverride: (patch: Partial<Section>) => void
  overrideDirty: boolean
  onRecompute: () => void
  onKeepOverride: () => void
}

const DECK_WIDTH = 420
const PILL_WIDTH = 3

export function AdvancedDeck({
  open, onClose: _onClose, section, u,
  canOverride, onCommitOverride, overrideDirty, onRecompute, onKeepOverride,
}: Props) {
  // Measure the flyout DOM so the deck always lines up with its top + sits
  // just to the right of the pill, regardless of viewport size.
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null)
  React.useEffect(() => {
    if (!open || typeof document === "undefined") return
    const root = document.querySelector<HTMLElement>("[data-flyout-root]")
    if (!root) return
    const update = () => {
      const r = root.getBoundingClientRect()
      setPos({ left: r.right + PILL_WIDTH, top: r.top })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(root)
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open])
  const [override, setOverride] = React.useState<boolean>(!!section.overridden)

  React.useEffect(() => {
    setOverride(!!section.overridden)
  }, [section.id, section.overridden])

  const nu = section.nu ?? 0.3
  const G  = section.derived?.G ?? shearModulus(section.E, nu)

  // Parametric baseline — what the section *would* be if recomputed from its
  // current parametric inputs. Used to detect per-field overrides.
  const baseline = React.useMemo<Partial<Section>>(() => {
    if (section.mode !== "parametric" || !section.materialClass || !section.shape) return {}
    return computeSectionFromParametric({
      materialClass: section.materialClass,
      shape:         section.shape.kind,
      dims:          section.shape.dims,
      strength:      section.strength ?? {},
    })
  }, [section])

  type Buf = {
    E: string; G: string; nu: string; gamma: string;
    A: string; I33: string; I22: string;
    "Aκ2": string; "Aκ3": string;
    S33t: string; S33b: string; S22L: string; S22R: string;
    Z33: string; Z22: string; r33: string; r22: string; yBar: string;
  }
  const initBuf = React.useCallback((): Buf => ({
    E:     fmt(displayE(section.E, u)),
    G:     fmt(G),
    nu:    fmt(nu),
    gamma: fmt(section.gamma ?? 0),
    A:     fmt(displayA(section.A, u)),
    I33:   fmt(displayI(section.I33, u)),
    I22:   section.I22 != null ? fmt(displayI(section.I22, u)) : "",
    "Aκ2": section["Aκ2"] != null ? fmt(displayA(section["Aκ2"]!, u)) : "",
    "Aκ3": section["Aκ3"] != null ? fmt(displayA(section["Aκ3"]!, u)) : "",
    S33t:  section.derived?.S33t != null ? fmt(section.derived.S33t) : "",
    S33b:  section.derived?.S33b != null ? fmt(section.derived.S33b) : "",
    S22L:  section.derived?.S22L != null ? fmt(section.derived.S22L) : "",
    S22R:  section.derived?.S22R != null ? fmt(section.derived.S22R) : "",
    Z33:   section.derived?.Z33  != null ? fmt(section.derived.Z33)  : "",
    Z22:   section.derived?.Z22  != null ? fmt(section.derived.Z22)  : "",
    r33:   section.derived?.r33  != null ? fmt(section.derived.r33)  : "",
    r22:   section.derived?.r22  != null ? fmt(section.derived.r22)  : "",
    yBar:  section.derived?.yBar != null ? fmt(section.derived.yBar) : "",
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [section, u, nu, G])
  const [buf, setBuf] = React.useState<Buf>(initBuf)
  React.useEffect(() => { setBuf(initBuf()) }, [initBuf])

  // Compare a current section value's formatted string against the baseline's
  // formatted string. If they differ, the user (or a prior commit) has changed
  // the field away from the parametric-computed value.
  const isOverridden = (key: keyof Buf): boolean => {
    if (!section.overridden) return false
    const b = baseline as Section
    if (!b) return false
    let baseStr = ""
    let curStr  = ""
    switch (key) {
      case "E":     baseStr = b.E    != null ? fmt(displayE(b.E, u))   : ""; curStr = fmt(displayE(section.E, u)); break
      case "G":     baseStr = b.derived?.G    != null ? fmt(b.derived.G)    : ""; curStr = fmt(G); break
      case "nu":    baseStr = b.nu   != null ? fmt(b.nu)   : ""; curStr = fmt(nu); break
      case "gamma": baseStr = b.gamma!= null ? fmt(b.gamma): ""; curStr = fmt(section.gamma ?? 0); break
      case "A":     baseStr = b.A    != null ? fmt(displayA(b.A, u))   : ""; curStr = fmt(displayA(section.A, u)); break
      case "I33":   baseStr = b.I33  != null ? fmt(displayI(b.I33, u)) : ""; curStr = fmt(displayI(section.I33, u)); break
      case "I22":   baseStr = b.I22  != null ? fmt(displayI(b.I22, u)) : ""; curStr = section.I22 != null ? fmt(displayI(section.I22, u)) : ""; break
      case "Aκ2":   baseStr = b["Aκ2"] != null ? fmt(displayA(b["Aκ2"]!, u)) : ""; curStr = section["Aκ2"] != null ? fmt(displayA(section["Aκ2"]!, u)) : ""; break
      case "Aκ3":   baseStr = b["Aκ3"] != null ? fmt(displayA(b["Aκ3"]!, u)) : ""; curStr = section["Aκ3"] != null ? fmt(displayA(section["Aκ3"]!, u)) : ""; break
      case "S33t":  baseStr = b.derived?.S33t != null ? fmt(b.derived.S33t) : ""; curStr = section.derived?.S33t != null ? fmt(section.derived.S33t) : ""; break
      case "S33b":  baseStr = b.derived?.S33b != null ? fmt(b.derived.S33b) : ""; curStr = section.derived?.S33b != null ? fmt(section.derived.S33b) : ""; break
      case "S22L":  baseStr = b.derived?.S22L != null ? fmt(b.derived.S22L) : ""; curStr = section.derived?.S22L != null ? fmt(section.derived.S22L) : ""; break
      case "S22R":  baseStr = b.derived?.S22R != null ? fmt(b.derived.S22R) : ""; curStr = section.derived?.S22R != null ? fmt(section.derived.S22R) : ""; break
      case "Z33":   baseStr = b.derived?.Z33  != null ? fmt(b.derived.Z33)  : ""; curStr = section.derived?.Z33  != null ? fmt(section.derived.Z33)  : ""; break
      case "Z22":   baseStr = b.derived?.Z22  != null ? fmt(b.derived.Z22)  : ""; curStr = section.derived?.Z22  != null ? fmt(section.derived.Z22)  : ""; break
      case "r33":   baseStr = b.derived?.r33  != null ? fmt(b.derived.r33)  : ""; curStr = section.derived?.r33  != null ? fmt(section.derived.r33)  : ""; break
      case "r22":   baseStr = b.derived?.r22  != null ? fmt(b.derived.r22)  : ""; curStr = section.derived?.r22  != null ? fmt(section.derived.r22)  : ""; break
      case "yBar":  baseStr = b.derived?.yBar != null ? fmt(b.derived.yBar) : ""; curStr = section.derived?.yBar != null ? fmt(section.derived.yBar) : ""; break
    }
    return baseStr !== "" && curStr !== "" && baseStr !== curStr
  }

  const [commitError, setCommitError] = React.useState<string | null>(null)
  const commit = () => {
    const Eval   = parseE(parseFloat(buf.E), u)
    const gVal   = parseFloat(buf.gamma)
    const nuVal  = parseFloat(buf.nu)
    const Gval   = parseFloat(buf.G)
    const Aval   = parseA(parseFloat(buf.A), u)
    const I33val = parseI(parseFloat(buf.I33), u)
    if (!(Eval > 0))   { setCommitError("E must be > 0");    return }
    if (!(I33val > 0)) { setCommitError("I33 must be > 0");  return }
    if (!(Aval > 0))   { setCommitError("A must be > 0");    return }
    if (!(nuVal > 0 && nuVal < 0.5)) { setCommitError("ν must be 0 < ν < 0.5"); return }
    if (!(Number.isFinite(gVal) && gVal >= 0)) { setCommitError("γ must be ≥ 0"); return }
    if (!(Gval > 0))   { setCommitError("G must be > 0");    return }
    setCommitError(null)

    const num = (s: string): number | undefined => {
      if (s.trim() === "") return undefined
      const n = parseFloat(s)
      return Number.isFinite(n) ? n : undefined
    }
    const numA = (s: string): number | undefined => {
      const n = num(s); return n != null ? parseA(n, u) : undefined
    }
    const numI = (s: string): number | undefined => {
      const n = num(s); return n != null ? parseI(n, u) : undefined
    }

    const patch: Partial<Section> = {
      E:     Eval,
      I33:   I33val,
      A:     Aval,
      nu:    nuVal,
      gamma: gVal,
      overridden: true,
    }
    const aκ2v = numA(buf["Aκ2"]); if (aκ2v != null) patch["Aκ2"] = aκ2v
    const aκ3v = numA(buf["Aκ3"]); if (aκ3v != null) patch["Aκ3"] = aκ3v
    const i22v = numI(buf.I22);    if (i22v != null) patch.I22 = i22v

    // Post-processing values: persist into section.derived (current solver
    // doesn't read these, but the future Design tab + 3D solver will).
    const baseDerived = section.derived ?? ({} as NonNullable<Section["derived"]>)
    patch.derived = {
      ...baseDerived,
      G:    Gval,
      S33t: num(buf.S33t) ?? baseDerived.S33t,
      S33b: num(buf.S33b) ?? baseDerived.S33b,
      S22L: num(buf.S22L) ?? baseDerived.S22L,
      S22R: num(buf.S22R) ?? baseDerived.S22R,
      Z33:  num(buf.Z33)  ?? baseDerived.Z33,
      Z22:  num(buf.Z22)  ?? baseDerived.Z22,
      r33:  num(buf.r33)  ?? baseDerived.r33,
      r22:  num(buf.r22)  ?? baseDerived.r22,
      yBar: num(buf.yBar) ?? baseDerived.yBar,
    }
    onCommitOverride(patch)
  }

  if (!open) return null
  if (typeof document === "undefined" || !pos) return null

  const editable = canOverride && override

  const deck = (
    <div
      className={cn(
        "fixed bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-100 z-10",
        "animate-in fade-in slide-in-from-left-2 duration-150 ease-out",
        "flex flex-col max-h-[calc(100dvh-5rem)]",
      )}
      style={{ left: pos.left, top: pos.top, width: DECK_WIDTH }}
    >
      <div className="pl-7 pr-3 py-2 border-b border-gray-100 flex items-center justify-between">
        <span className="text-xs font-semibold text-[#1a2f5e]">Advanced Section Properties</span>
        {canOverride && (
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] text-gray-500 uppercase tracking-wide">Override</Label>
            <ToggleButton
              active={override}
              onClick={() => {
                if (override) {
                  // Turning Off: revert to parametric-computed values and clear
                  // the overridden flag. (Re-compute discards any manual edits.)
                  onRecompute()
                  setOverride(false)
                } else {
                  setOverride(true)
                }
              }}
              className="!flex-none h-5 text-[10px] px-2"
            >
              {override ? "On" : "Off"}
            </ToggleButton>
          </div>
        )}
      </div>

      <div className="p-3 pl-7 overflow-y-auto space-y-2">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {/* Left column: solver inputs    Right column: post-processing values */}
          <Row name="Elastic Modulus" symbol="E" value={editable ? buf.E : fmt(displayE(section.E, u))} unit={labelE(u)} editable={editable} overridden={isOverridden("E")} onChange={(v) => setBuf({ ...buf, E: v })} />
          <Row name="Section Modulus (top)" symbol="S33t" value={editable ? buf.S33t : (section.derived?.S33t != null ? fmt(section.derived.S33t) : "—")} unit="mm³" editable={editable} overridden={isOverridden("S33t")} onChange={(v) => setBuf({ ...buf, S33t: v })} />

          <Row name="Shear Modulus" symbol="G" value={editable ? buf.G : fmt(G)} unit="MPa" editable={editable} overridden={isOverridden("G")} onChange={(v) => setBuf({ ...buf, G: v })} />
          <Row name="Section Modulus (bottom)" symbol="S33b" value={editable ? buf.S33b : (section.derived?.S33b != null ? fmt(section.derived.S33b) : "—")} unit="mm³" editable={editable} overridden={isOverridden("S33b")} onChange={(v) => setBuf({ ...buf, S33b: v })} />

          <Row name="Poisson Ratio" symbol="ν" value={editable ? buf.nu : fmt(nu)} unit="" editable={editable} overridden={isOverridden("nu")} onChange={(v) => setBuf({ ...buf, nu: v })} />
          <Row name="Section Modulus" symbol="S22L" value={editable ? buf.S22L : (section.derived?.S22L != null ? fmt(section.derived.S22L) : "—")} unit="mm³" editable={editable} overridden={isOverridden("S22L")} onChange={(v) => setBuf({ ...buf, S22L: v })} />

          <Row name="Unit Weight" symbol="γ" value={editable ? buf.gamma : fmt(section.gamma ?? 0)} unit="kN/m³" editable={editable} overridden={isOverridden("gamma")} onChange={(v) => setBuf({ ...buf, gamma: v })} />
          <Row name="Section Modulus" symbol="S22R" value={editable ? buf.S22R : (section.derived?.S22R != null ? fmt(section.derived.S22R) : "—")} unit="mm³" editable={editable} overridden={isOverridden("S22R")} onChange={(v) => setBuf({ ...buf, S22R: v })} />

          <Row name="Cross-section Area" symbol="A" value={editable ? buf.A : fmt(displayA(section.A, u))} unit={labelA(u)} editable={editable} overridden={isOverridden("A")} onChange={(v) => setBuf({ ...buf, A: v })} />
          <Row name="Plastic Modulus" symbol="Z33" value={editable ? buf.Z33 : (section.derived?.Z33 != null ? fmt(section.derived.Z33) : "—")} unit="mm³" editable={editable} overridden={isOverridden("Z33")} onChange={(v) => setBuf({ ...buf, Z33: v })} />

          <Row name="Moment of Inertia" symbol="I33" value={editable ? buf.I33 : fmt(displayI(section.I33, u))} unit={labelI(u)} editable={editable} overridden={isOverridden("I33")} onChange={(v) => setBuf({ ...buf, I33: v })} />
          <Row name="Plastic Modulus" symbol="Z22" value={editable ? buf.Z22 : (section.derived?.Z22 != null ? fmt(section.derived.Z22) : "—")} unit="mm³" editable={editable} overridden={isOverridden("Z22")} onChange={(v) => setBuf({ ...buf, Z22: v })} />

          <Row name="Moment of Inertia" symbol="I22" value={editable ? buf.I22 : (section.I22 != null ? fmt(displayI(section.I22, u)) : "—")} unit={labelI(u)} editable={editable} overridden={isOverridden("I22")} onChange={(v) => setBuf({ ...buf, I22: v })} />
          <Row name="Radius of Gyration" symbol="r33" value={editable ? buf.r33 : (section.derived?.r33 != null ? fmt(section.derived.r33) : "—")} unit="mm" editable={editable} overridden={isOverridden("r33")} onChange={(v) => setBuf({ ...buf, r33: v })} />

          <Row name="Shear Area" symbol="Aκ2" value={editable ? buf["Aκ2"] : (section["Aκ2"] != null ? fmt(displayA(section["Aκ2"]!, u)) : "—")} unit={labelA(u)} editable={editable} overridden={isOverridden("Aκ2")} onChange={(v) => setBuf({ ...buf, "Aκ2": v })} />
          <Row name="Radius of Gyration" symbol="r22" value={editable ? buf.r22 : (section.derived?.r22 != null ? fmt(section.derived.r22) : "—")} unit="mm" editable={editable} overridden={isOverridden("r22")} onChange={(v) => setBuf({ ...buf, r22: v })} />

          <Row name="Shear Area" symbol="Aκ3" value={editable ? buf["Aκ3"] : (section["Aκ3"] != null ? fmt(displayA(section["Aκ3"]!, u)) : "—")} unit={labelA(u)} editable={editable} overridden={isOverridden("Aκ3")} onChange={(v) => setBuf({ ...buf, "Aκ3": v })} />
          <Row name="Centroid (from base)" symbol="ȳ" value={editable ? buf.yBar : (section.derived?.yBar != null ? fmt(section.derived.yBar) : "—")} unit="mm" editable={editable} overridden={isOverridden("yBar")} onChange={(v) => setBuf({ ...buf, yBar: v })} />
        </div>

        {overrideDirty && canOverride && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-900 space-y-1.5">
            <div>Computed values were overridden. Re-computing will discard your manual values.</div>
            <div className="flex gap-1.5">
              <Button size="sm" className="h-6 text-[10px] px-2" onClick={onRecompute}>Re-compute</Button>
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={onKeepOverride}>Keep</Button>
            </div>
          </div>
        )}

        {editable && (
          <>
            {commitError && (
              <p className="text-[10px] text-red-500 mt-1">{commitError}</p>
            )}
            <ApplyButton onClick={commit} className="mt-2">
              Apply Override
            </ApplyButton>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(deck, document.body)
}

function Row({
  name, symbol, value, unit, editable, overridden, onChange, disabled,
}: {
  name: string
  symbol: string
  value: string
  unit: string
  editable?: boolean
  overridden?: boolean
  onChange?: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1 min-w-0">
      <Label className="text-[11px] text-gray-600 block truncate" title={`${name}, ${symbol}${overridden ? " (overridden)" : ""}`}>
        {name}, <span className="font-medium text-[#1a2f5e]">{symbol}</span>
        {overridden && <span className="text-amber-600 ml-1">(overridden)</span>}
      </Label>
      <div className="flex items-center gap-1.5">
        <Input
          type="text"
          value={value}
          disabled={!editable || disabled}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn("h-7 text-xs font-mono flex-1 min-w-0", !editable && "bg-gray-50 text-gray-700")}
        />
        <span className="text-[10px] text-gray-500 w-10 shrink-0 text-right">{unit}</span>
      </div>
    </div>
  )
}
