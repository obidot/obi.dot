"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type React from "react";
import { Drawer } from "vaul";
import { useMediaQuery } from "@/hooks/use-media-query";

interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  /** Max height of the drawer sheet on mobile (default: "85dvh") */
  drawerMaxHeight?: string;
}

function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b-[3px] border-border bg-surface-alt px-4 py-3">
      <p className="retro-label panel-title">{title}</p>
      <button
        type="button"
        onClick={onClose}
        className="btn-ghost min-h-0 px-2 py-1"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  children,
  drawerMaxHeight = "85dvh",
}: ResponsiveModalProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/20" />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-none border-[3px] border-border bg-popover shadow-[8px_8px_0_0_var(--border)]">
            <DialogPrimitive.Title asChild>
              <ModalHeader title={title} onClose={() => onOpenChange(false)} />
            </DialogPrimitive.Title>
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction="bottom">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-foreground/20" />
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-50 overflow-y-auto rounded-none border-x-[3px] border-t-[3px] border-border bg-popover shadow-[0_-4px_0_0_var(--border)]"
          style={{ maxHeight: drawerMaxHeight }}
        >
          <Drawer.Title asChild>
            <ModalHeader title={title} onClose={() => onOpenChange(false)} />
          </Drawer.Title>
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
