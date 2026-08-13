"use client";

import * as React from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
}

export const useConfirmDialog = () => {
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolveRef = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = React.useCallback(
    (options: ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        resolveRef.current = resolve;
        setOptions(options);
        setOpen(true);
      });
    },
    [],
  );

  const handleConfirm = React.useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
  }, []);

  const handleCancel = React.useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
  }, []);

  const handleOpenChange = React.useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen && resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
  }, []);

  const DialogComponent = React.useMemo(() => {
    if (!options) return null;

    return (
      <ConfirmDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={options.title}
        description={options.description}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );
  }, [open, options, handleOpenChange, handleConfirm, handleCancel]);

  return {
    confirm,
    DialogComponent,
  };
};
