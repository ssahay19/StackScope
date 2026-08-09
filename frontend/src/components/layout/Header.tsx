import { Link } from 'react-router-dom';

export const Header = () => (
  <header className="w-full">
    <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
      <Link to="/" className="group flex items-center gap-2.5">
        <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-soft shadow-glow">
          <span className="absolute inset-0 rounded-lg bg-black/10" aria-hidden />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="relative h-4 w-4 text-white"
            aria-hidden
          >
            <path
              d="M4 6h9M4 12h13M4 18h7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="19" cy="18" r="2.2" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-white/95 group-hover:text-white">
          StackScope
        </span>
      </Link>

      <nav className="flex items-center gap-1 text-sm text-white/60">
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-lg px-3 py-1.5 hover:bg-white/[0.04] hover:text-white/90 transition-colors"
        >
          Docs
        </a>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-lg px-3 py-1.5 hover:bg-white/[0.04] hover:text-white/90 transition-colors"
        >
          GitHub
        </a>
      </nav>
    </div>
  </header>
);
