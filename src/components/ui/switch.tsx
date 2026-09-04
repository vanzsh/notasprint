"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** 28 × 16 track: `--surface-2` with a `--line-strong` hairline when off, `--fg` when on; 12px thumb. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer group/switch relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors duration-120 outline-none after:absolute after:-inset-x-2 after:-inset-y-2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-fg-muted data-[state=checked]:border-fg data-[state=checked]:bg-fg data-[state=unchecked]:border-line-strong data-[state=unchecked]:bg-surface-2 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3 rounded-full transition-transform duration-120 ease-out data-[state=checked]:translate-x-[13px] data-[state=checked]:bg-bg data-[state=unchecked]:translate-x-px data-[state=unchecked]:bg-fg-muted"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
