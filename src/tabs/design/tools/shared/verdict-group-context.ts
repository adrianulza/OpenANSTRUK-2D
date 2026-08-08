/**
 * Expand-all override for `VerdictGroup`.
 *
 * Lives apart from `verdict-group.tsx` because that file exports components:
 * mixing a non-component export into it breaks Fast Refresh
 * (`react-refresh/only-export-components`).
 *
 * A collapsed group does not render its children at all — deliberate, since the
 * Advanced Report decks are expensive — but it also means a server render emits
 * only the headers. `validation/steel_ui_smoke.mts` renders the design panes
 * with `react-dom/server` and has no DOM to click with, so without this the
 * pane bodies would ship unexercised. Provide `true` to render fully expanded.
 *
 * Undefined (the default) leaves each group's own `defaultOpen` in charge.
 */

import { createContext } from "react"

export const VerdictGroupExpandAll = createContext<boolean | undefined>(undefined)
