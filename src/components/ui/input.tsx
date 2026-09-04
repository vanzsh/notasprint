import * as React from "react"

import { cn } from "@/lib/utils"

/** Text field, 28px. Number fields are mono, 24px, spinner-less: `<Input type="number" />`. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-7 w-full min-w-0 rounded-sm border border-line bg-surface-2 px-2 text-[12px] text-fg tabular-nums transition-colors duration-120 outline-none placeholder:text-fg-dim focus-visible:border-line-strong focus-visible:outline-none disabled:cursor-not-allowed disabled:text-fg-dim",
        type === "number" && "mono h-6 px-1.5 text-[11px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className
      )}
      {...props}
    />
  )
}

export { Input }
