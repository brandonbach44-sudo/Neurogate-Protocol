/**
 * The audit logger context and its hook, kept apart from <AuditProvider>
 * (AuditContext.tsx) so that file exports only a component, which React
 * Fast Refresh needs.
 */
import { createContext, useContext } from 'react';
import type { AuditLogger } from './auditLogger';

export const AuditContext = createContext<AuditLogger | null>(null);

export function useAudit(): AuditLogger {
  const ctx = useContext(AuditContext);
  if (!ctx) {
    throw new Error('useAudit must be used within an <AuditProvider>');
  }
  return ctx;
}
