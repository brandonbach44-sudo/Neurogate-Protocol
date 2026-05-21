import { Link } from 'react-router-dom';
import { ShieldIcon } from '../components/Icons';

/* ─── Color tokens (mirrors HomePage / DocsPage / PreProcessingPage) ─ */
const PENN_BLUE = '#011F5B';
const PENN_BLUE_HOVER = '#01326e';
const TEAL = '#6DD3CE';
const TEAL_TEXT = '#0F6E56';

/* ─── Eyebrow pill ───────────────────────────────────────────── */
function Eyebrow({
  children,
  color = PENN_BLUE,
  bg = 'rgba(1,31,91,0.06)',
}: {
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

/* ─── Role card ──────────────────────────────────────────────── */
function RoleCard({
  role,
  who,
  desc,
  accent,
  bg,
}: {
  role: string;
  who: string;
  desc: string;
  accent: string;
  bg: string;
}) {
  return (
    <div
      className="rounded-xl border border-gray-100 p-5 transition-shadow duration-300 hover:shadow-sm"
      style={{ backgroundColor: bg }}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: accent }}>
        {who}
      </div>
      <div className="text-sm font-semibold text-gray-900">{role}</div>
      <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{desc}</p>
    </div>
  );
}

/* ─── Phase card (the core component) ────────────────────────── */
function PhaseCard({
  number,
  title,
  goal,
  tasks,
  accent,
  iconBg,
  icon,
}: {
  number: string;
  title: string;
  goal: string;
  tasks: string[];
  accent: string;
  iconBg: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md transition-shadow duration-300">
      <div className="flex items-start gap-4 mb-5">
        <div
          className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: iconBg }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ backgroundColor: iconBg, color: accent }}
          >
            Phase {number}
          </span>
          <h3 className="text-base font-semibold text-gray-900 mt-2">{title}</h3>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{goal}</p>
        </div>
      </div>
      <div className="border-t border-gray-100 pt-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Key tasks</div>
        <ul className="space-y-1.5">
          {tasks.map((t) => (
            <li key={t} className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={accent}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0 mt-0.5"
              >
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─── Hard stop / gate row ───────────────────────────────────── */
function GateRow({ before, criteria }: { before: string; criteria: string }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="py-3 pr-4 align-top">
        <span
          className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: PENN_BLUE }}
        >
          {before}
        </span>
      </td>
      <td className="py-3 align-top text-xs text-gray-600 leading-relaxed">{criteria}</td>
    </tr>
  );
}

/* ─── Doc package row ────────────────────────────────────────── */
function DocRow({ id, title, to }: { id: string; title: string; to: string }) {
  return (
    <Link
      to={to}
      className="no-underline group flex items-center justify-between rounded-lg border border-gray-100 bg-white p-4 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: 'rgba(1,31,91,0.06)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={PENN_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{id}</div>
          <div className="text-sm font-semibold text-gray-900 group-hover:text-[#011F5B] transition-colors">
            {title}
          </div>
        </div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    </Link>
  );
}

