import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { ChevronRight, ChevronLeft } from "lucide-react"

interface Props {
  open: boolean
  onToggle: () => void
}

const PILL_HEIGHT = 110

/**
 * Vertical "ADVANCED" pill anchored to the right edge of the flyout, at the
 * flyout's true vertical center. Measures the flyout DOM via [data-flyout-root]
 * so we don't depend on the viewport size or the flyout's current content height.
 */
export function AdvancedPill({ open, onToggle }: Props) {
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null)

  React.useEffect(() => {
    if (typeof document === "undefined") return
    const root = document.querySelector<HTMLElement>("[data-flyout-root]")
    if (!root) return

    const update = () => {
      const r = root.getBoundingClientRect()
      setPos({
        left: r.right - 1, // overlap flyout border by 1px
        top:  r.top + 12,  // start below flyout's rounded-xl corner (12px radius)
      })
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
  }, [])

  if (typeof document === "undefined" || !pos) return null

  const pill = (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Close advanced properties" : "Open advanced properties"}
      aria-expanded={open}
      className={cn(
        "fixed w-5 rounded-r-md",
        "flex flex-col items-center justify-center gap-1",
        "transition-all duration-150 ease-out",
        "shadow-[2px_2px_6px_rgba(0,0,0,0.08)]",
        "border border-l-0 border-gray-200",
        "z-20 cursor-pointer",
        open
          ? "bg-[#2563eb] text-white hover:bg-[#2563eb]"
          : "bg-gray-50 text-[#2563eb] hover:bg-[#2563eb] hover:text-white hover:translate-x-0.5",
      )}
      style={{ left: pos.left, top: pos.top, height: PILL_HEIGHT }}
    >
      {open ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      <span
        className="text-[9px] font-semibold tracking-widest select-none"
        style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
      >
        ADVANCED
      </span>
    </button>
  )

  return createPortal(pill, document.body)
}
