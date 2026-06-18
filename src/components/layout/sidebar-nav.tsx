"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { NAV_ITEMS } from "@/components/layout/nav-items";

interface SidebarNavProps {
  /** Called after a nav item activates — used by the drawer to close itself. */
  onNavigate?: () => void;
}

/**
 * The navigation list. Marks the active route with `aria-current="page"` (not
 * color alone) and resolves "active" on the route segment so child routes keep
 * the parent highlighted. Each item is a 44px-tall touch target with a visible
 * focus ring. Presentation only.
 */
export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              onClick={onNavigate}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-control px-3 font-body text-[13.5px]",
                "transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isActive
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink hover:bg-accent-soft",
              )}
            >
              <Icon className={isActive ? "text-accent" : "text-muted"} />
              {/* i18n: da esternalizzare in messages/* */}
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
