"use client";

import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from "react";
import * as RadixDropdown from "@radix-ui/react-dropdown-menu";

import { cn } from "@/lib/cn";
import { useThemeContainer } from "@/components/ui/theme-portal";

/**
 * Accessible dropdown / overflow menu built on Radix DropdownMenu.
 *
 * Radix gives us, for free and to WCAG: `role="menu"`/`menuitem`, arrow-key
 * navigation, type-ahead, Esc to close, focus trap + restoration to the trigger,
 * and `aria-haspopup="menu"` on the trigger. We layer ONLY presentation on top —
 * every surface/colour/radius is a theme token (no hard-coded values), so the
 * menu re-themes per tenant and works in light + dark.
 *
 * Single responsibility: this file is the presentational primitive. The
 * destructive `Item` variant ("danger") colours the TEXT with `--danger-ink`
 * (never a filled red background), so a destructive action never collides with a
 * warm `--accent` whatever the tenant brand is (docs/05, audit P0.1/P1.1).
 *
 * Composition mirrors Radix: Root / Trigger / Content / Item / CheckboxItem-free
 * Separator / Label, plus a Sub / SubTrigger / SubContent set for the export
 * submenu (P0.2). The convenience `OverflowTrigger` renders the standard "⋯"
 * ghost icon button with a ≥44px touch target and the required `aria-label`.
 */

export const DropdownMenu = RadixDropdown.Root;
export const DropdownMenuTrigger = RadixDropdown.Trigger;
export const DropdownMenuGroup = RadixDropdown.Group;
export const DropdownMenuPortal = RadixDropdown.Portal;
export const DropdownMenuSub = RadixDropdown.Sub;

/** Shared surface styling for the popover panels (content + submenu content). */
const SURFACE_CLASSES =
  "z-50 min-w-[12rem] overflow-hidden rounded border border-line bg-panel p-1 shadow " +
  "font-body text-[13px] text-ink";

/** Shared item styling (normal + sub-trigger), with token-driven focus state. */
const ITEM_BASE =
  "relative flex min-h-9 w-full cursor-pointer select-none items-center gap-2 rounded-control " +
  "px-2.5 py-1.5 text-[13px] outline-none " +
  // Radix sets data-highlighted on keyboard/pointer focus → use the accent-soft
  // tint (AA token) so the focused row is obvious without relying on colour alone
  // (it also moves the visible focus). Disabled rows dim + ignore input.
  "data-[highlighted]:bg-accent-soft data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

export type DropdownMenuContentProps = ComponentPropsWithoutRef<typeof RadixDropdown.Content>;

/** Themed menu surface, rendered in a portal (escapes overflow/stacking). */
export const DropdownMenuContent = forwardRef<
  ElementRef<typeof RadixDropdown.Content>,
  DropdownMenuContentProps
>(function DropdownMenuContent({ className, sideOffset = 6, align = "end", ...props }, ref) {
  // Portal INTO the theme scope so the surface is correctly dark/light themed.
  const container = useThemeContainer();
  return (
    <RadixDropdown.Portal container={container}>
      <RadixDropdown.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(SURFACE_CLASSES, className)}
        {...props}
      />
    </RadixDropdown.Portal>
  );
});

export interface DropdownMenuItemProps
  extends ComponentPropsWithoutRef<typeof RadixDropdown.Item> {
  /**
   * Destructive variant: colours the label with `--danger-ink` (text only — no
   * red fill), the single app-wide pattern for destructive actions in menus
   * (docs/05 §5.6, audit). The highlight tint switches to `--danger-soft` so the
   * focused destructive row reads as dangerous without a colour-only signal.
   */
  variant?: "default" | "danger";
}

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof RadixDropdown.Item>,
  DropdownMenuItemProps
>(function DropdownMenuItem({ className, variant = "default", ...props }, ref) {
  return (
    <RadixDropdown.Item
      ref={ref}
      className={cn(
        ITEM_BASE,
        variant === "danger"
          ? "text-danger-ink data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger-ink"
          : "text-ink",
        className,
      )}
      {...props}
    />
  );
});

export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof RadixDropdown.Separator>,
  ComponentPropsWithoutRef<typeof RadixDropdown.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <RadixDropdown.Separator
      ref={ref}
      className={cn("bg-line -mx-1 my-1 h-px", className)}
      {...props}
    />
  );
});

export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof RadixDropdown.Label>,
  ComponentPropsWithoutRef<typeof RadixDropdown.Label>
>(function DropdownMenuLabel({ className, ...props }, ref) {
  return (
    <RadixDropdown.Label
      ref={ref}
      className={cn("label-mono text-muted px-2.5 py-1.5", className)}
      {...props}
    />
  );
});

/** Submenu trigger row (e.g. "Esporta dati ›"); carries a chevron affordance. */
export const DropdownMenuSubTrigger = forwardRef<
  ElementRef<typeof RadixDropdown.SubTrigger>,
  ComponentPropsWithoutRef<typeof RadixDropdown.SubTrigger>
>(function DropdownMenuSubTrigger({ className, children, ...props }, ref) {
  return (
    <RadixDropdown.SubTrigger
      ref={ref}
      className={cn(ITEM_BASE, "text-ink data-[state=open]:bg-accent-soft", className)}
      {...props}
    >
      {children}
      <span aria-hidden="true" className="text-muted ml-auto pl-2">
        ›
      </span>
    </RadixDropdown.SubTrigger>
  );
});

export const DropdownMenuSubContent = forwardRef<
  ElementRef<typeof RadixDropdown.SubContent>,
  ComponentPropsWithoutRef<typeof RadixDropdown.SubContent>
>(function DropdownMenuSubContent({ className, sideOffset = 4, ...props }, ref) {
  const container = useThemeContainer();
  return (
    <RadixDropdown.Portal container={container}>
      <RadixDropdown.SubContent
        ref={ref}
        sideOffset={sideOffset}
        className={cn(SURFACE_CLASSES, className)}
        {...props}
      />
    </RadixDropdown.Portal>
  );
});

/**
 * Standard "⋯" overflow trigger: a ghost icon button, ≥44px touch target,
 * always-visible focus ring (re-established via `focus-visible`). The required
 * `aria-label` describes the menu; Radix adds `aria-haspopup="menu"` +
 * `aria-expanded`. Size "sm" (~36px) is the compact variant for the kanban card
 * footer (P0.3) — still keyboard-operable, just denser.
 */
export interface OverflowTriggerProps
  extends ComponentPropsWithoutRef<typeof RadixDropdown.Trigger> {
  /** Accessible name of the menu (required — there is no visible text). */
  label: string;
  size?: "md" | "sm";
  children?: ReactNode;
}

export const OverflowTrigger = forwardRef<
  ElementRef<typeof RadixDropdown.Trigger>,
  OverflowTriggerProps
>(function OverflowTrigger({ label, size = "md", className, children, ...props }, ref) {
  return (
    <RadixDropdown.Trigger
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        "text-muted hover:text-ink hover:bg-accent-soft inline-flex cursor-pointer items-center justify-center",
        "rounded-control transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "data-[state=open]:bg-accent-soft data-[state=open]:text-ink",
        size === "md" ? "h-11 w-11" : "h-9 w-9",
        className,
      )}
      {...props}
    >
      {children ?? (
        <span aria-hidden="true" className="text-[18px] leading-none">
          ⋯
        </span>
      )}
    </RadixDropdown.Trigger>
  );
});
