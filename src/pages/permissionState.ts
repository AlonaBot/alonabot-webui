import type { CommandScope, CommandOverride, CommandPolicy } from '../api/admin';

/** commandOverride 修改一项显式覆盖时保留同作用域的另一项。 */
export function commandOverride(overrides: CommandOverride[], scope: CommandScope, change: Partial<Pick<CommandOverride, 'permissions' | 'enabled'>>): CommandOverride {
  const previous = overrides.find(entry => scopeKey(entry.scope) === scopeKey(scope));
  return { scope, permissions: previous?.permissions ?? null, enabled: previous?.enabled ?? null, ...change };
}
export function scopeKey(scope: CommandScope): string {
  return JSON.stringify(scope.kind === 'group' ? ['group', ...scope.group] : scope.kind === 'route' ? ['route', scope.route_id] : ['plugin']);
}
export function permissionPreset(permissions: string[] | null): string {
  if (permissions === null) return 'inherit';
  if (permissions.length === 0 || (permissions.length === 1 && permissions[0] === 'user')) return 'everyone';
  if (permissions.length === 1 && ['chat_admin', 'admin'].includes(permissions[0])) return permissions[0];
  return 'custom';
}
export function commandDescription(command: CommandPolicy, locale: string, defaultLocale?: string): string | undefined {
  return command.descriptions?.[locale] || (defaultLocale ? command.descriptions?.[defaultLocale] : undefined) || command.descriptions?.['en-US'];
}
/** permissionParent 查找最近的显式父级权限，路径沿用声明主路径。 */
export function permissionParent(overrides: CommandOverride[], scope: CommandScope, path: string[] = []): CommandOverride | undefined {
  const group = scope.kind === 'group' ? scope.group : path.slice(0, -1);
  return overrides.filter(entry => entry.permissions !== null && scope.kind !== 'plugin' && (entry.scope.kind === 'plugin'
    || (entry.scope.kind === 'group' && entry.scope.group.length <= group.length
      && (scope.kind !== 'group' || entry.scope.group.length < group.length)
      && entry.scope.group.every((token, index) => group[index] === token))))
    .sort((a, b) => (b.scope.kind === 'group' ? b.scope.group.length : 0) - (a.scope.kind === 'group' ? a.scope.group.length : 0))[0];
}
export function matchesCommand(command: CommandPolicy, query: string, permission: string): boolean {
  return (!permission || permissionPreset(command.permissions ?? []) === permission)
    && [...command.effective_names.map(path => path.join(' ')), command.route_id].some(name => name.toLowerCase().includes(query.toLowerCase()));
}
/** scopeEnabled 沿插件与组的父链计算开关状态，父级禁用持续生效。 */
export function scopeEnabled(overrides: CommandOverride[], scope: CommandScope): boolean {
  return !overrides.some(entry => entry.enabled === false && (entry.scope.kind === 'plugin'
    || (scope.kind === 'route' && entry.scope.kind === 'route' && entry.scope.route_id === scope.route_id)
    || (scope.kind === 'group' && entry.scope.kind === 'group' && entry.scope.group.length <= scope.group.length
      && entry.scope.group.every((token, index) => scope.group[index] === token))));
}
export type CommandTree = { path: string[]; children: CommandTree[]; commands: CommandPolicy[] };
/** commandTree 按声明主路径构建策略组，别名保持在所属路由下。 */
export function commandTree(commands: CommandPolicy[], overrides: CommandOverride[]): CommandTree {
  const root: CommandTree = { path: [], children: [], commands: [] };
  const group = (path: string[]) => {
    let node = root;
    for (const token of path) {
      let child = node.children.find(entry => entry.path.at(-1) === token);
      if (!child) { child = { path: [...node.path, token], children: [], commands: [] }; node.children.push(child); }
      node = child;
    }
    return node;
  };
  for (const command of commands) group(command.declared_names[0]?.slice(0, -1) ?? []).commands.push(command);
  for (const override of overrides) if (override.scope.kind === 'group') group(override.scope.group);
  return root;
}
