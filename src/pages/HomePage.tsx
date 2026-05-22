import { Link } from 'react-router-dom';
import { ShieldIcon, ClipboardIcon } from '../components/Icons';

/* ─── Reusable stat counter ─────────────────────────────────── */
function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold" style={{ color: '#011F5B' }}>{value}</div>
      <div className="text-xs mt-1 text-gray-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}

/* ─── Workflow step card ────────────────────────────────────── */
function StepCard({
  number,
  title,
  description,
  icon,
}: {
  number: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="relative flex items-start gap-4 p-5 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-md transition-shadow duration-300">
      <div
        className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: 'rgba(109,211,206,0.12)' }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(1,31,91,0.08)', color: '#011F5B' }}
          >
            Step {number}
          </span>
        </div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

/* ─── Compliance badge ──────────────────────────────────────── */
function Badge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: '#011F5B' }}
    >
      {label}
    </span>
  );
}

/* ═══ MAIN PAGE ═══════════════════════════════════════════════ */
export default function HomePage() {
  return (
    <div className="overflow-hidden">
      {/* ─── HERO ─────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pt-12 md:pt-20 pb-12 md:pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
          {/* Left: copy */}
          <div>
            <div className="flex items-center gap-2 mb-5">
              <span
                className="text-[11px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(109,211,206,0.15)', color: '#0F6E56' }}
              >
                Beta
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-[1.1] text-gray-900">
              Standardized
              <br />
              neural data in epilepsy,
              <br />
              <span style={{ color: '#011F5B' }}>ready to share.</span>
            </h1>
            <p className="mt-5 text-base leading-relaxed text-gray-500 max-w-md">
              NeuroGate Protocol helps research sites organize, validate, and export
              BIDS-compliant neural data in epilepsy, ready to share through cloud and on-premise
              standardized data infrastructure toward building a learning health system.
            </p>
            <div className="flex items-center gap-3 mt-8">
              <Link
                to="/tool"
                className="no-underline inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{ backgroundColor: '#011F5B', color: '#ffffff' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#01326e')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#011F5B')}
              >
                Launch Tool
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
              <Link
                to="/docs"
                className="no-underline inline-flex items-center px-6 py-2.5 rounded-lg text-sm font-medium border transition-all"
                style={{ borderColor: '#d1d5db', color: '#374151' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#011F5B')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#d1d5db')}
              >
                View Documentation
              </Link>
            </div>
          </div>

          {/* Right: visual card stack */}
          <div className="relative">
            {/* Background decoration */}
            <div
              className="absolute -top-8 -right-8 w-64 h-64 rounded-full opacity-30"
              style={{
                background: 'radial-gradient(circle, rgba(109,211,206,0.3) 0%, transparent 70%)',
              }}
            />
            {/* BIDS folder preview card */}
            <div className="relative rounded-2xl shadow-lg p-6" style={{ backgroundColor: '#011F5B' }}>
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6DD3CE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <span className="text-sm font-semibold text-white">BIDS output preview</span>
              </div>
              {/* Mock folder tree */}
              <div className="font-mono text-xs leading-6 rounded-xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
                <div className="text-white font-semibold">dataset/</div>
                <div className="ml-4 text-blue-300/60">dataset_description.json</div>
                <div className="ml-4 text-blue-300/60">participants.tsv</div>
                <div className="ml-4 text-white font-medium">sub-PENN001/</div>
                <div className="ml-8 text-white font-medium">ses-preimplant/</div>
                <div className="ml-12 text-blue-300/60">anat/</div>
                <div className="ml-16" style={{ color: '#6DD3CE' }}>sub-PENN001_ses-preimplant_T1w.nii.gz</div>
                <div className="ml-16" style={{ color: '#6DD3CE' }}>sub-PENN001_ses-preimplant_T2w.nii.gz</div>
                <div className="ml-12 text-blue-300/60">eeg/</div>
                <div className="ml-16" style={{ color: '#6DD3CE' }}>sub-PENN001_ses-preimplant_eeg.edf</div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ─── STATS BAR ────────────────────────────────────── */}
      <section className="border-y border-gray-100 bg-white/60 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 md:flex md:items-center md:justify-around gap-6 md:gap-0">
          <StatBlock value="5" label="Workflow steps" />
          <div className="hidden md:block w-px h-10 bg-gray-200" />
          <StatBlock value="11" label="Modalities supported" />
          <div className="hidden md:block w-px h-10 bg-gray-200" />
          <StatBlock value="3" label="Clinical sessions" />
          <div className="hidden md:block w-px h-10 bg-gray-200" />
          <StatBlock value="100%" label="Client-side processing" />
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-12 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 md:gap-12 items-start">
          {/* Left label */}
          <div className="md:col-span-2">
            <span
              className="text-[11px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: '#011F5B' }}
            >
              How it works
            </span>
            <h2 className="text-3xl font-bold text-gray-900 mt-4 leading-tight">
              Five steps from
              <br />
              raw files to
              <br />
              share-ready BIDS data.
            </h2>
            <p className="mt-4 text-sm text-gray-500 leading-relaxed max-w-sm">
              NeuroGate walks you through the entire data preparation workflow.
              Everything runs in your browser; no data ever leaves your machine.
            </p>
            <Link
              to="/tool"
              className="no-underline inline-flex items-center gap-2 mt-6 text-sm font-semibold"
              style={{ color: '#011F5B' }}
            >
              Try it now
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>

          {/* Right: step cards */}
          <div className="md:col-span-3 space-y-3">
            <StepCard
              number="1"
              title="Drop your files"
              description="Drag and drop a folder of NIfTI, EDF, or JSON files. The tool accepts any folder structure."
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}
            />
            <StepCard
              number="2"
              title="Review auto-detection"
              description="A 5-layer engine classifies each file by session, modality, and subject. Correct anything it misses."
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
            />
            <StepCard
              number="3"
              title="Enter metadata"
              description="Add subject demographics, dataset description, and confirm all anatomical images are defaced."
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
            />
            <StepCard
              number="4"
              title="Validate compliance"
              description="Automated checks for BIDS conformance, PHI in filenames, missing metadata, and cross-session consistency."
              icon={<ShieldIcon size={18} color="#0F6E56" />}
            />
            <StepCard
              number="5"
              title="Export BIDS dataset"
              description="Download a ready-to-upload ZIP with BIDS folder structure plus an ALCOA+ audit log for your records."
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F6E56" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>}
            />
          </div>
        </div>
      </section>

      {/* ─── FEATURES (3-col offset grid) ─────────────────── */}
      <section className="bg-white/60 border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-12 md:py-20">
          <div className="text-center mb-12">
            <span
              className="text-[11px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: '#011F5B' }}
            >
              Built for compliance
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mt-4">
              Governance at every layer
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 — taller */}
            <div className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md transition-shadow duration-300">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                style={{ backgroundColor: 'rgba(109,211,206,0.12)' }}
              >
                <img src="/logo.png" alt="NeuroGate Protocol logo" className="w-9 h-9 object-contain" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">5-layer auto-detection</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Extension, filename, folder path, neighbor context, and subject grouping layers work
                together to classify your files with confidence scoring.
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                <Badge label="T1w" />
                <Badge label="T2w" />
                <Badge label="FLAIR" />
                <Badge label="Angio" />
                <Badge label="CT" />
                <Badge label="DWI" />
                <Badge label="ASL" />
                <Badge label="fMRI" />
                <Badge label="Field map" />
                <Badge label="EEG" />
                <Badge label="iEEG" />
              </div>
            </div>

            {/* Card 2 — offset up on desktop only */}
            <div className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md transition-shadow duration-300 md:-mt-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
              >
                <ShieldIcon size={24} color="#dc2626" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">PHI protection</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Before any data leaves your machine, the validation engine scans filenames for
                patient names, MRNs, dates, and SSN patterns. Flagged files cannot be exported.
              </p>
              <div className="mt-5 rounded-lg p-3 text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.05)', color: '#991b1b' }}>
                <span className="font-semibold">Example flag:</span> filename contains
                "JohnDoe_MRN12345.nii.gz"
              </div>
            </div>

            {/* Card 3 */}
            <div className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md transition-shadow duration-300">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                style={{ backgroundColor: 'rgba(1,31,91,0.06)' }}
              >
                <ClipboardIcon size={24} color="#011F5B" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-2">ALCOA+ audit trail</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Every file scan, user correction, metadata entry, and export decision is logged
                with timestamps. The audit JSON downloads automatically with your BIDS dataset.
              </p>
              <div className="mt-5 flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Timestamped
                </span>
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Attributable
                </span>
                <span className="flex items-center gap-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  Append-only
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── COMPLIANCE FRAMEWORKS ────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 py-12 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
          {/* Left: compliance grid */}
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                title: 'FAIR',
                desc: 'Findable, Accessible, Interoperable, Reusable',
                accent: '#011F5B',
                bg: 'rgba(1,31,91,0.04)',
              },
              {
                title: 'ALCOA+',
                desc: 'Complete data integrity and audit readiness',
                accent: '#0F6E56',
                bg: 'rgba(109,211,206,0.08)',
              },
              {
                title: 'HIPAA',
                desc: 'PHI scanning and de-identification workflows',
                accent: '#dc2626',
                bg: 'rgba(239,68,68,0.05)',
              },
              {
                title: 'NIH DMSP',
                desc: 'Aligned with NIH Data Management and Sharing Policy',
                accent: '#7c3aed',
                bg: 'rgba(124,58,237,0.06)',
              },
            ].map((fw) => (
              <div
                key={fw.title}
                className="rounded-xl p-5 border border-gray-100 transition-shadow duration-300 hover:shadow-sm"
                style={{ backgroundColor: fw.bg }}
              >
                <div className="text-lg font-bold mb-1" style={{ color: fw.accent }}>{fw.title}</div>
                <p className="text-xs text-gray-500 leading-relaxed">{fw.desc}</p>
              </div>
            ))}
          </div>

          {/* Right: copy */}
          <div>
            <span
              className="text-[11px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
              style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: '#011F5B' }}
            >
              Standards alignment
            </span>
            <h2 className="text-3xl font-bold text-gray-900 mt-4 leading-tight">
              Built on the frameworks
              <br />
              your institution requires.
            </h2>
            <p className="mt-4 text-sm text-gray-500 leading-relaxed max-w-md">
              NeuroGate enforces compliance with federal data sharing mandates, institutional
              review requirements, and international data standards. Every SOP traces back to
              the project's governance framework.
            </p>
            <Link
              to="/docs"
              className="no-underline inline-flex items-center gap-2 mt-6 text-sm font-semibold"
              style={{ color: '#011F5B' }}
            >
              Read the governance framework
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── CTA BANNER ───────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 pb-12 md:pb-20">
        <div
          className="rounded-2xl px-6 md:px-12 py-10 md:py-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
          style={{
            background: 'linear-gradient(135deg, #011F5B 0%, #01326e 50%, #011F5B 100%)',
          }}
        >
          <div>
            <h2 className="text-2xl font-bold text-white">Ready to organize your data?</h2>
            <p className="mt-2 text-sm text-blue-200 max-w-lg">
              No installation, no accounts, no data uploaded. Open the tool in your browser
              and export a BIDS-compliant dataset in minutes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/tool"
              className="no-underline inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: '#6DD3CE', color: '#011F5B' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#5bc4bf')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#6DD3CE')}
            >
              Launch Tool
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link
              to="/onboarding"
              className="no-underline inline-flex items-center px-6 py-2.5 rounded-lg text-sm font-medium border transition-all"
              style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#ffffff' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#6DD3CE')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)')}
            >
              Site Onboarding Guide
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
