import React, { useState, type JSX } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound } from 'lucide-react';
import markSvg from '../assets/mark.svg?no-inline';
import { login } from '../api/admin';
import { useUI } from '../i18n/UI';
import { version } from '../../package.json';

/** LoginPage 提交管理 token，成功后清空输入。 */
export function LoginPage(props: { onAuthenticated: () => void }): JSX.Element {
  const { onAuthenticated } = props;
  const ui = useUI();
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
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
      setToken('');
      setShowToken(false);
      onAuthenticated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : ui.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(ui.tokenCommand);
      setCopied(true);
    } catch (err) {
      setError(`${ui.copyFailed} ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="login-page-container">
      <svg className="login-network" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="0.7">
          <path d="M0 213 17 138 127 73 148 199 87 255 0 213 87 180 127 73 M17 138 87 180 148 199 201 184 232 267 187 295 148 199 M87 180 87 255 69 392 141 384 187 295 238 402 316 367 232 267 201 184 187 295 M0 256 87 255 M0 376 69 392 M0 380 141 384 238 402 371 367 232 267 M316 367 371 367" />
          <path d="M475 94 492 16 550 -4 503 142 475 94 550 -4 658 46 639 -6 M492 16 503 142 M658 46 746 33 774 -6 M746 33 854 21 831 -6 M854 21 858 141 916 33 854 21 M858 141 979 159 916 33 M948 40 979 103 1088 132 948 40 1015 188 1088 132 1143 160 1155 240 1089 217 1088 132 M979 103 1015 188 1003 285 1089 217 1143 160 M1003 285 1097 293 1089 217 1015 188 M1097 293 1155 240 1220 310 1162 380 1097 293 M1162 380 1273 344 1220 310 1318 317 1379 239 1421 326 1318 317 1433 378 1379 239 M1337 109 1427 57 M1337 109 1379 239 M1421 326 1433 378" />
          <path d="M0 715 47 649 81 567 109 615 171 551 202 619 155 740 0 731 M0 715 109 615 47 649 M81 567 171 551 M109 615 202 619 334 571 369 630 416 598 334 571 M369 630 354 783 273 787 155 740 175 818 273 787 289 895 241 869 175 818 M241 869 273 787 284 841 354 783 457 860 411 780 273 787 M289 895 457 860 M354 783 411 780 M467 759 559 797 643 758 754 869 753 754 643 758 M509 900 559 797 586 900 M754 869 811 759 753 754 M711 900 754 869 854 857 811 759 M814 900 854 857 987 854" />
          <path d="M1000 552 1014 604 1083 635 1000 552 1150 616 1083 635 1059 715 1014 604 M1150 616 1027 759 1059 715 1171 764 1027 759 1078 828 1059 715 M1078 828 1171 764 M1150 616 1247 595 1375 645 1328 750 1372 698 1247 595 M1375 645 1440 582 M1372 698 1440 613 M1328 750 1363 824 1375 645 M1363 824 1300 900 M1363 824 1440 862 M1440 550 1375 645" />
        </g>
        <g fill="currentColor">
          {[[0,213,9],[87,255,9],[384,108,1.5],[979,159,9],[1088,132,9],[1143,160,9],[1337,109,9],[1427,57,1.5],[155,740,9],[241,869,9],[457,860,9],[754,869,9],[987,854,1.5],[1000,552,9],[1171,764,9],[1247,595,9]].map(([cx,cy,r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)}
        </g>
      </svg>
      <div className="login-center">
        <div className="login-card">
          <div className="login-header">
            <img src={markSvg} alt="" width={36} height={40} className="login-brand-mark" />
            <h1 className="login-title">{ui.brandName}</h1>
          </div>
          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="login-error-banner" role="alert">{error}</div>}
            <div className="login-field">
              <label htmlFor="admin-token-input" className="login-label">{ui.adminToken}</label>
              <div className="login-token-control">
                <KeyRound size={18} aria-hidden="true" />
                <input id="admin-token-input" type={showToken ? 'text' : 'password'} className="login-input font-mono"
                  placeholder={ui.adminTokenPlaceholder} value={token} onChange={e => setToken(e.target.value)}
                  disabled={loading} autoFocus autoComplete="off" spellCheck={false} />
                <button type="button" aria-label={showToken ? ui.hideSecret : ui.showSecret} aria-pressed={showToken}
                  onClick={() => setShowToken(!showToken)}>{showToken ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </div>
            <button type="submit" className="login-submit-button" disabled={loading || !token.trim()}>{loading ? ui.loggingIn : ui.login}</button>
          </form>
          <div className="login-token-help">
            <p>{ui.tokenHelp}</p>
            <div className="login-command"><code>{ui.tokenCommand}</code><button type="button" onClick={() => void copyCommand()}
              aria-label={copied ? ui.copied : ui.copyCommand}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div>
            <span className="login-copy-status" role="status">{copied ? ui.copied : ''}</span>
            <p>{ui.tokenDockerHelp}</p>
          </div>
        </div>
        <p className="login-version" aria-label={ui.webuiVersion}>{`v${version}`}</p>
      </div>
    </div>
  );
}
