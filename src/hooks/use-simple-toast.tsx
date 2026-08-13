"use client";

import { toast } from "sonner";
import { SimpleToast, type ToastType } from "@/components/simple-toast";
import { useCallback } from "react";

interface UseSimpleToastReturn {
  /**
   * Shows a success toast with title and description
   */
  success: (title: string, description: string) => string;

  /**
   * Shows an error toast with title and description
   */
  error: (title: string, description: string) => string;

  /**
   * Shows an info toast with title and description
   */
  info: (title: string, description: string) => string;
}

export function useSimpleToast(): UseSimpleToastReturn {
  const showToast = useCallback(
    (type: ToastType, title: string, description: string) => {
      const toastId = `simple-toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      toast.custom(
        () => (
          <SimpleToast type={type} title={title} description={description} />
        ),
        {
          id: toastId,
          duration: 5000, // Auto-dismiss after 5 seconds
        },
      );

      return toastId;
    },
    [],
  );

  const success = useCallback(
    (title: string, description: string) => {
      return showToast("success", title, description);
    },
    [showToast],
  );

  const error = useCallback(
    (title: string, description: string) => {
      return showToast("error", title, description);
    },
    [showToast],
  );

  const info = useCallback(
    (title: string, description: string) => {
      return showToast("info", title, description);
    },
    [showToast],
  );

  return {
    success,
    error,
    info,
  };
}
