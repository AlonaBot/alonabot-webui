import React, { useState, type JSX } from 'react';
import markSvg from '../assets/mark.svg?no-inline';
import { login, AdminAPIError } from '../api/admin';
import { useUI } from '../i18n/UI';

/** LoginPage 提交管理 token，成功后清空输入。 */
export function LoginPage(props: { onAuthenticated: () => void }): JSX.Element {
  const { onAuthenticated } = props;
  const ui = useUI();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setError(ui.tokenRequired);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await login(trimmed);
      // 成功后清空输入状态，不留明文
      setToken('');
      onAuthenticated();
    } catch (err: unknown) {
      if (err instanceof AdminAPIError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(ui.loginFailed);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-card">
        <div className="login-header">
          <img src={markSvg} alt="AlonaBot" width={48} height={48} className="login-brand-mark" />
          <h1 className="login-title">{ui.loginTitle}</h1>
          <p className="login-desc">{ui.loginDesc}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error ? (
            <div className="login-error-banner" role="alert">
              {error}
            </div>
          ) : null}

          <div className="login-field">
            <label htmlFor="admin-token-input" className="login-label">
              {ui.adminToken}
            </label>
            <input
              id="admin-token-input"
              type="password"
              className="login-input font-mono"
              placeholder={ui.adminTokenPlaceholder}
              value={token}
              onChange={e => setToken(e.target.value)}
              disabled={loading}
              autoFocus
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            className="login-submit-button"
            disabled={loading || !token.trim()}
          >
            {loading ? ui.loggingIn : ui.login}
          </button>
        </form>
      </div>
    </div>
  );
}
