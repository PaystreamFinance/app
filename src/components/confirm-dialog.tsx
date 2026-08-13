"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title = "Confirm Action",
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}) => {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-lg border border-[#0F1F30] bg-[#041223]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold text-white">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-[#7192A5]">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2 sm:justify-end">
          <AlertDialogCancel asChild onClick={handleCancel} className="mt-0">
            <Button
              variant="outline"
              className="cursor-pointer border border-[#0D1E30] bg-[#041122] text-[#7192A5] hover:bg-[#0D1E30] hover:text-white"
            >
              {cancelText}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild onClick={handleConfirm}>
            <Button className="cursor-pointer bg-red-900 text-white/80 hover:bg-red-800">
              {confirmText}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
