import { Component, type ErrorInfo, type ReactNode } from 'react';

const PENN_BLUE = '#011F5B';
const PENN_BLUE_HOVER = '#01326e';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to the console for now. If an error tracking service is added later
    // (Sentry, LogRocket, etc.), wire it in here.
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        className="min-h-screen flex items-center justify-center px-6 py-12"
        style={{
          background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 40%, #f1f5f9 100%)',
        }}
      >
        <div className="max-w-lg w-full text-center">
          {/* Icon */}
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6"
            style={{ backgroundColor: 'rgba(1,31,91,0.08)' }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke={PENN_BLUE}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          {/* Headline */}
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Something went wrong.</h1>

          {/* Description */}
          <p className="text-sm text-gray-500 leading-relaxed mb-8">
            An unexpected error happened in the app. Reloading the page usually fixes it. If the
            issue keeps happening, let me know at{' '}
            <a
              href="mailto:brandon.bach44@gmail.com"
              className="font-medium no-underline"
              style={{ color: PENN_BLUE }}
            >
              brandon.bach44@gmail.com
            </a>
            .
          </p>

          {/* Buttons */}
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{ backgroundColor: PENN_BLUE, color: '#ffffff' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = PENN_BLUE_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = PENN_BLUE)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Try Again
            </button>
            <a
              href="/"
              className="no-underline inline-flex items-center px-5 py-2 rounded-lg text-sm font-medium border transition-all"
              style={{ borderColor: '#d1d5db', color: '#374151' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = PENN_BLUE)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#d1d5db')}
            >
              Back to Home
            </a>
          </div>

          {/* Dev-only error details */}
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-10 text-left text-xs">
              <summary className="cursor-pointer text-gray-500 font-medium mb-2">
                Error details (dev only)
              </summary>
              <pre
                className="rounded-lg p-4 overflow-x-auto whitespace-pre-wrap font-mono text-xs"
                style={{ backgroundColor: 'rgba(220,38,38,0.05)', color: '#991b1b' }}
              >
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
