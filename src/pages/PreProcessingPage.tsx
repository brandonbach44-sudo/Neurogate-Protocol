import { useState } from 'react';
import { Link } from 'react-router-dom';

/* ─── Color tokens (mirrors HomePage / DocsPage) ─────────────── */
const PENN_BLUE = '#011F5B';
const PENN_BLUE_HOVER = '#01326e';
const TEAL = '#6DD3CE';
const TEAL_TEXT = '#0F6E56';

/* ─── OS option type ─────────────────────────────────────────── */
type OS = 'macos' | 'windows' | 'linux' | 'conda';

const OS_OPTIONS: { id: OS; label: string }[] = [
  { id: 'macos', label: 'macOS' },
  { id: 'windows', label: 'Windows' },
  { id: 'linux', label: 'Linux' },
  { id: 'conda', label: 'Conda' },
];

/* ─── Code block (Penn Blue background, mono text) ───────────── */
function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="relative">
      {label && (
        <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
          {label}
        </div>
      )}
      <pre
        className="font-mono text-xs leading-6 rounded-xl p-4 overflow-x-auto whitespace-pre"
        style={{ backgroundColor: PENN_BLUE, color: '#ffffff' }}
      >
        <code>{children}</code>
      </pre>
    </div>
  );
}

/* ─── Eyebrow pill ───────────────────────────────────────────── */
function Eyebrow({ children, color = PENN_BLUE, bg = 'rgba(1,31,91,0.06)' }: {
  children: React.ReactNode;
  color?: string;
  bg?: string;
}) {
  return (
    <span
      className="inline-block text-[11px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
      style={{ backgroundColor: bg, color }}
    >
      {children}
    </span>
  );
}

/* ─── OS tab switcher ────────────────────────────────────────── */
function OSTabs({ active, onChange }: { active: OS; onChange: (os: OS) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {OS_OPTIONS.map((opt) => {
        const isActive = active === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{
              backgroundColor: isActive ? PENN_BLUE : 'rgba(1,31,91,0.06)',
              color: isActive ? '#ffffff' : PENN_BLUE,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Tool header ────────────────────────────────────────────── */
function ToolHeader({
  badge,
  name,
  tagline,
  tagColor,
  tagBg,
  iconColor,
  icon,
  homepage,
}: {
  badge: string;
  name: string;
  tagline: string;
  tagColor: string;
  tagBg: string;
  iconColor: string;
  icon: React.ReactNode;
  homepage: string;
}) {
  return (
    <div className="flex items-start gap-5">
      <div
        className="flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: tagBg }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ backgroundColor: tagBg, color: tagColor }}
          >
            {badge}
          </span>
          <a
            href={homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-medium px-2 py-0.5 rounded-full no-underline"
            style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: PENN_BLUE }}
          >
            Project homepage
          </a>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">{name}</h2>
        <p className="mt-1 text-sm text-gray-500 leading-relaxed">{tagline}</p>
        <span className="sr-only">{iconColor}</span>
      </div>
    </div>
  );
}

/* ─── Two-column "what / why" block ──────────────────────────── */
function WhatWhy({ what, why }: { what: string; why: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6">
      <div className="rounded-xl p-5 border border-gray-100" style={{ backgroundColor: 'rgba(1,31,91,0.04)' }}>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: PENN_BLUE }}>
          What it does
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">{what}</p>
      </div>
      <div className="rounded-xl p-5 border border-gray-100" style={{ backgroundColor: 'rgba(109,211,206,0.10)' }}>
        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: TEAL_TEXT }}>
          Why it matters here
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">{why}</p>
      </div>
    </div>
  );
}

/* ─── Flag row (used in flags table) ─────────────────────────── */
function FlagRow({ flag, value, desc }: { flag: string; value?: string; desc: string }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="py-2.5 pr-4 align-top">
        <code className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: PENN_BLUE }}>
          {flag}
        </code>
      </td>
      <td className="py-2.5 pr-4 align-top">
        {value && (
          <code className="text-xs font-mono text-gray-600">{value}</code>
        )}
      </td>
      <td className="py-2.5 align-top text-xs text-gray-500 leading-relaxed">{desc}</td>
    </tr>
  );
}

