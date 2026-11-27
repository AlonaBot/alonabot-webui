import { useEffect, useState, type JSX } from 'react';
import { Terminal, Users, Wrench } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { navigate } from '../shell/router';
import { TabBar } from '../ui/Tabs';
import { toast } from '../ui/toast';
import { loadUsers } from './users';

export function PermissionsTabs({
  active,
  userCount,
}: {
  active: 'commands' | 'tools' | 'users';
  userCount?: number | null;
}): JSX.Element {
  const ui = useUI();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (userCount !== undefined) return;
    void loadUsers()
      .then(users => setCount(users.length))
      .catch(error => toast.error(error));
  }, [userCount]);

  const total = userCount === undefined ? count : userCount;

  const handleTabChange = (next: string): void => {
    if (next === 'commands') navigate('/permissions');
    else if (next === 'tools') navigate('/permissions/tools');
    else if (next === 'users') navigate('/permissions/users');
  };

  return (
    <div className="mb-1">
      <TabBar
        value={active}
        onValueChange={handleTabChange}
        aria-label={ui.permissions}
        items={[
          {
            value: 'commands',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Terminal size={15} aria-hidden="true" />
                {ui.tabCommands}
              </span>
            ),
          },
          {
            value: 'tools',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Wrench size={15} aria-hidden="true" />
                {ui.tabTools}
              </span>
            ),
          },
          {
            value: 'users',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Users size={15} aria-hidden="true" />
                {ui.users}
              </span>
            ),
            count: total ?? undefined,
          },
        ]}
      />
    </div>
  );
}
