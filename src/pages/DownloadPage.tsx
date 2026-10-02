import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_VERSION } from '../version';

const PENN_BLUE = '#011F5B';
const PENN_BLUE_HOVER = '#01326e';
const TEAL_TEXT = '#0F6E56';

const REPO = 'brandonbach44-sudo/Neurogate-Protocol';
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

type Platform = 'mac' | 'windows' | 'linux';

const PLATFORMS: { id: Platform; name: string; requirement: string; assetPattern: RegExp }[] = [
  { id: 'mac', name: 'macOS', requirement: 'Apple Silicon Mac (M1 or newer)', assetPattern: /-arm64\.dmg$/ },
  { id: 'windows', name: 'Windows', requirement: 'Windows 10 or 11, 64-bit', assetPattern: /^NeuroGate-Setup-.*\.exe$/ },
  { id: 'linux', name: 'Linux', requirement: '64-bit Linux (AppImage)', assetPattern: /\.AppImage$/ },
];

interface ReleaseAsset { name: string; size: number; url: string }
interface LatestRelease { version: string; publishedAt: string; assets: Partial<Record<Platform, ReleaseAsset>> }

/**
 * Best guess at the visitor's operating system, used only to pick which
 * platform is shown first. Browsers don't reveal whether a Mac is Apple
 * Silicon or Intel, which is why the macOS card states the requirement.
 */
function detectPlatform(): Platform | 'mobile' | null {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
  const ua = navigator.userAgent;
  if (nav.userAgentData?.mobile || /iPhone|iPad|iPod|Android/i.test(ua)) return 'mobile';
  const platform = (nav.userAgentData?.platform || navigator.platform || ua).toLowerCase();
  if (platform.includes('mac')) return 'mac';
  if (platform.includes('win')) return 'windows';
  if (platform.includes('linux')) return 'linux';
  return null;
}

function formatSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * The latest published release, read from GitHub's public API, so this
 * page always offers the newest installers without being edited for each
 * release. Download links point straight at the installer files; visitors
 * never land on GitHub unless the lookup fails (then the buttons open the
 * release page instead).
 */
function useLatestRelease() {
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { tag_name: string; published_at: string; assets: { name: string; size: number; browser_download_url: string }[] }) => {
        if (cancelled) return;
        const assets: LatestRelease['assets'] = {};
        for (const p of PLATFORMS) {
          const a = data.assets.find(x => p.assetPattern.test(x.name));
          if (a) assets[p.id] = { name: a.name, size: a.size, url: a.browser_download_url };
        }
        setRelease({ version: data.tag_name.replace(/^v/, ''), publishedAt: data.published_at, assets });
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  return { release, failed };
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[11px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full"
      style={{ backgroundColor: 'rgba(1,31,91,0.06)', color: PENN_BLUE }}
    >
      {children}
    </span>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
        style={{ backgroundColor: 'rgba(1,31,91,0.08)', color: PENN_BLUE }}
      >
        {n}
      </span>
      <div className="text-sm text-gray-600 leading-relaxed pt-0.5">{children}</div>
    </li>
  );
}

function Code({ children }: { children: string }) {
  return <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-800">{children}</code>;
}

function InstallSteps({ platform, fileName }: { platform: Platform; fileName?: string }) {
  if (platform === 'mac') {
    return (
      <ol className="space-y-3">
        <Step n={1}>Open the downloaded <Code>{fileName ?? 'NeuroGate-<version>-arm64.dmg'}</Code> file from your Downloads folder.</Step>
        <Step n={2}>Drag <strong>NeuroGate</strong> into the <strong>Applications</strong> folder.</Step>
        <Step n={3}>Open NeuroGate from Applications. macOS will say it can't verify the developer. Click <strong>Done</strong>.</Step>
        <Step n={4}>Open <strong>System Settings</strong>, go to <strong>Privacy &amp; Security</strong>, scroll down and click <strong>Open Anyway</strong> next to NeuroGate, then confirm. You only need to do this once.</Step>
      </ol>
    );
  }
  if (platform === 'windows') {
    return (
      <ol className="space-y-3">
        <Step n={1}>Open the downloaded <Code>{fileName ?? 'NeuroGate-Setup-<version>.exe'}</Code> file.</Step>
        <Step n={2}>If Windows shows "Windows protected your PC", click <strong>More info</strong>, then <strong>Run anyway</strong>.</Step>
        <Step n={3}>Follow the installer. You can choose where NeuroGate is installed.</Step>
        <Step n={4}>Open NeuroGate from the Start menu.</Step>
      </ol>
    );
  }
  const name = fileName ?? 'NeuroGate-<version>.AppImage';
  return (
    <ol className="space-y-3">
      <Step n={1}>Open a terminal in the folder you downloaded <Code>{name}</Code> to.</Step>
      <Step n={2}>Make it executable: <Code>{`chmod +x ${name}`}</Code></Step>
      <Step n={3}>Run it: <Code>{`./${name}`}</Code>. You can also double-click it in most file managers.</Step>
      <Step n={4}>If it doesn't start, your system may be missing FUSE, which AppImages need. On Ubuntu, install the <Code>libfuse2</Code> package (<Code>libfuse2t64</Code> on Ubuntu 24.04).</Step>
    </ol>
  );
}

