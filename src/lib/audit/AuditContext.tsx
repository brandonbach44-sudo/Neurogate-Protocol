/**
 * React Context for the Audit Logger.
 *
 * Provides the audit logger to all components via context so they
 * can log actions without prop drilling. Wrap the app in
 * <AuditProvider> and use the useAudit() hook in any component.
 */

import { useMemo } from 'react';
import { createAuditLogger } from './auditLogger';
import { AuditContext } from './auditContextValue';

export function AuditProvider({ children }: { children: React.ReactNode }) {
  const logger = useMemo(() => createAuditLogger(), []);

  return (
    <AuditContext.Provider value={logger}>
      {children}
    </AuditContext.Provider>
  );
}
