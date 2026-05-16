import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Section } from "@/lib/model"
import type { UnitSettings } from "@/lib/units"
import {
  displayE, parseE, labelE,
  displayI, parseI, labelI,
  displayA, parseA, labelA,
} from "@/lib/units"
import { shearModulus } from "./materials"
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

const DECK_WIDTH = 240
const PILL_WIDTH = 20

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

  type Buf = { E: string; I33: string; A: string; "Aκ2": string; nu: string; gamma: string; G: string }
  const aκ2Initial = section["Aκ2"]
  const initBuf = React.useCallback((): Buf => ({
    E:     fmt(displayE(section.E, u)),
    I33:   fmt(displayI(section.I33, u)),
    A:     fmt(displayA(section.A, u)),
    "Aκ2": aκ2Initial != null ? fmt(displayA(aκ2Initial, u)) : "",
    nu:    fmt(nu),
    gamma: fmt(section.gamma ?? 0),
    G:     fmt(G),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [section, u, nu, G])
  const [buf, setBuf] = React.useState<Buf>(initBuf)
  React.useEffect(() => { setBuf(initBuf()) }, [initBuf])

  const commit = () => {
    const patch: Partial<Section> = {
      E:     parseE(parseFloat(buf.E), u),
      I33:   parseI(parseFloat(buf.I33), u),
      A:     parseA(parseFloat(buf.A), u),
      nu:    parseFloat(buf.nu),
      gamma: parseFloat(buf.gamma),
      overridden: true,
    }
    if (buf["Aκ2"].trim() !== "") patch["Aκ2"] = parseA(parseFloat(buf["Aκ2"]), u)
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
      <div className="p-3 overflow-y-auto space-y-2">

        {canOverride && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-600">Override</Label>
            <Button
              size="sm"
              variant={override ? "default" : "outline"}
              className="h-6 text-[10px] px-2"
              onClick={() => setOverride((v) => !v)}
            >
              {override ? "On" : "Off"}
            </Button>
          </div>
        )}

        {overrideDirty && canOverride && (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-900 space-y-1.5">
            <div>Computed values were overridden. Re-computing will discard your manual values.</div>
            <div className="flex gap-1.5">
              <Button size="sm" className="h-6 text-[10px] px-2" onClick={onRecompute}>Re-compute</Button>
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={onKeepOverride}>Keep</Button>
            </div>
          </div>
        )}

        <Row name="Elastic Modulus"             symbol="E"   value={editable ? buf.E  : fmt(displayE(section.E, u))} unit={labelE(u)} editable={editable} onChange={(v) => setBuf({ ...buf, E: v })} />
        <Row name="Shear Modulus"               symbol="G"   value={editable ? buf.G  : fmt(G)}                     unit="MPa"        editable={editable} onChange={(v) => setBuf({ ...buf, G: v })} disabled />
        <Row name="Poisson Ratio"               symbol="ν"   value={editable ? buf.nu : fmt(nu)}                    unit=""           editable={editable} onChange={(v) => setBuf({ ...buf, nu: v })} />
        <Row name="Unit Weight"                 symbol="γ"   value={editable ? buf.gamma : fmt(section.gamma ?? 0)}  unit="kN/m³"     editable={editable} onChange={(v) => setBuf({ ...buf, gamma: v })} />
        <Row name="Cross-section Area"          symbol="A"   value={editable ? buf.A   : fmt(displayA(section.A, u))} unit={labelA(u)} editable={editable} onChange={(v) => setBuf({ ...buf, A: v })} />
        <Row name="Moment of Inertia, I33"  symbol="I33"  value={editable ? buf.I33 : fmt(displayI(section.I33, u))} unit={labelI(u)} editable={editable} onChange={(v) => setBuf({ ...buf, I33: v })} />
        <Row name="Moment of Inertia, I22"  symbol="I22"  value={section.I22 != null ? fmt(displayI(section.I22, u)) : "—"} unit={labelI(u)} />
        <Row name="Section Modulus (bottom)" symbol="S33b" value={section.derived?.S33b != null ? fmt(section.derived.S33b) : "—"} unit="mm³" />
        <Row name="Section Modulus (top)"    symbol="S33t" value={section.derived?.S33t != null ? fmt(section.derived.S33t) : "—"} unit="mm³" />
        <Row name="Section Modulus, S22L"    symbol="S22L" value={section.derived?.S22L != null ? fmt(section.derived.S22L) : "—"} unit="mm³" />
        <Row name="Section Modulus, S22R"    symbol="S22R" value={section.derived?.S22R != null ? fmt(section.derived.S22R) : "—"} unit="mm³" />
        <Row name="Plastic Modulus, Z33"     symbol="Z33"  value={section.derived?.Z33  != null ? fmt(section.derived.Z33)  : "—"} unit="mm³" />
        <Row name="Plastic Modulus, Z22"     symbol="Z22"  value={section.derived?.Z22  != null ? fmt(section.derived.Z22)  : "—"} unit="mm³" />
        <Row name="Shear Area, Aκ2"          symbol="Aκ2"  value={editable ? buf["Aκ2"] : (section["Aκ2"] != null ? fmt(displayA(section["Aκ2"]!, u)) : "—")} unit={labelA(u)} editable={editable} onChange={(v) => setBuf({ ...buf, "Aκ2": v })} />
        <Row name="Shear Area, Aκ3"          symbol="Aκ3"  value={section["Aκ3"] != null ? fmt(displayA(section["Aκ3"]!, u)) : "—"} unit={labelA(u)} />
        <Row name="Radius of Gyration, r33"  symbol="r33"  value={section.derived?.r33  != null ? fmt(section.derived.r33)  : "—"} unit="mm" />
        <Row name="Radius of Gyration, r22"  symbol="r22"  value={section.derived?.r22  != null ? fmt(section.derived.r22)  : "—"} unit="mm" />
        <Row name="Centroid (from base)"        symbol="ȳ"   value={section.derived?.yBar != null ? fmt(section.derived.yBar) : "—"} unit="mm" />

        {editable && (
          <Button size="sm" className="w-full h-7 text-xs mt-2" onClick={commit}>
            Apply Override
          </Button>
        )}
      </div>
    </div>
  )

  return createPortal(deck, document.body)
}

function Row({
  name, symbol, value, unit, editable, onChange, disabled,
}: {
  name: string
  symbol: string
  value: string
  unit: string
  editable?: boolean
  onChange?: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">
        {name}, <span className="font-medium text-[#1a2f5e]">{symbol}</span>
      </Label>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={value}
          disabled={!editable || disabled}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn("h-7 text-xs font-mono flex-1 min-w-0", !editable && "bg-gray-50 text-gray-700")}
        />
        <span className="text-xs text-gray-500 w-10 shrink-0 text-right">{unit}</span>
      </div>
    </div>
  )
}
