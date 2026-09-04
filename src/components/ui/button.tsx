import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * One button family for the whole workstation. Heights: default 28px, sm 24px. Text 12px / 11px Geist 500.
 * `data-on` marks a persistent selected state (a lock that is on, a version being compared).
 */
const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border font-medium transition-[border-color,background-color,color] duration-120 ease-out outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-fg-muted disabled:pointer-events-none disabled:border-line disabled:bg-surface-2 disabled:text-fg-dim [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 [&_kbd]:text-fg-dim",
  {
    variants: {
      variant: {
        secondary: "border-line bg-surface-2 text-fg hover:border-line-strong aria-expanded:border-line-strong data-[on=true]:border-accent data-[on=true]:text-accent",
        primary: "border-fg bg-fg text-bg hover:border-white hover:bg-white",
        ghost: "border-transparent bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg aria-expanded:bg-surface-2 aria-expanded:text-fg disabled:bg-transparent disabled:border-transparent data-[on=true]:text-accent",
        link: "h-auto rounded-none border-0 bg-transparent px-0 text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-fg disabled:bg-transparent data-[on=true]:text-fg",
      },
      size: {
        default: "h-7 px-2.5 text-[12px]",
        sm: "h-6 px-2 text-[11px]",
        icon: "size-7",
        "icon-sm": "size-6",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  }
)

function Button({
  className,
  variant = "secondary",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
