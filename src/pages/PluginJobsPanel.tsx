import { useEffect, useState, useCallback, useMemo, type JSX } from 'react';
import { AlertCircle, Calendar, Pause, Play, RefreshCw, Search, X } from 'lucide-react';
import {
  listPluginJobs,
  changePluginJob,
  type PluginJob,
} from '../api/admin';
import { useUI } from '../i18n/UI';

export function PluginJobsPanel(props: { id: string }): JSX.Element {
  const { id } = props;
  const ui = useUI();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<PluginJob[]>([]);
  const [query, setQuery] = useState('');
  const [operatingId, setOperatingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
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
    loadData();
  }, [loadData]);

  const handleToggleJob = async (job: PluginJob) => {
    const action = job.paused ? 'resume' : 'pause';
    setOperatingId(job.job_id);
    setError(null);
    try {
      await changePluginJob(id, job.job_id, action);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOperatingId(null);
    }
  };

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      j => j.job_id.toLowerCase().includes(q) || j.trigger.toLowerCase().includes(q),
    );
  }, [jobs, query]);

  if (loading) {
    return <div className="panel-loading"><p role="status">{ui.loading}</p></div>;
  }

  return (
    <div className="plugin-jobs-panel">
      {error && (
        <div className="plugins-error-banner" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" aria-label={ui.close} className="error-banner-close" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="jobs-panel-header">
        <div className="jobs-search-box">
          <Search size={15} className="jobs-search-icon" />
          <input
            type="search"
            placeholder={ui.searchJobs}
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="jobs-search-input font-mono"
          />
        </div>
        <button
          type="button"
          className="detail-icon-button"
          onClick={loadData}
          disabled={operatingId !== null}
          title={ui.refresh}
          aria-label={ui.refresh}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {filteredJobs.length === 0 ? (
        <div className="panel-empty-card">
          <Calendar size={32} className="empty-icon" />
          <p>{jobs.length === 0 ? ui.noJobs : ui.noMatches}</p>
        </div>
      ) : (
        <div className="jobs-table-container">
          <table className="jobs-table font-mono">
            <thead>
              <tr>
                <th>{ui.jobName}</th>
                <th>{ui.jobTrigger}</th>
                <th>{ui.jobLastRun}</th>
                <th>{ui.jobNextRun}</th>
                <th style={{ textAlign: 'right' }}>{ui.jobState}</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map(job => {
                return (
                  <tr key={job.job_id} className={job.paused ? 'is-paused-job' : ''}>
                    <td>
                      <span className="job-id-text">{job.job_id}</span>
                    </td>
                    <td>
                      <span className="job-trigger-badge">{job.trigger}</span>
                    </td>
                    <td>
                      {job.last_run_at ? (
                        <span className="job-time-text">{job.last_run_at}</span>
                      ) : (
                        <span className="text-muted">{ui.jobNotRun}</span>
                      )}
                    </td>
                    <td>
                      {job.next_run_at ? (
                        <span className="job-time-text">{job.next_run_at}</span>
                      ) : (
                        <span className="text-muted">{ui.jobNotScheduled}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {job.paused && <span className="job-paused-pill">{ui.paused}</span>}
                      <button
                        type="button"
                        className={`job-toggle-btn ${job.paused ? 'is-resume' : 'is-pause'}`}
                        disabled={operatingId !== null}
                        onClick={() => handleToggleJob(job)}
                        title={job.paused ? ui.resume : ui.pause}
                      >
                        {job.paused ? <Play size={13} /> : <Pause size={13} />}
                        <span>{job.paused ? ui.resume : ui.pause}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
