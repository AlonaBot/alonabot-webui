import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { AlertCircle, Calendar, Pause, Play, RefreshCw, Search, X } from 'lucide-react';
import { changePluginJob, listPluginJobs, type PluginJob } from '../api/packages';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { Button } from '../ui/Button';
import { EmptyState, LoadingRows } from '../ui/EmptyState';
import { SpotlightCard } from '../ui/SpotlightCard';
import { toast } from '../ui/toast';

export function PluginJobsPanel(props: { id: string }): JSX.Element {
  const { id } = props;
  const ui = useUI();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<PluginJob[]>([]);
  const [query, setQuery] = useState('');
  const [operatingId, setOperatingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const res = await listPluginJobs(id);
      setJobs(res.jobs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggleJob = async (job: PluginJob): Promise<void> => {
    const action = job.paused ? 'resume' : 'pause';
    setOperatingId(job.job_id);
    setError(null);
    try {
      await changePluginJob(id, job.job_id, action);
      await loadData();
    } catch (err: unknown) {
      toast.error(err);
    } finally {
      setOperatingId(null);
    }
  };

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(j => j.job_id.toLowerCase().includes(q) || j.trigger.toLowerCase().includes(q));
  }, [jobs, query]);

  if (loading) {
    return (
      <SpotlightCard className="p-5">
        <LoadingRows />
      </SpotlightCard>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="plugins-error-banner" role="alert">
          <span className="inline-flex items-center gap-2">
            <AlertCircle size={15} aria-hidden="true" />
            {error}
          </span>
          <button
            type="button"
            aria-label={ui.close}
            className="error-banner-close"
            onClick={() => setError(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <SpotlightCard className="p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-ink-muted)]"
            />
            <input
              type="search"
              placeholder={ui.searchJobs}
              aria-label={ui.searchJobs}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="h-8 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] pr-3 pl-8.5 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            iconOnly
            onClick={() => void loadData()}
            disabled={operatingId !== null}
            title={ui.refresh}
            aria-label={ui.refresh}
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      </SpotlightCard>

      {filteredJobs.length === 0 ? (
        <SpotlightCard className="p-6">
          <EmptyState icon={<Calendar size={22} />} title={jobs.length === 0 ? ui.noJobs : ui.noMatches} />
        </SpotlightCard>
      ) : (
        <SpotlightCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-[var(--color-line)] text-left font-sans text-xs font-medium text-[var(--color-ink-muted)]">
                  <th className="px-5 py-3">{ui.jobName}</th>
                  <th className="px-4 py-3">{ui.jobTrigger}</th>
                  <th className="px-4 py-3">{ui.jobLastRun}</th>
                  <th className="px-4 py-3">{ui.jobNextRun}</th>
                  <th className="px-4 py-3 text-right">{ui.jobState}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]/70">
                {filteredJobs.map(job => (
                  <tr
                    key={job.job_id}
                    className={cn(
                      'transition-colors hover:bg-[var(--color-surface-2)]/50',
                      job.paused && 'opacity-75',
                    )}
                  >
                    <td className="px-5 py-3 font-semibold text-[var(--color-ink)]">{job.job_id}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-accent-strong)]">
                        {job.trigger}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--color-ink-muted)]">
                      {job.last_run_at || ui.jobNotRun}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--color-ink-muted)]">
                      {job.next_run_at || ui.jobNotScheduled}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-sans">
                      <div className="inline-flex items-center gap-2">
                        {job.paused && (
                          <span className="rounded-full bg-[color-mix(in_srgb,var(--color-warning)_16%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning-ink)]">
                            {ui.paused}
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant={job.paused ? 'soft' : 'secondary'}
                          icon={job.paused ? <Play size={12} /> : <Pause size={12} />}
                          loading={operatingId === job.job_id}
                          disabled={operatingId !== null}
                          onClick={() => void handleToggleJob(job)}
                          title={job.paused ? ui.resume : ui.pause}
                        >
                          {job.paused ? ui.resume : ui.pause}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SpotlightCard>
      )}
    </div>
  );
}
