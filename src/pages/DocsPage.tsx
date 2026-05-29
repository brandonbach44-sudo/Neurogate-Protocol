import { Link } from 'react-router-dom';

/* ─── Document card ─────────────────────────────────────────── */
function DocCard({
  id,
  title,
  description,
  status,
  version,
  to,
  accent,
  icon,
}: {
  id: string;
  title: string;
  description: string;
  status: string;
  version: string;
  to: string;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="no-underline group block rounded-xl border border-gray-100 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300"
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-11 h-11 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: accent + '12' }}
        >
          {icon}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: '#011F5B' }}>
            {version}
          </span>
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: status === 'Draft' ? 'rgba(234,179,8,0.1)' : 'rgba(34,197,94,0.1)',
              color: status === 'Draft' ? '#a16207' : '#16a34a',
            }}
          >
            {status}
          </span>
        </div>
      </div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{id}</div>
      <h3 className="text-sm font-semibold text-gray-900 mb-2 group-hover:text-[#011F5B] transition-colors">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
      <div className="mt-4 flex items-center gap-1 text-xs font-medium" style={{ color: '#011F5B' }}>
        Read document
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </div>
    </Link>
  );
}

/* ═══ MAIN PAGE ═══════════════════════════════════════════════ */
export default function DocsPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
      {/* Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-14">
        <div className="md:col-span-2">
          <span
            className="text-[11px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
            style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: '#011F5B' }}
          >
            Documentation
          </span>
          <h1 className="text-3xl font-bold text-gray-900 mt-4 leading-tight">
            SOPs, governance framework,
            <br />
            and onboarding guides.
          </h1>
          <p className="mt-4 text-sm text-gray-500 leading-relaxed max-w-lg">
            All documentation follows the QMS structure defined in the governance framework.
            Each SOP includes governance traceability, step-by-step procedures, and a
            quick-reference guide.
          </p>
        </div>
        <div className="flex items-end md:justify-end">
          <div className="text-right">
            <div className="text-3xl font-bold" style={{ color: '#011F5B' }}>6</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Documents</div>
          </div>
        </div>
      </div>

      {/* Governance framework — featured */}
      <div className="mb-8">
        <Link
          to="/docs/gov-001"
          className="no-underline group block rounded-2xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden"
        >
          <div className="p-8">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">GOV-001</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: '#011F5B' }}>v1.11</span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(234,179,8,0.1)', color: '#a16207' }}>Draft</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-[#011F5B] transition-colors">
              Regulatory Governance Framework
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-lg">
              The foundational document defining regulatory requirements, data standards,
              compliance mechanisms, and QMS structure for multi-site neural data sharing in
              epilepsy. All SOPs trace back to this framework.
            </p>
            <div className="mt-5 flex items-center gap-1 text-sm font-medium" style={{ color: '#011F5B' }}>
              Read framework
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </div>
        </Link>
      </div>

      {/* SOP grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
        <DocCard
          id="SOP-BIDS-001"
          title="BIDS Data Structure"
          description="Folder hierarchy, file naming conventions, modality organization, JSON sidecars, and de-identification requirements for BIDS-compliant neural data (imaging and electrophysiology)."
          status="Draft"
          version="v2.4"
          to="/docs/sop-bids"
          accent="rgba(109,211,206)"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          }
        />
        <DocCard
          id="SOP-PENNSIEVE-001"
          title="Pennsieve Upload Procedures (optional reference)"
          description="Worked example for sites that choose Pennsieve as their data infrastructure. Covers Agent CLI and web interface upload, pre-upload validation, post-upload verification, and audit logging. Sites using different infrastructure should produce an equivalent SOP."
          status="Draft"
          version="v2.2"
          to="/docs/sop-pennsieve"
          accent="rgba(1,31,91)"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#011F5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
          }
        />
        <DocCard
          id="SOP-REDCAP-001"
          title="REDCap Metadata Entry"
          description="Clinical and demographic metadata fields, epilepsy-specific controlled vocabularies (ILAE 2017), imaging acquisition metadata, and REDCap data entry workflows."
          status="Draft"
          version="v1.3"
          to="/docs/sop-redcap"
          accent="rgba(220,38,38)"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="13" y2="17" />
            </svg>
          }
        />
        <DocCard
          id="SOP-GUI-001"
          title="Compliance Tool User Guide"
          description="Complete instructions for using the NeuroGate web tool: file upload, auto-detection review, metadata entry, validation, BIDS export, and audit trail management."
          status="Draft"
          version="v1.3"
          to="/docs/sop-gui"
          accent="rgba(109,211,206)"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          }
        />
      </div>

      {/* Onboarding checklist */}
      <Link
        to="/docs/onboarding"
        className="no-underline group block rounded-xl border border-gray-100 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-11 h-11 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'rgba(124,58,237,0.08)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                <polyline points="9 11 12 14 16 10" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">ONBOARD-001</div>
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-[#011F5B] transition-colors">Site Onboarding Checklist</h3>
              <p className="text-xs text-gray-500 mt-1">5-phase checklist for onboarding external research sites, from initial contact through first validated upload.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: '#011F5B' }}>v2.6</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#011F5B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </div>
      </Link>
    </div>
  );
}
