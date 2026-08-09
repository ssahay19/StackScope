import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface HeroSectionProps {
  children?: ReactNode;
}

export const HeroSection = ({ children }: HeroSectionProps) => (
  <section className="mx-auto w-full max-w-3xl px-6 pt-16 sm:pt-24">
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="text-center"
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/70">
        <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_theme(colors.accent.DEFAULT)]" />
        Phase 1 · Repository mapping
      </span>

      <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl">
        Understand any GitHub repository
        <span className="block bg-gradient-to-r from-accent-soft to-accent bg-clip-text text-transparent">
          in minutes, not days.
        </span>
      </h1>

      <p className="mx-auto mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-white/60 sm:text-base">
        StackScope clones a public GitHub repository and generates a clean, interactive map of its
        structure — folders, files, and languages — so you can find your bearings fast.
      </p>
    </motion.div>

    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="mt-10"
    >
      {children}
    </motion.div>
  </section>
);
