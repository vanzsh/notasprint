"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** 11px square; fills `--fg` when on. No glyph: the fill is the signal (design.md § Brief row). */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative size-[11px] shrink-0 border border-line-strong bg-surface-2 transition-colors duration-120 outline-none after:absolute after:-inset-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-fg-muted disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-fg data-checked:bg-fg",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" />
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
