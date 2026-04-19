import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div className="landing-mac relative flex min-h-svh flex-col text-(--mac-text)">
      <div className="landing-mac-desktop pointer-events-none fixed inset-0 -z-10" aria-hidden />

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="landing-mac-window w-full max-w-lg overflow-hidden">
          <div className="landing-mac-titlebar">
            <div className="flex justify-start pl-0.5" aria-hidden>
              <span className="landing-mac-close" />
            </div>
            <span className="truncate text-center">About this engine</span>
            <span aria-hidden />
          </div>

          <div className="landing-mac-content px-5 py-5 sm:px-7 sm:py-6">
            <h1 className="text-lg font-bold font-mono leading-snug tracking-tight sm:text-xl">
              Jira (not the ticket)
            </h1>
            <h2 className="text-sm font-mono leading-snug tracking-tight">
              a browser-native engine
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-(--mac-text-muted) sm:text-[14px]">
              Make games in the browser with Jira. 
              Create a game from scratch or upload a{' '}
              <code className="landing-mac-code">resources</code> folder, edit scripts and scenes in
              the IDE, then run the engine.
            </p>

            <nav
              className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
              aria-label="Main actions"
            >
              <Link
                to="/editor"
                className="landing-mac-btn-default inline-flex w-fit items-center justify-center no-underline"
              >
                Get started →
              </Link>
            </nav>
          </div>
        </div>
      </main>

      <footer className="landing-mac-footer relative z-10 px-3 py-2 text-center">
        Marvin Jirapongsuwan · EECS 498
      </footer>
    </div>
  )
}
