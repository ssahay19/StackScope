import type { ReactNode } from 'react';
import { Header } from './Header';

interface AppShellProps {
  children: ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => (
  <div className="relative min-h-full text-white">
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-radial-glow"
    />
    <div className="relative flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <footer className="mx-auto w-full max-w-6xl px-6 pb-10 pt-6 text-xs text-white/40">
        <div className="subtle-divider mb-6" />
        <p>
          StackScope · Phase 1 · Understand any public GitHub repository in minutes.
        </p>
      </footer>
    </div>
  </div>
);