/* ═══ MAIN PAGE ═══════════════════════════════════════════════ */
export default function PreProcessingPage() {
  const [dcmOS, setDcmOS] = useState<OS>('macos');
  const [pydefaceOS, setPydefaceOS] = useState<OS>('macos');

  // ── dcm2niix install commands per OS ────────────────────────
  const dcmInstall: Record<OS, string> = {
    macos: '# Recommended: Homebrew\nbrew install dcm2niix\n\n# Verify install\ndcm2niix --version',
    windows:
      '# Option A: Chocolatey\nchoco install dcm2niix\n\n# Option B: Download prebuilt binary\n# https://github.com/rordenlab/dcm2niix/releases\n# Extract and add the folder containing dcm2niix.exe to your PATH\n\n# Verify install (PowerShell)\ndcm2niix --version',
    linux:
      '# Debian / Ubuntu\nsudo apt update\nsudo apt install dcm2niix\n\n# RHEL / Fedora\nsudo dnf install dcm2niix\n\n# Verify install\ndcm2niix --version',
    conda:
      '# Cross-platform install via conda-forge\nconda install -c conda-forge dcm2niix\n\n# Verify install\ndcm2niix --version',
  };

  // ── pydeface install commands per OS ────────────────────────
  const pydefaceInstall: Record<OS, string> = {
    macos:
      '# 1. Install FSL (FLIRT is required by pydeface)\n#    See: https://fsl.fmrib.ox.ac.uk/fsl/fslwiki/FslInstallation\n\n# 2. Install pydeface\npython -m pip install pydeface\n\n# Verify install\npydeface --help',
    windows:
      '# pydeface depends on FSL FLIRT, which does not run natively on Windows.\n# Use Windows Subsystem for Linux (WSL) and follow the Linux instructions below.\n\nwsl --install\n# After WSL reboot, open Ubuntu and run the Linux install steps.',
    linux:
      '# 1. Install FSL\n#    See: https://fsl.fmrib.ox.ac.uk/fsl/fslwiki/FslInstallation\n\n# 2. Install pydeface\npython -m pip install pydeface\n\n# Verify install\npydeface --help',
    conda:
      '# Create a clean env with FSL + pydeface\nconda create -n deface -c conda-forge fsl pydeface python=3.11\nconda activate deface\n\n# Verify install\npydeface --help',
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
      {/* ─── HEADER ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-14">
        <div className="md:col-span-2">
          <Eyebrow>Pre-Processing Tools</Eyebrow>
          <h1 className="text-3xl font-bold text-gray-900 mt-4 leading-tight">
            Convert and de-identify
            <br />
            before you upload.
          </h1>
          <p className="mt-4 text-sm text-gray-500 leading-relaxed max-w-lg">
            NeuroGate expects BIDS-ready NIfTI files with all identifying facial features removed.
            These two open-source tools, dcm2niix and pydeface, handle that step. Install them once,
            then run them on every dataset before opening the NeuroGate Tool.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link
              to="/tool"
              className="no-underline inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: PENN_BLUE, color: '#ffffff' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = PENN_BLUE_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = PENN_BLUE)}
            >
              Continue to Tool
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link
              to="/docs/sop-bids"
              className="no-underline inline-flex items-center px-5 py-2 rounded-lg text-sm font-medium border transition-all"
              style={{ borderColor: '#d1d5db', color: '#374151' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = PENN_BLUE)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#d1d5db')}
            >
              BIDS SOP
            </Link>
          </div>
        </div>
        <div className="flex items-end md:justify-end">
          <div className="md:text-right">
            <div className="text-3xl font-bold" style={{ color: PENN_BLUE }}>2</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Required tools</div>
          </div>
        </div>
      </div>

      {/* ─── WORKFLOW STRIP ──────────────────────────────── */}
      <div
        className="rounded-2xl border border-gray-100 bg-white p-6 mb-14 shadow-sm"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 items-center">
          {[
            { num: '1', label: 'Raw DICOM', sub: 'From scanner' },
            { num: '2', label: 'dcm2niix', sub: 'DICOM to NIfTI', accent: true },
            { num: '3', label: 'pydeface', sub: 'Remove face', accent: true },
            { num: '4', label: 'NeuroGate', sub: 'BIDS export' },
            { num: '5', label: 'Share', sub: 'Your data infrastructure' },
          ].map((step, i) => (
            <div key={step.num} className="relative flex flex-col items-center text-center">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold mb-2"
                style={{
                  backgroundColor: step.accent ? TEAL : 'rgba(1,31,91,0.08)',
                  color: step.accent ? PENN_BLUE : PENN_BLUE,
                }}
              >
                {step.num}
              </div>
              <div className="text-sm font-semibold text-gray-900">{step.label}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{step.sub}</div>
              {i < 4 && (
                <div
                  className="hidden md:block absolute top-5 -right-2 w-4 h-px"
                  style={{ backgroundColor: '#e5e7eb' }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-gray-100 text-xs text-gray-500 leading-relaxed">
          The two highlighted steps run on your local machine before files reach NeuroGate.
          The governance framework (GOV-001) requires both DICOM-to-NIfTI conversion and facial
          de-identification before any image leaves your site.
        </div>
      </div>

      {/* ═══ TOOL 1: dcm2niix ════════════════════════════ */}
      <section
        id="dcm2niix"
        className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm mb-10"
      >
        <ToolHeader
          badge="STEP 2"
          name="dcm2niix"
          tagline="Convert raw DICOM scanner output into compressed NIfTI files with BIDS-ready JSON sidecars."
          tagColor={PENN_BLUE}
          tagBg="rgba(1,31,91,0.08)"
          iconColor={PENN_BLUE}
          homepage="https://github.com/rordenlab/dcm2niix"
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={PENN_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          }
        />

        <WhatWhy
          what="A small command-line tool by Chris Rorden that reads a folder of DICOM files and writes one .nii.gz volume per series, plus a .json sidecar with acquisition parameters that BIDS validators read."
          why="BIDS only accepts NIfTI; it does not accept raw DICOM. Without dcm2niix you cannot produce a valid BIDS dataset, and NeuroGate will reject the upload."
        />

        {/* Install */}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Install</h3>
          <OSTabs active={dcmOS} onChange={setDcmOS} />
          <CodeBlock>{dcmInstall[dcmOS]}</CodeBlock>
        </div>

        {/* Quick start */}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick start</h3>
          <CodeBlock label="Convert one subject's DICOM folder">{`# Recommended flags for BIDS-friendly output
dcm2niix \\
  -z y \\
  -b y \\
  -ba y \\
  -f "sub-%i_ses-%j_%p" \\
  -o /path/to/output/nifti \\
  /path/to/input/dicom`}</CodeBlock>
        </div>

        {/* Flags table */}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Flags worth knowing</h3>
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-left">
              <thead style={{ backgroundColor: 'rgba(1,31,91,0.04)' }}>
                <tr>
                  <th className="text-[10px] font-bold uppercase tracking-widest text-gray-500 py-2.5 px-4">Flag</th>
                  <th className="text-[10px] font-bold uppercase tracking-widest text-gray-500 py-2.5 px-4">Value</th>
                  <th className="text-[10px] font-bold uppercase tracking-widest text-gray-500 py-2.5 px-4">Purpose</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                <FlagRow flag="-z" value="y" desc="gzip the NIfTI output (.nii.gz), the BIDS-expected format. If omitted, NeuroGate compresses the .nii for you on export." />
                <FlagRow flag="-b" value="y" desc="emit the .json sidecar with acquisition metadata." />
                <FlagRow flag="-ba" value="y" desc="anonymize the sidecar by stripping PHI fields like PatientName." />
                <FlagRow flag="-f" value='"sub-%i_ses-%j_%p"' desc="filename template; %i = patient ID, %j = study UID slug, %p = protocol name." />
                <FlagRow flag="-o" value="<dir>" desc="output directory; one .nii.gz + .json per series." />
                <FlagRow flag="-v" value="2" desc="verbose mode; useful when troubleshooting unrecognized series." />
              </tbody>
            </table>
          </div>
        </div>

        {/* Verify */}
        <div className="mt-8 rounded-xl p-5" style={{ backgroundColor: 'rgba(109,211,206,0.10)' }}>
          <div className="flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TEAL_TEXT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <div>
              <div className="text-sm font-semibold text-gray-900">After conversion, you should see</div>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                One .nii.gz file and one .json file per scan series, named with your <code className="font-mono">-f</code> template.
                Open the .json in any text editor and confirm that PatientName, PatientID, and PatientBirthDate are absent
                (the <code className="font-mono">-ba y</code> flag strips them).
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TOOL 2: pydeface ═══════════════════════════════ */}
      <section
        id="pydeface"
        className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm mb-14"
      >
        <ToolHeader
          badge="STEP 3"
          name="pydeface"
          tagline="Remove facial features from T1w, T2w, and FLAIR images so subjects cannot be re-identified from a 3D render."
          tagColor={TEAL_TEXT}
          tagBg="rgba(109,211,206,0.16)"
          iconColor={TEAL_TEXT}
          homepage="https://github.com/poldracklab/pydeface"
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={TEAL_TEXT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          }
        />

        <WhatWhy
          what="A Python wrapper from Poldrack Lab that aligns each anatomical scan to a templated facial mask using FSL FLIRT, then zeros out voxels in the facial region."
          why="Even with PHI stripped from filenames and sidecars, a 3D rendering of an unaltered T1w can be matched to a person's photograph. HIPAA Safe Harbor and the project governance framework require de-identification of full-face imagery before sharing."
        />

        {/* Install */}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Install</h3>
          <OSTabs active={pydefaceOS} onChange={setPydefaceOS} />
          <CodeBlock>{pydefaceInstall[pydefaceOS]}</CodeBlock>
          <div className="mt-3 rounded-lg p-3 text-xs leading-relaxed" style={{ backgroundColor: 'rgba(234,179,8,0.10)', color: '#854d0e' }}>
            <span className="font-semibold">FSL is required.</span> pydeface calls FLIRT under the hood. Make sure
            <code className="font-mono mx-1 px-1 rounded bg-yellow-100">FSLDIR</code> is set and
            <code className="font-mono mx-1 px-1 rounded bg-yellow-100">flirt</code> is on your PATH before running
            pydeface.
          </div>
        </div>

        {/* Quick start */}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick start</h3>
          <CodeBlock label="Deface a single anatomical scan">{`# Produces sub-ID001_ses-01_T1w_defaced.nii.gz next to the input
pydeface sub-ID001_ses-01_T1w.nii.gz

# Loop over every T1w / T2w / FLAIR in a folder
for f in *_T1w.nii.gz *_T2w.nii.gz *_FLAIR.nii.gz; do
  pydeface "$f"
done`}</CodeBlock>
        </div>

        {/* Flags table */}
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Flags worth knowing</h3>
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-left">
              <thead style={{ backgroundColor: 'rgba(109,211,206,0.10)' }}>
                <tr>
                  <th className="text-[10px] font-bold uppercase tracking-widest text-gray-500 py-2.5 px-4">Flag</th>
                  <th className="text-[10px] font-bold uppercase tracking-widest text-gray-500 py-2.5 px-4">Value</th>
                  <th className="text-[10px] font-bold uppercase tracking-widest text-gray-500 py-2.5 px-4">Purpose</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                <FlagRow flag="--outfile" value="<path>" desc="explicit output path; default appends _defaced before the extension." />
                <FlagRow flag="--force" desc="overwrite an existing defaced file." />
                <FlagRow flag="--applyto" value="<file ...>" desc="apply the same mask to additional images (e.g. T2w aligned to T1w)." />
                <FlagRow flag="--cost" value="mutualinfo" desc="FLIRT cost function; mutualinfo is the safer default for cross-modality." />
                <FlagRow flag="--verbose" desc="print the FLIRT call; useful when defacing fails on unusual orientations." />
              </tbody>
            </table>
          </div>
        </div>

        {/* QA step */}
        <div className="mt-8 rounded-xl p-5" style={{ backgroundColor: 'rgba(239,68,68,0.05)' }}>
          <div className="flex items-start gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <div className="text-sm font-semibold text-gray-900">Always QA the defaced output</div>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Open every defaced volume in a 3D viewer (FSLeyes, ITK-SNAP, or Mango) and confirm the face region is zeroed
                and that brain tissue, especially temporal lobes, is intact. NeuroGate's metadata step asks you to attest that
                this QA was performed; the attestation is recorded in the ALCOA+ audit log.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── COMPLIANCE TIE-IN ──────────────────────────── */}
      <div
        className="rounded-2xl px-6 md:px-10 py-8 md:py-10 mb-12"
        style={{ background: `linear-gradient(135deg, ${PENN_BLUE} 0%, ${PENN_BLUE_HOVER} 100%)` }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start md:items-center">
          <div className="md:col-span-2">
            <Eyebrow color={TEAL} bg="rgba(109,211,206,0.15)">Governance</Eyebrow>
            <h3 className="text-2xl font-bold text-white mt-3">
              Why we require these two tools
            </h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
              The Regulatory Governance Framework (GOV-001) defines two pre-upload obligations: any imaging
              data leaving a site must be in an open, non-proprietary format (NIfTI), and any full-face anatomical
              scan must have facial features removed. dcm2niix and pydeface are the open-source defaults the
              project uses to satisfy both obligations. Sites are free to substitute equivalent tools, but the
              attestation step in NeuroGate still requires a tool name and version for the audit trail.
            </p>
          </div>
          <div className="flex md:justify-end">
            <Link
              to="/docs/gov-001"
              className="no-underline inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: TEAL, color: PENN_BLUE }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#5bc4bf')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = TEAL)}
            >
              Read GOV-001
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* ─── EXTERNAL RESOURCES ─────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Further reading</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              title: 'dcm2niix on GitHub',
              desc: 'Source code, releases, and full flag reference for the converter.',
              href: 'https://github.com/rordenlab/dcm2niix',
              accent: PENN_BLUE,
            },
            {
              title: 'pydeface on GitHub',
              desc: 'Source code and method notes from Poldrack Lab.',
              href: 'https://github.com/poldracklab/pydeface',
              accent: TEAL_TEXT,
            },
            {
              title: 'BIDS specification',
              desc: 'Authoritative reference for folder structure and JSON sidecar fields.',
              href: 'https://bids-specification.readthedocs.io',
              accent: '#7c3aed',
            },
          ].map((r) => (
            <a
              key={r.title}
              href={r.href}
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline rounded-xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-300 block"
            >
              <div className="text-sm font-semibold text-gray-900" style={{ color: r.accent }}>
                {r.title}
              </div>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{r.desc}</p>
              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-gray-500">
                Open
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
