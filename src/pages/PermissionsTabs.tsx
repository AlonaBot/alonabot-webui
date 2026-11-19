import { useEffect, useState } from 'react';
import { useUI } from '../i18n/UI';
import { Link } from '../shell/router';
import { loadUsers } from './users';

export function PermissionsTabs({ active, userCount }: { active: 'commands' | 'tools' | 'users'; userCount?: number | null }) {
  const ui = useUI();
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (userCount !== undefined) return;
    void loadUsers().then(users => setCount(users.length)).catch(error => setError(String(error)));
  }, [userCount]);
  const total = userCount === undefined ? count : userCount;
  return <>
    <div className="detail-tabs">
      <Link to="/permissions" className={`detail-tab-button ${active === 'commands' ? 'is-active' : ''}`}>{ui.tabCommands}</Link>
      <Link to="/permissions/tools" className={`detail-tab-button ${active === 'tools' ? 'is-active' : ''}`}>{ui.tabTools}</Link>
      <Link to="/permissions/users" className={`detail-tab-button ${active === 'users' ? 'is-active' : ''}`}>{ui.users}{total !== null && <> <small>{total}</small></>}</Link>
    </div>
    {error && <p className="plugins-error-banner" role="alert">{error}</p>}
  </>;
}
