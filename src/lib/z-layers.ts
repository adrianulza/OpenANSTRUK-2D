/**
 * Stacking order for surfaces mounted through a portal onto <body>.
 *
 * Portalled surfaces are siblings in one stacking context, so their z-index is
 * the only thing ordering them. A Radix Select opened inside a portal dialog
 * portals out at `z-50` and would draw BEHIND the dialog that owns it — hence
 * menus sit above dialogs. Numbers, not classes: applied through `style`, so no
 * build step can drop them.
 */

/** A modal window over the app — the Modal and Seismic settings windows. */
export const Z_DIALOG = 9998

/** A menu opened from inside a dialog. */
export const Z_MENU = 10000

/** A window opened from inside a dialog — the ground-motion import. */
export const Z_NESTED = 9999
