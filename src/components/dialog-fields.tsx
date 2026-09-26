import { useState, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Z_MENU } from "@/lib/z-layers"

/**
 * Parameter-row family for the settings windows (Modal, Seismic), ported from
 * OpenANSTRUK-3D's `templates/fields.tsx` so the two apps' windows read alike.
 *
 * Every row is `[label flex-1] [control 64px] [unit cell]`. One control size
 * for numbers, pickers and read-outs keeps a single right edge down a column;
 * a control that sizes itself reads as a different kind of thing.
 */

const FIELD = "h-7 w-[64px] shrink-0"
const ROW = "w-[64px] shrink-0"
/** Trailing unit cell — kept even when empty so every row ends on one edge. */
const ROW_UNIT = "w-[var(--unit-w,0.75rem)] shrink-0"
const ROW_LABEL = "min-w-0 flex-1 truncate text-[11px] text-gray-600"
const HEADING = "text-[10px] font-semibold uppercase tracking-wide text-gray-400"
const SUB_HEADING = "text-[11px] text-gray-600"

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className={HEADING}>{title}</p>
      {children}
    </div>
  )
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[10px] leading-snug text-gray-400">{children}</p>
}

export interface RadioOption<T extends string> {
  value: T
  label: string
  /** Greyed and inert; `note` becomes the row's `title`. */
  disabled?: boolean
  note?: string
  /** A control belonging to this option — "User defined ⟨T⟩ s". */
  trailing?: ReactNode
}

