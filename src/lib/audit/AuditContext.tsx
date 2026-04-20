/**
 * React Context for the Audit Logger.
 *
 * Provides the audit logger to all components via context so they
 * can log actions without prop drilling. Wrap the app in
 * <AuditProvider> and use the useAudit() hook in any component.
 */

import { createContext, useContext, useMemo } from 'react';
import { createAuditLogger, type AuditLogger } from './auditLogger';

const AuditContext = createContext<AuditLogger | null>(null);

export function AuditProvider({ children }: { children: React.ReactNode }) {
  const logger = useMemo(() => createAuditLogger(), []);

  return (
    <AuditContext.Provider value={logger}>
      {children}
    </AuditContext.Provider>
  );
}

export function useAudit(): AuditLogger {
  const ctx = useContext(AuditContext);
  if (!ctx) {
    throw new Error('useAudit must be used within an <AuditProvider>');
  }
  return ctx;
}
