import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * A Back button: one step back in history (so the previous page comes back with its scroll position), or — when this page
 * was opened directly (a shared link, a fresh tab) and there is nothing behind it — to `fallback`.
 */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate();
  const { key } = useLocation();
  return useCallback(() => {
    if (key !== "default") navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, key, fallback]);
}
