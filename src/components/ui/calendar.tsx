import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import type { DropdownProps } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function CalendarDropdown({ options, value, onChange, disabled, "aria-label": ariaLabel }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [drop, setDrop] = useState<"down" | "up">("down");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selected = useMemo(
    () => options?.find((option) => option.value === Number(value)) ?? options?.[0],
    [options, value],
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  // Decide whether to flip the dropdown above the trigger when there is no
  // room below (common when the calendar sits near the bottom of the viewport).
  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const desired = 260;
    setDrop(spaceBelow < desired && spaceAbove > spaceBelow ? "up" : "down");
  }, [open]);

  // Auto-scroll the currently-selected option into view when opening.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLElement>('[data-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        className={cn(
          "group/dd inline-flex h-12 min-w-[10rem] items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background px-5 text-base font-semibold tracking-tight text-foreground shadow-sm",
          "transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out",
          "hover:border-primary/60 hover:bg-accent/40 hover:shadow-md hover:shadow-primary/10",
          "active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          "disabled:pointer-events-none disabled:opacity-45 data-[wide=true]:min-w-[6.5rem]",
          open && "border-primary/60 ring-2 ring-primary/30 bg-accent/40",
        )}
        data-wide={String((selected?.label ?? "").length <= 4)}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
            open && "rotate-180 text-primary",
          )}
        />
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          onWheel={(e) => e.stopPropagation()}
          style={{ scrollBehavior: "smooth", WebkitOverflowScrolling: "touch" }}
          className={cn(
            "absolute left-1/2 z-[120] max-h-72 min-w-[max(100%,9rem)] -translate-x-1/2 overflow-y-auto overscroll-contain",
            "rounded-2xl border border-border/80 bg-popover p-1.5 shadow-2xl shadow-primary/15 ring-1 ring-primary/10",
            "origin-top animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150",
            "scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent",
            drop === "down" ? "top-full mt-2" : "bottom-full mb-2 origin-bottom slide-in-from-bottom-1",
          )}
        >
          {options?.map((option) => {
            const isSelected = option.value === Number(value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-selected={isSelected}
                disabled={option.disabled}
                onClick={() => {
                  onChange?.({ target: { value: String(option.value) } } as ChangeEvent<HTMLSelectElement>);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-10 w-full items-center rounded-xl px-3 text-left text-sm font-medium text-foreground",
                  "transition-colors duration-150 hover:bg-accent hover:text-accent-foreground",
                  "disabled:pointer-events-none disabled:opacity-35",
                  isSelected && "bg-primary text-primary-foreground shadow-sm shadow-primary/30 hover:bg-primary hover:text-primary-foreground",
                )}
              >
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Shared Calendar — clean, modern, responsive. Used by every date picker in
 * the app (booking, edit, anketa, guest details). Designed to feel native:
 * snappy hover/active states, no layout shift between months, large hit
 * targets, dropdown month/year for fast year jumps, and full keyboard a11y.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const currentYear = new Date().getFullYear();
  const startMonth =
    (props as { startMonth?: Date }).startMonth ?? new Date(1925, 0);
  const endMonth =
    (props as { endMonth?: Date }).endMonth ?? new Date(currentYear + 25, 11);

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout="dropdown"
      startMonth={startMonth}
      endMonth={endMonth}
      className={cn(
        "pointer-events-auto select-none bg-popover text-popover-foreground rounded-2xl p-5 w-[360px] max-w-[calc(100vw-2rem)]",
        className,
      )}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-4 animate-in fade-in-0 duration-200",
        month_caption:
          "relative flex h-14 items-center justify-between gap-2 px-0",
        caption_label: "sr-only",
        dropdowns:
          "flex min-w-0 flex-1 items-center justify-center gap-2.5",
        dropdown_root: "relative inline-flex items-center",
        dropdown:
          "appearance-none cursor-pointer rounded-2xl border border-border/70 bg-background px-5 py-3 text-base font-semibold text-foreground shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60",
        chevron: "fill-current text-foreground/60",
        nav: "contents",
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "order-first h-9 w-9 rounded-full p-0 text-muted-foreground bg-background ring-1 ring-border/60 shadow-sm shrink-0",
          "transition-[background-color,color,box-shadow,transform] duration-200 ease-out",
          "hover:text-primary-foreground hover:bg-primary hover:ring-primary/60 hover:shadow-md hover:shadow-primary/30",
          "active:scale-90 focus-visible:ring-2 focus-visible:ring-primary/50",
          "disabled:opacity-30 disabled:hover:bg-background disabled:hover:text-muted-foreground disabled:ring-border/40",
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "order-last h-9 w-9 rounded-full p-0 text-muted-foreground bg-background ring-1 ring-border/60 shadow-sm shrink-0",
          "transition-[background-color,color,box-shadow,transform] duration-200 ease-out",
          "hover:text-primary-foreground hover:bg-primary hover:ring-primary/60 hover:shadow-md hover:shadow-primary/30",
          "active:scale-90 focus-visible:ring-2 focus-visible:ring-primary/50",
          "disabled:opacity-30 disabled:hover:bg-background disabled:hover:text-muted-foreground disabled:ring-border/40",
        ),
        month_grid: "w-full border-collapse mt-1",
        weekdays: "flex",
        weekday:
          "text-muted-foreground/80 h-8 w-10 flex-1 font-semibold text-[0.68rem] uppercase tracking-[0.08em] flex items-center justify-center",
        week: "flex w-full mt-1",
        day: "h-10 w-10 flex-1 text-center text-sm p-0 relative",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-10 p-0 font-medium rounded-full text-foreground/85",
          "transition-[background-color,color,transform,box-shadow] duration-150 ease-out",
          "hover:bg-accent hover:text-accent-foreground hover:scale-105",
          "active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        ),
        selected:
          "[&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:font-semibold [&_button]:shadow-md [&_button]:shadow-primary/30 [&_button]:ring-2 [&_button]:ring-primary/30 [&_button]:hover:bg-primary [&_button]:hover:text-primary-foreground",
        today:
          "[&_button]:ring-2 [&_button]:ring-primary/50 [&_button]:ring-offset-1 [&_button]:ring-offset-popover [&_button]:font-bold [&_button]:text-primary",
        outside:
          "[&_button]:text-muted-foreground/40 [&_button]:font-normal [&_button]:hover:text-muted-foreground",
        disabled:
          "[&_button]:text-muted-foreground/30 [&_button]:hover:bg-transparent [&_button]:hover:scale-100 [&_button]:cursor-not-allowed [&_button]:active:scale-100",
        range_start:
          "[&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:rounded-r-none",
        range_end:
          "[&_button]:bg-primary [&_button]:text-primary-foreground [&_button]:rounded-l-none",
        range_middle:
          "[&_button]:bg-accent/60 [&_button]:text-accent-foreground [&_button]:rounded-none [&_button]:font-medium [&_button]:hover:bg-accent/80",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Dropdown: CalendarDropdown,
        Chevron: ({ orientation, className: cn2 }) => {
          const Icon = orientation === "right" ? ChevronRight : ChevronLeft;
          return <Icon className={cn("h-4 w-4", cn2)} />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
