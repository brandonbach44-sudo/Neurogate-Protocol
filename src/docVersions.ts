/**
 * The documents shipped with the app (public/docs/*.md) and their current
 * versions, shown on the Documentation page. regression_docs.ts fails if
 * a version here disagrees with the "| **Version** |" row in the
 * document itself, so bump both together.
 */
export const DOCUMENTS = [
  { id: 'GOV-001', slug: 'gov-001', version: '2.3' },
  { id: 'SOP-BIDS-001', slug: 'sop-bids', version: '3.3' },
  { id: 'SOP-GUI-001', slug: 'sop-gui', version: '3.2' },
] as const;

export function documentVersion(id: (typeof DOCUMENTS)[number]['id']): string {
  return DOCUMENTS.find(d => d.id === id)!.version;
}