/** A vertical radio group under its own heading (the reference software / reference shape). */
export function Radio<T extends string>({
  label,
  value,
  options,
  sub = false,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<RadioOption<T>>
  /** Nested inside a `Group`: sentence case instead of the uppercase heading. */
  sub?: boolean
  onChange: (v: T) => void
}) {
  return (
    <div className="space-y-1" role="radiogroup" aria-label={label}>
      <p className={sub ? SUB_HEADING : HEADING}>{label}</p>
      {options.map((o) => {
        const active = o.value === value
        const dot = o.disabled
          ? active
            ? "border-[4px] border-gray-300"
            : "border border-gray-200"
          : active
            ? "border-[4px] border-[#1a2f5e]"
            : "border border-gray-300"
        return (
          <div key={o.value} className="flex items-center gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={active}
              disabled={o.disabled}
              title={o.disabled ? o.note : undefined}
              onClick={() => onChange(o.value)}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded text-left text-[11px] ${
                o.disabled
                  ? "cursor-default text-gray-300"
                  : active
                    ? "text-[#1e293b]"
                    : "text-gray-600 hover:text-[#1a2f5e]"
              }`}
            >
              <span className={`h-3 w-3 shrink-0 rounded-full bg-white ${dot}`} />
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
            </button>
            {o.trailing}
          </div>
        )
      })}
    </div>
  )
}

/** A full-width dropdown under its own heading, for values that are names. */
export function Drop<T extends string>({
  label,
  value,
  options,
  sub = false,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<readonly [T, string]>
  sub?: boolean
  onChange: (v: T) => void
}) {
  return (
    <div className="space-y-1">
      <p className={sub ? SUB_HEADING : HEADING}>{label}</p>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-7 w-full rounded-md border border-gray-200 bg-white px-2 font-mono text-[11px] text-gray-700 focus:border-[#2563eb] focus:outline-none"
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * A bare number field. The raw text is the state — binding the input to the
 * parsed number would snap "1." back to "1" mid-keystroke.
 */
export function NumInline({
  value,
  unit,
  disabled = false,
  invalid = false,
  ariaLabel,
  width = "w-[64px]",
  pad = true,
  onChange,
}: {
  value: number
  unit?: string
  disabled?: boolean
  /** Painted as wrong. A disabled field never reports invalid. */
  invalid?: boolean
  ariaLabel: string
  width?: string
  /** Keep the trailing unit cell (off only where no row in the column has one). */
  pad?: boolean
  onChange: (v: number) => void
}) {
  const [raw, setRaw] = useState(String(value))
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Input
        type="text"
        inputMode="decimal"
        value={raw}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={(!disabled && invalid) || undefined}
        onChange={(e) => {
          setRaw(e.target.value)
          onChange(parseFloat(e.target.value))
        }}
        // `md:text-[11px]` restates the size at the breakpoint where Input's
        // own `md:text-sm` would otherwise win.
        className={`h-7 ${width} px-1.5 text-right font-mono text-[11px] md:text-[11px] ${
          !disabled && invalid ? "border-red-400 focus-visible:ring-red-300" : ""
        }`}
      />
      {pad && <span className={`${ROW_UNIT} text-[10px] text-gray-400`}>{unit ?? ""}</span>}
    </div>
  )
}

export function NumRow({
  label,
  name,
  value,
  unit,
  invalid = false,
  disabled = false,
  disabledNote,
  onChange,
}: {
  label: ReactNode
  /** Plain text for `aria-label` — a label carrying a `<sub>` is not a string. */
  name: string
  value: number
  unit?: string
  invalid?: boolean
  disabled?: boolean
  disabledNote?: string
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-2" title={disabled ? disabledNote : undefined}>
      <span
        className={`min-w-0 flex-1 truncate text-[11px] ${
          disabled ? "text-gray-300" : invalid ? "text-red-600" : "text-gray-600"
        }`}
      >
        {label}
      </span>
      <NumInline
        value={value}
        unit={unit}
        disabled={disabled}
        invalid={invalid}
        ariaLabel={name}
        width={ROW}
        onChange={onChange}
      />
    </label>
  )
}

export interface PickRowOption<T extends string> {
  value: T
  /** What the open list shows. */
  label: string
  /** What the collapsed 64px box shows. Defaults to `label`. */
  short?: string
}

/** A picker whose box shows a code ("D", "II") and whose list shows the sentence. */
export function PickRow<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: ReactNode
  name: string
  value: T
  options: ReadonlyArray<PickRowOption<T>>
  onChange: (v: T) => void
}) {
  const active = options.find((o) => o.value === value)
  return (
    <div className="flex items-center gap-2">
      <span className={ROW_LABEL}>{label}</span>
      <div className="flex shrink-0 items-center gap-1">
        <Select value={value} onValueChange={(v) => onChange(v as T)}>
          <SelectTrigger
            size="sm"
            aria-label={name}
            title={active?.label}
            className={`${FIELD} data-[size=sm]:h-7 px-1.5 font-mono text-[11px]`}
          >
            {active?.short ?? active?.label ?? ""}
          </SelectTrigger>
          {/* The list portals to <body>; it must clear the dialog it opens over. */}
          <SelectContent style={{ zIndex: Z_MENU }} className="min-w-[240px]">
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className={ROW_UNIT} />
      </div>
    </div>
  )
}

/** A derived value on the same row shape — greyed because something else decides it. */
export function ReadRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className={ROW_LABEL}>{label}</span>
      <div className="flex shrink-0 items-center gap-1">
        <div
          className={`flex ${FIELD} items-center justify-end overflow-hidden whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 px-1.5 font-mono text-[11px] text-gray-400`}
        >
          {children}
        </div>
        <span className={ROW_UNIT} />
      </div>
    </div>
  )
}

/**
 * A derived quantity of a summary strip. Greyed, except for a coefficient the
 * active code refuses to publish — then it is the user's field.
 */
export function ValueRow({
  label,
  name,
  value,
  editable = false,
  supplied,
  onChange,
  children,
}: {
  label: ReactNode
  name: string
  value: string
  editable?: boolean
  supplied?: number
  onChange?: (v: number) => void
  /** A clause callout and its popover; `relative` anchors the popover here. */
  children?: ReactNode
}) {
  return (
    <div className="relative flex items-center gap-2">
      <span className={ROW_LABEL}>
        {label}
        {children}
      </span>
      {editable && onChange ? (
        <NumInline
          value={supplied ?? parseFloat(value)}
          ariaLabel={`${name} — your value`}
          pad={false}
          onChange={onChange}
        />
      ) : (
        <div
          className={`flex ${FIELD} items-center justify-end overflow-hidden whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 px-1.5 font-mono text-[11px] text-gray-400`}
        >
          {value}
        </div>
      )}
    </div>
  )
}
