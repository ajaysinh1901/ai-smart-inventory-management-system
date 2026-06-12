import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

const ToastContext = createContext(null);

const TOAST_STYLES = {
  success: {
    Icon: CheckCircle,
    bar: 'bg-[#2E7D32]',
    iconColor: 'text-[#2E7D32]',
    border: 'border-[#2E7D32]/30',
  },
  error: {
    Icon: AlertCircle,
    bar: 'bg-primary',
    iconColor: 'text-primary',
    border: 'border-primary/30',
  },
  info: {
    Icon: Info,
    bar: 'bg-brass',
    iconColor: 'text-brass-deep dark:text-brass',
    border: 'border-brass/30',
  },
  warning: {
    Icon: AlertTriangle,
    bar: 'bg-brass-deep',
    iconColor: 'text-brass-deep dark:text-brass',
    border: 'border-brass/30',
  },
};

const DEFAULT_DURATION = 3500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (type, message, options = {}) => {
      idRef.current += 1;
      const id = idRef.current;
      const duration = options.duration ?? DEFAULT_DURATION;
      setToasts((list) => [...list, { id, type, message }]);
      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      success: (msg, opts) => push('success', msg, opts),
      error: (msg, opts) => push('error', msg, opts),
      info: (msg, opts) => push('info', msg, opts),
      warning: (msg, opts) => push('warning', msg, opts),
      dismiss,
    }),
    [push, dismiss]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-3rem)]"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => {
          const cfg = TOAST_STYLES[t.type] || TOAST_STYLES.info;
          const Icon = cfg.Icon;
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto bg-paper-card dark:bg-ink-card border ${cfg.border} rounded-xl shadow-lg dark:shadow-2xl overflow-hidden flex items-stretch min-w-[280px] max-w-md animate-toast-in`}
            >
              <span className={`w-1 ${cfg.bar} flex-shrink-0`} aria-hidden="true" />
              <div className="flex items-start gap-3 p-3 flex-1 min-w-0">
                <Icon size={18} className={`${cfg.iconColor} flex-shrink-0 mt-0.5`} />
                <p className="flex-1 text-sm font-medium text-ink dark:text-paper leading-relaxed break-words">
                  {t.message}
                </p>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="text-ink/25 dark:text-paper/25 hover:text-ink/60 dark:hover:text-paper/60 transition-colors p-0.5 flex-shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback no-op so components don't crash if provider missing
    return {
      toast: {
        success: () => {},
        error: () => {},
        info: () => {},
        warning: () => {},
        dismiss: () => {},
      },
    };
  }
  return ctx;
}

export default ToastContext;
