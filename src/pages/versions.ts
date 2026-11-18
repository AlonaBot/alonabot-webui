const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
export function compareVersions(a: string, b: string): number | null {
  const left = semver.exec(a), right = semver.exec(b);
  if (!left || !right) return null;
  for (let i = 1; i <= 3; i++) { const x = BigInt(left[i]), y = BigInt(right[i]); if (x !== y) return x > y ? 1 : -1; }
  if (!left[4] || !right[4]) return left[4] === right[4] ? 0 : left[4] ? -1 : 1;
  const x = left[4].split('.'), y = right[4].split('.');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    if (x[i] === y[i]) continue;
    const xn = /^\d+$/.test(x[i]), yn = /^\d+$/.test(y[i]);
    if (xn && yn) return BigInt(x[i]) > BigInt(y[i]) ? 1 : -1;
    if (xn !== yn) return xn ? -1 : 1;
    return x[i] > y[i] ? 1 : -1;
  }
  return 0;
}
export function repository(source: string): string | null {
  const match = /^(?:https:\/\/)?(?:github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(source);
  return match && !match[1].split('/').some(part => part === '.' || part === '..') ? match[1] : null;
}
export function unreadEntries<T extends { version: string }>(entries: T[], seen: string | null): T[] {
  return entries.filter(entry => compareVersions(entry.version, entry.version) === 0 && (!seen || compareVersions(entry.version, seen) === 1));
}
