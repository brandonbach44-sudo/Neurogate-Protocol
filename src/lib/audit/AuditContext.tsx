/**
 * React Context for the Audit Logger.
 *
 * Provides the audit logger to all components via context so they
 * can log actions without prop drilling. Wrap the app in
 * <AuditProvider> and use the useAudit() hook in any component.
 *
 * The log is saved to tab storage after every change and restored on
 * start (auditPersistence.ts), so a reload or a renderer crash doesn't
 * lose it. Closing does, so when the log has unsaved entries the desktop
 * app asks before its window closes (electron/main.cjs) and a browser
 * tab shows its leave-page prompt.
 */

import { useEffect, useState } from 'react';
import { createAuditLogger } from './auditLogger';
import { AuditContext } from './auditContextValue';
import { loadAuditLog, saveAuditLog } from './auditPersistence';

export function AuditProvider({ children }: { children: React.ReactNode }) {
  // Lazy state, not useMemo: React may run this twice in development,
  // and only reads happen here, so a discarded run has no effect.
  const [logger] = useState(() => {
    const l = createAuditLogger();
    const saved = loadAuditLog();
    if (saved && saved.entries.length > 0) {
      l.restore(saved);
      l.logAuditLogRestored(saved.entries.length);
    }
    return l;
  });

  useEffect(() => {
    // Writes are batched (a subject edit logs per keystroke), and flushed
    // when the page is hidden or unloaded.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      saveAuditLog(logger.getLog());
    };
    const desktop = window.neurogateDesktop;
    let reportedUnsaved: boolean | null = null;
    const reportUnsaved = () => {
      const unsaved = logger.hasUnsavedWork();
      if (unsaved === reportedUnsaved) return;
      reportedUnsaved = unsaved;
      desktop?.setAuditUnsaved?.(unsaved);
    };
    const unsubscribe = logger.subscribe(() => {
      if (!timer) timer = setTimeout(flush, 250);
      reportUnsaved();
    });
    flush();
    reportUnsaved();
    // Browser only: the desktop app asks in its own dialog, and a
    // beforeunload prompt in Electron would silently block closing.
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      flush();
      if (desktop || !logger.hasUnsavedWork()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => {
      unsubscribe();
      flush();
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', warnBeforeLeaving);
    };
  }, [logger]);

  return (
    <AuditContext.Provider value={logger}>
      {children}
    </AuditContext.Provider>
  );
}