/* ═══ MAIN PAGE ═══════════════════════════════════════════════ */
export default function OnboardingPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
      {/* ─── HEADER ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 mb-14">
        <div className="md:col-span-2">
          <Eyebrow>Site Onboarding</Eyebrow>
          <h1 className="text-3xl font-bold text-gray-900 mt-4 leading-tight">
            From first contact
            <br />
            to independent operation.
          </h1>
          <p className="mt-4 text-sm text-gray-500 leading-relaxed max-w-lg">
            Every external research site joining the multi-site neural data sharing initiative in epilepsy
            completes a five-phase onboarding workflow. Phases gate one another: a site cannot move
            forward until the previous phase's criteria are met. The full checklist (ONBOARD-001) is
            below as a downloadable document; this page summarizes the workflow.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Link
              to="/docs/onboarding"
              className="no-underline inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: PENN_BLUE, color: '#ffffff' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = PENN_BLUE_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = PENN_BLUE)}
            >
              View full checklist
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link
              to="/docs/gov-001"
              className="no-underline inline-flex items-center px-5 py-2 rounded-lg text-sm font-medium border transition-all"
              style={{ borderColor: '#d1d5db', color: '#374151' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = PENN_BLUE)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#d1d5db')}
            >
              Read GOV-001
            </Link>
          </div>
        </div>
        <div className="flex items-end md:justify-end">
          <div className="md:text-right">
            <div className="text-3xl font-bold" style={{ color: PENN_BLUE }}>5</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">Phases</div>
          </div>
        </div>
      </div>

      {/* ─── WORKFLOW STRIP ──────────────────────────────── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 mb-14 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 items-center">
          {[
            { num: '1', label: 'Pre-Onboarding', sub: 'Agreements + Roles' },
            { num: '2', label: 'Setup', sub: 'Accounts + Tools' },
            { num: '3', label: 'Training', sub: 'Walkthrough' },
            { num: '4', label: 'First Subject', sub: 'Supervised', accent: true },
            { num: '5', label: 'Independent', sub: 'Subjects 2 and 3' },
          ].map((step) => (
            <div key={step.num} className="flex flex-col items-center text-center">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold mb-2"
                style={{
                  backgroundColor: step.accent ? TEAL : 'rgba(1,31,91,0.08)',
                  color: PENN_BLUE,
                }}
              >
                {step.num}
              </div>
              <div className="text-sm font-semibold text-gray-900">{step.label}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{step.sub}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-gray-100 text-xs text-gray-500 leading-relaxed">
          The site's first real subject (Phase 4) is the validation upload required by GOV-001
          Section 7.3. The project lead supervises that upload directly; subsequent uploads in
          Phase 5 are done independently and reviewed by the Quality Auditor before the site is
          marked fully onboarded.
        </div>
      </div>

      {/* ─── ROLES ───────────────────────────────────────── */}
      <section className="mb-14">
        <div className="mb-6">
          <Eyebrow>Who is involved</Eyebrow>
          <h2 className="text-2xl font-bold text-gray-900 mt-3">Roles across both sides</h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-2xl">
            Onboarding requires named contacts on both the Penn project team and the site. Before
            Phase 1 closes, every named role below must be confirmed for the new site.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <RoleCard
            who="Project Team"
            role="Onboarding Lead"
            desc="Owns the workflow end-to-end, runs training, documents completion."
            accent={PENN_BLUE}
            bg="rgba(1,31,91,0.04)"
          />
          <RoleCard
            who="Site"
            role="Site PI"
            desc="Approves participation, signs the data use agreement, designates the Site Data Manager."
            accent={TEAL_TEXT}
            bg="rgba(109,211,206,0.10)"
          />
          <RoleCard
            who="Site"
            role="Site Data Manager"
            desc="Executes the SOPs day-to-day; primary contact for all data operations."
            accent={TEAL_TEXT}
            bg="rgba(109,211,206,0.10)"
          />
          <RoleCard
            who="Project Team"
            role="REDCap Administrator"
            desc="Grants REDCap project access and shares the data dictionary."
            accent={PENN_BLUE}
            bg="rgba(1,31,91,0.04)"
          />
          <RoleCard
            who="Project Team"
            role="Quality Auditor"
            desc="Reviews the supervised first BIDS export and the first independent exports."
            accent="#7c3aed"
            bg="rgba(124,58,237,0.06)"
          />
        </div>
      </section>

      {/* ─── PHASES ──────────────────────────────────────── */}
      <section className="mb-14">
        <div className="mb-6">
          <Eyebrow>The five phases</Eyebrow>
          <h2 className="text-2xl font-bold text-gray-900 mt-3">What happens in each phase</h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-2xl">
            Each phase has a goal and a short list of key tasks. The full task lists, responsible
            parties, and notes columns live in ONBOARD-001 on the documentation page.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Phase 1 */}
          <PhaseCard
            number="1"
            title="Pre-Onboarding"
            goal="Get agreements, IRB, and roles in place. Send the documentation package."
            accent={PENN_BLUE}
            iconBg="rgba(1,31,91,0.08)"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={PENN_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="13" y2="17" />
              </svg>
            }
            tasks={[
              'Site PI confirmed; Site Data Manager designated',
              'Local IRB approval verified; Data Use Agreement signed',
              'Institution prefix and starting subject number assigned',
              'Documentation package sent: GOV-001 + four SOPs',
              'Site reviews all five documents',
            ]}
          />

          {/* Phase 2 */}
          <PhaseCard
            number="2"
            title="Account and Tooling Setup"
            goal="Provision platform accounts, install pre-processing tools, set up the local subject ID key store."
            accent={TEAL_TEXT}
            iconBg="rgba(109,211,206,0.16)"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={TEAL_TEXT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="16" r="1" />
                <rect x="3" y="10" width="18" height="12" rx="2" ry="2" />
                <path d="M7 10V7a5 5 0 0 1 10 0v3" />
              </svg>
            }
            tasks={[
              'REDCap account and chosen data infrastructure credentials in place',
              'API key generated and stored securely (only shown once)',
              'dcm2niix and pydeface installed at the site',
              'Secure local storage set up for the BIDS-ID-to-patient-ID key',
            ]}
          />

          {/* Phase 3 */}
          <PhaseCard
            number="3"
            title="Training"
            goal="Walk through GOV-001, the SOPs, and a live demo of the NeuroGate tool."
            accent="#7c3aed"
            iconBg="rgba(124,58,237,0.08)"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            }
            tasks={[
              'Project overview and governance framework presented',
              'BIDS structure and de-identification workflow walked through',
              'NeuroGate tool demonstrated end-to-end',
              'REDCap walkthrough and data infrastructure overview completed',
              'Site Data Manager confirms readiness for the supervised upload',
            ]}
          />

          {/* Phase 4 */}
          <PhaseCard
            number="4"
            title="First Subject (Supervised)"
            goal="The site's first real subject is uploaded under direct supervision from the project lead. This is the validation run for GOV-001 7.3."
            accent={TEAL_TEXT}
            iconBg="rgba(109,211,206,0.16)"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={TEAL_TEXT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                <polyline points="11 8 11 11 13 13" />
              </svg>
            }
            tasks={[
              'Subject ID assigned and recorded in the local key store',
              'Conversion, defacing, and EEG header cleaning completed',
              'NeuroGate validation passes with zero errors',
              'PHI Clearance Form signed for this subject',
              'Upload run while the project lead is on call or screen-shares',
              'ALCOA+ audit log archived alongside the BIDS export',
            ]}
          />

          {/* Phase 5 */}
          <PhaseCard
            number="5"
            title="Independent Operation"
            goal="Subjects 2 and 3 are uploaded independently and reviewed by the Quality Auditor."
            accent={PENN_BLUE}
            iconBg="rgba(1,31,91,0.08)"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={PENN_BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            }
            tasks={[
              'Second and third subjects uploaded without supervision',
              'PHI Clearance Form signed for each subject',
              'Quality audit performed on both uploads',
              'Non-conformances classified Critical / Major / Minor and resolved',
            ]}
          />

          {/* Completion card */}
          <div
            className="rounded-2xl border border-gray-100 p-7 transition-shadow duration-300 hover:shadow-md"
            style={{
              background: `linear-gradient(135deg, ${PENN_BLUE} 0%, ${PENN_BLUE_HOVER} 100%)`,
            }}
          >
            <div className="flex items-start gap-4 mb-5">
              <div
                className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
              >
                <ShieldIcon size={22} color={TEAL} />
              </div>
              <div className="flex-1 min-w-0">
                <span
                  className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(109,211,206,0.18)', color: TEAL }}
                >
                  Completion
                </span>
                <h3 className="text-base font-semibold text-white mt-2">Onboarding complete</h3>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  Once Phase 5 reviews pass, the Onboarding Lead documents completion in the project
                  training records per GOV-001 Section 2.5. The site is fully onboarded and shares
                  data independently.
                </p>
              </div>
            </div>
            <div className="border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                After completion
              </div>
              <ul className="space-y-1.5">
                {[
                  'Site shares data independently',
                  'Site enters the quarterly audit cycle',
                  'Onboarding Lead remains primary contact for support',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CRITICAL HARD STOPS ─────────────────────────── */}
      <section className="mb-14">
        <div className="mb-6">
          <Eyebrow color="#a16207" bg="rgba(234,179,8,0.10)">Hard stops</Eyebrow>
          <h2 className="text-2xl font-bold text-gray-900 mt-3">Gate criteria between phases</h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-2xl">
            The following must be true before advancing to each phase. Onboarding does not move
            forward otherwise.
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 overflow-hidden bg-white">
          <table className="w-full text-left">
            <thead style={{ backgroundColor: 'rgba(1,31,91,0.04)' }}>
              <tr>
                <th className="text-[10px] font-bold uppercase tracking-widest text-gray-500 py-3 px-4">Before</th>
                <th className="text-[10px] font-bold uppercase tracking-widest text-gray-500 py-3 px-4">Criteria must be true</th>
              </tr>
            </thead>
            <tbody>
              <GateRow
                before="Phase 2"
                criteria="Site PI confirmed, Site Data Manager designated, IRB approval and Data Use Agreement on file, institution prefix assigned."
              />
              <GateRow
                before="Phase 3"
                criteria="REDCap access working; site has provisioned its own data infrastructure; subject ID key store ready; dcm2niix and pydeface installed and verified."
              />
              <GateRow
                before="Phase 4"
                criteria="Training session held; Site Data Manager confirms readiness for the supervised upload."
              />
              <GateRow
                before="Phase 5"
                criteria="First subject uploaded under supervision and validated end-to-end; PHI Clearance Form signed; ALCOA+ audit log archived."
              />
              <GateRow
                before="Fully Onboarded"
                criteria="All three subjects uploaded; PHI Clearance Form signed for each; Quality Auditor has reviewed subjects 2 and 3."
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* ─── DOCUMENTS + TOOLS ───────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-14">
        {/* Documentation package */}
        <div>
          <Eyebrow>Documentation package</Eyebrow>
          <h2 className="text-xl font-bold text-gray-900 mt-3 mb-2">What the site receives in Phase 1</h2>
          <p className="text-xs text-gray-500 leading-relaxed mb-5">
            Five documents are sent at kickoff. The site reviews all of them before Phase 2 begins.
          </p>
          <div className="space-y-2.5">
            <DocRow id="GOV-001" title="Regulatory Governance Framework" to="/docs/gov-001" />
            <DocRow id="SOP-BIDS-001" title="BIDS Data Structure" to="/docs/sop-bids" />
            <DocRow id="SOP-PENNSIEVE-001" title="Pennsieve Upload Procedures (optional reference)" to="/docs/sop-pennsieve" />
            <DocRow id="SOP-REDCAP-001" title="REDCap Metadata Entry" to="/docs/sop-redcap" />
            <DocRow id="SOP-GUI-001" title="NeuroGate Compliance Tool User Guide" to="/docs/sop-gui" />
          </div>
        </div>

        {/* Tools to install */}
        <div>
          <Eyebrow color={TEAL_TEXT} bg="rgba(109,211,206,0.12)">Tools to install</Eyebrow>
          <h2 className="text-xl font-bold text-gray-900 mt-3 mb-2">What the site installs in Phase 2</h2>
          <p className="text-xs text-gray-500 leading-relaxed mb-5">
            Two open-source tools handle conversion and de-identification before the NeuroGate tool
            takes over.
          </p>
          <div className="rounded-xl border border-gray-100 bg-white p-5 mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Required</div>
            <div className="text-sm font-semibold text-gray-900">dcm2niix</div>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              DICOM to NIfTI conversion with BIDS-ready JSON sidecars.
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-5 mb-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Required</div>
            <div className="text-sm font-semibold text-gray-900">pydeface (with FSL)</div>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Facial de-identification for T1w, T2w, and FLAIR scans.
            </p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-5 mb-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Optional</div>
            <div className="text-sm font-semibold text-gray-900">Pennsieve Agent (only if site uses Pennsieve)</div>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              CLI uploads with resume support; recommended for large or multi-subject datasets.
            </p>
          </div>
          <Link
            to="/tools"
            className="no-underline inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: PENN_BLUE }}
          >
            See install guides on the Pre-Processing page
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ─── GOVERNANCE BANNER ───────────────────────────── */}
      <div
        className="rounded-2xl px-6 md:px-10 py-8 md:py-10 mb-12"
        style={{ background: `linear-gradient(135deg, ${PENN_BLUE} 0%, ${PENN_BLUE_HOVER} 100%)` }}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start md:items-center">
          <div className="md:col-span-2">
            <Eyebrow color={TEAL} bg="rgba(109,211,206,0.15)">Governance</Eyebrow>
            <h3 className="text-2xl font-bold text-white mt-3">
              Why every site goes through this
            </h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
              GOV-001 Section 7.3 requires that before any site shares data, they must designate
              and train a site data manager, obtain local IRB approval, sign a data use agreement,
              successfully upload and validate a real subject under supervision, and demonstrate
              de-identification procedures. ONBOARD-001 is how that happens. Onboarding completion
              is recorded in the project training records per GOV-001 Section 2.5.
            </p>
          </div>
          <div className="flex md:justify-end">
            <Link
              to="/docs/onboarding"
              className="no-underline inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: TEAL, color: PENN_BLUE }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#5bc4bf')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = TEAL)}
            >
              Open ONBOARD-001
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

    </div>
  );
}
