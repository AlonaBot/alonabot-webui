import { useContext, type JSX } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Compass, Home, LogIn, Search, ShieldOff } from 'lucide-react';
import { useUI } from '../../i18n/UI';
import { navigate } from '../../shell/router';
import { SearchContext } from '../../shell/search';
import { Button } from '../../ui/Button';
import { SpotlightCard } from '../../ui/SpotlightCard';

export interface StatusPageProps {
  readonly code: 403 | 404;
  readonly path?: string;
  readonly onReauthenticate?: () => void;
}

/** 专属 404 / 403 状态页：延续 Alona Crisp Navy & Ice-Cyan 视觉与快捷导航入口。 */
export function StatusPage({ code, path, onReauthenticate }: StatusPageProps): JSX.Element {
  const ui = useUI();
  const reduced = useReducedMotion();
  const search = useContext(SearchContext);
  const isForbidden = code === 403;

  const title = isForbidden ? ui.status403Title : ui.status404Title;
  const description = isForbidden ? ui.status403Desc : ui.status404Desc;

  return (
    <section
      aria-labelledby="status-page-heading"
      className="flex min-h-[64vh] w-full items-center justify-center py-10"
    >
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduced ? { duration: 0.01 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[520px]"
      >
        <SpotlightCard
          glowTone={isForbidden ? 'warning' : 'accent'}
          className="relative overflow-hidden rounded-[22px] p-8 text-center sm:p-10"
        >
          {/* 柔和背景光晕 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full blur-3xl"
            style={{
              background: isForbidden
                ? 'color-mix(in srgb, var(--color-warning) 22%, transparent)'
                : 'color-mix(in srgb, var(--color-accent) 24%, transparent)',
            }}
          />

          <div className="relative flex flex-col items-center">
            <div
              className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border"
              style={{
                borderColor: isForbidden
                  ? 'color-mix(in srgb, var(--color-warning) 38%, transparent)'
                  : 'color-mix(in srgb, var(--color-accent) 36%, transparent)',
                background: isForbidden
                  ? 'color-mix(in srgb, var(--color-warning) 12%, var(--color-surface))'
                  : 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))',
                color: isForbidden ? 'var(--color-warning-ink)' : 'var(--color-accent)',
              }}
            >
              {isForbidden ? <ShieldOff size={26} aria-hidden="true" /> : <Compass size={26} aria-hidden="true" />}
            </div>

            <div
              aria-hidden="true"
              className="tabular-nums bg-clip-text font-mono text-6xl font-extrabold tracking-tighter text-transparent sm:text-7xl"
              style={{
                backgroundImage: isForbidden
                  ? 'linear-gradient(135deg, var(--color-warning-ink), var(--color-danger))'
                  : 'linear-gradient(135deg, var(--color-ink), var(--color-accent))',
              }}
            >
              {code}
            </div>

            <h1 id="status-page-heading" className="mt-3 text-xl font-bold tracking-tight text-[var(--color-ink)]">
              {title}
            </h1>

            <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-[var(--color-ink-muted)]">{description}</p>

            {path && (
              <div className="mt-4 inline-flex max-w-full items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 py-1 font-mono text-xs text-[var(--color-ink-muted)]">
                <span className="truncate">{path}</span>
              </div>
            )}

            <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
              <Button variant="primary" icon={<Home size={15} />} onClick={() => navigate('/overview')}>
                {ui.backToOverview}
              </Button>
              <Button variant="secondary" icon={<ArrowLeft size={15} />} onClick={() => window.history.back()}>
                {ui.goBack}
              </Button>
              {isForbidden && onReauthenticate ? (
                <Button variant="soft" icon={<LogIn size={15} />} onClick={onReauthenticate}>
                  {ui.signInAgain}
                </Button>
              ) : (
                <Button variant="soft" icon={<Search size={15} />} onClick={() => search.open()}>
                  {ui.openCommandPalette}
                </Button>
              )}
            </div>
          </div>
        </SpotlightCard>
      </motion.div>
    </section>
  );
}