export default function DownloadPage() {
  const isDesktopApp = typeof window !== 'undefined' && Boolean(window.neurogateDesktop);
  const detected = typeof navigator !== 'undefined' ? detectPlatform() : null;
  const { release, failed } = useLatestRelease();
  const [platform, setPlatform] = useState<Platform>(detected && detected !== 'mobile' ? detected : 'mac');
  const [started, setStarted] = useState<Platform | null>(null);

  const ordered = [...PLATFORMS].sort((a, b) => (a.id === platform ? -1 : b.id === platform ? 1 : 0));

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 md:py-16">
      {/* ─── Header ─────────────────────────────────────── */}
      <div className="mb-10">
        <Eyebrow>Download</Eyebrow>
        <h1 className="text-3xl font-bold text-gray-900 mt-4 leading-tight">Install NeuroGate</h1>
        <p className="mt-4 text-sm text-gray-500 leading-relaxed max-w-2xl">
          NeuroGate is a free desktop app for macOS, Windows and Linux. It processes everything on
          your computer and never uploads your data. The installer includes the command-line tool as well.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          {release
            ? `Latest version ${release.version}, released ${new Date(release.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.`
            : failed
              ? 'Version details could not be loaded right now. The buttons below open the release page instead.'
              : 'Checking for the latest version...'}
        </p>
      </div>

      {isDesktopApp && (
        <div className="rounded-xl border border-gray-100 p-5 mb-10" style={{ backgroundColor: 'rgba(109,211,206,0.10)' }}>
          <p className="text-sm font-semibold" style={{ color: TEAL_TEXT }}>You're using the desktop app (version {APP_VERSION}).</p>
          <p className="text-sm text-gray-600 mt-1">
            It checks for a new version each time it opens, so there's nothing to download here. The links below are
            for installing NeuroGate on another computer.
          </p>
        </div>
      )}

      {detected === 'mobile' && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 mb-10 text-sm text-gray-600">
          NeuroGate is a desktop app and doesn't run on phones or tablets. Open this page on a Mac, Windows or Linux computer to download it.
        </div>
      )}

      {/* ─── Platforms ──────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {ordered.map(p => {
          const asset = release?.assets[p.id];
          const href = asset?.url ?? `${RELEASES_URL}/latest`;
          const isPrimary = p.id === platform;
          return (
            <div
              key={p.id}
              className="rounded-xl border bg-white p-5 shadow-sm flex flex-col"
              style={{ borderColor: isPrimary ? 'rgba(1,31,91,0.25)' : '#f3f4f6' }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-gray-900">{p.name}</h2>
                {isPrimary && detected === p.id && <span className="text-[10px] text-gray-400 uppercase tracking-wide">Your system</span>}
              </div>
              <p className="text-xs text-gray-500 mt-1">{p.requirement}</p>
              <p className="text-xs text-gray-400 mt-1 font-mono truncate" title={asset?.name}>
                {asset ? `${asset.name} · ${formatSize(asset.size)}` : ' '}
              </p>
              <a
                href={href}
                onClick={() => { setPlatform(p.id); setStarted(asset ? p.id : null); }}
                {...(asset ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                className="btn-cta no-underline mt-4 inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={isPrimary
                  ? { backgroundColor: PENN_BLUE, color: '#ffffff' }
                  : { border: '1px solid #d1d5db', color: '#374151' }}
                onMouseEnter={e => { if (isPrimary) e.currentTarget.style.backgroundColor = PENN_BLUE_HOVER; }}
                onMouseLeave={e => { if (isPrimary) e.currentTarget.style.backgroundColor = PENN_BLUE; }}
              >
                Download for {p.name}
              </a>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mb-12">
        Using an Intel Mac? There's no build for Intel Macs yet. You can use NeuroGate in your browser instead (see below).
      </p>

      {/* ─── Install steps ──────────────────────────────── */}
      <section className="rounded-2xl border border-gray-100 bg-white p-6 md:p-8 shadow-sm mb-10">
        {started && (
          <div className="rounded-lg p-3 mb-6 text-sm" style={{ backgroundColor: 'rgba(109,211,206,0.12)', color: TEAL_TEXT }}>
            Your download should start in a moment. When it finishes, follow these steps.
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Installing on {PLATFORMS.find(p => p.id === platform)!.name}</h2>
          <div className="flex gap-1 p-0.5 rounded-lg text-xs font-medium" style={{ backgroundColor: 'rgba(1,31,91,0.05)' }}>
            {PLATFORMS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                className="btn-cta px-3 py-1 rounded-md transition-colors"
                style={{ backgroundColor: platform === p.id ? '#ffffff' : 'transparent', color: platform === p.id ? PENN_BLUE : '#6b7280' }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <InstallSteps platform={platform} fileName={release?.assets[platform]?.name} />
      </section>

      {/* ─── Notes ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Why the security warning?</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            NeuroGate isn't signed with a paid Apple or Microsoft developer certificate yet, so your computer can't
            confirm who made it and asks you to approve it once. The installers come from the project's official
            releases.
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Updates</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            NeuroGate checks for a new version each time it opens. On Windows and Linux it downloads and installs
            the update after asking you. On macOS it opens the download for the new version, and you replace the app
            in Applications.
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Command-line tool</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Every installer includes the <Code>neurogate</Code> command-line tool. To set it up, open the app and
            click <strong>Install CLI</strong> in the top bar. See the user guide (SOP-GUI-001) for details.
          </p>
        </div>
      </div>

      <div className="text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-2">
        <span>
          Prefer not to install anything? <Link to="/tool" className="font-medium" style={{ color: PENN_BLUE }}>Use NeuroGate in your browser</Link>.
          It works the same way, but can't export files larger than 500 MB.
        </span>
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="font-medium" style={{ color: PENN_BLUE }}>
          All versions and release notes
        </a>
      </div>
    </div>
  );
}
