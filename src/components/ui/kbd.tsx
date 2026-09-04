import { cn } from "@/lib/utils"

/** Keyboard key: mono, 16px tall, hairline chip. Reads the same in body copy, buttons and tooltips. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "mono pointer-events-none inline-flex h-4 w-fit min-w-4 select-none items-center justify-center rounded-[4px] border border-line-strong bg-surface-2 px-1 text-[10px] leading-none text-fg-muted in-data-[slot=tooltip-content]:border-line-strong in-data-[slot=tooltip-content]:bg-bg",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
