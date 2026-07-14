import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface SettingsContextValue {
  /** Whether the Settings modal is open. */
  isOpen: boolean;
  /** Open/close the Settings modal (matches a Dialog's onOpenChange). */
  setOpen: (open: boolean) => void;
  /** Convenience opener for menu items and triggers. */
  open: () => void;
}

const noop = () => {};

export const SettingsContext = createContext<SettingsContextValue>({
  isOpen: false,
  setOpen: noop,
  open: noop,
});

export function useSettings() {
  return useContext(SettingsContext);
}

/** Owns the Settings modal open state so it can be triggered from anywhere
 * (the floating button on desktop, the nav dropdown on mobile). */
export function useSettingsValue(): SettingsContextValue {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  return useMemo(() => ({ isOpen, setOpen, open }), [isOpen, open]);
}
