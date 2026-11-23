import { useState, type JSX } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AdminAPIError, isConfirmationError } from '../../api/client';
import { changePackage, installPackage, listPackages, uninstallPackage, updatePackage, type Package } from '../../api/packages';
import { ChangelogDialog } from '../../components/ChangelogDialog';
import { useUI } from '../../i18n/UI';
import { packagesKey } from '../../queries/packages';
import { Button } from '../../ui/Button';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { toast } from '../../ui/toast';
import styles from './Plugins.module.css';

export type InstallInput = { Source: string; Replace?: boolean; Build?: boolean; Ref?: string } | { archive: File; replace?: boolean };

type Confirmation = { title: string; affected: string[]; run: () => Promise<unknown> };
/** 排队中的确认：确认后 run 的结果或取消时的 false 交还给最初的调用方。 */
type Pending = Confirmation & { settle: (done: boolean) => void };

/** 组件显示名：Core 提供 Name 时用 Name，否则用 ID。 */
export function packageName(pkg: Pick<Package, 'ID' | 'Name'>): string {
  return pkg.Name || pkg.ID;
}

/**
 * 组件操作的唯一入口。每个操作先不带确认提交；Core 返回 409 确认对象时弹出受影响列表，
 * 用户确认后带 confirm 重发。启停先乐观更新开关，失败回滚。结果用 toast 告知，
 * 安装或更新的警告与更新说明以对话框展示。dialogs 需要渲染在调用方页面里。
 */
export function usePackageActions(): {
  toggle: (pkg: Package) => Promise<void>;
  restart: (pkg: Package) => Promise<void>;
  reload: (pkg: Package) => Promise<void>;
  install: (input: InstallInput, onLog?: (log: string) => void) => Promise<boolean>;
  update: (pkg: Package, archive?: File) => Promise<boolean>;
  uninstall: (pkg: Package, purge: 0 | 1 | 2) => Promise<boolean>;
  busy: ReadonlySet<string>;
  dialogs: JSX.Element;
} {
  const ui = useUI();
  const client = useQueryClient();
  const [confirmation, setConfirmation] = useState<Pending | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [changelog, setChangelog] = useState<{ id: string; name: string; version: string } | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const mark = (id: string, on: boolean) => setBusy(previous => {
    const next = new Set(previous);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  /**
   * 执行 attempt(confirm)。需要确认时（409 确认对象，或 onError 给出的替换询问）排队等待用户，
   * 确认后返回确认执行的结果，取消时返回 false；其他错误提示后返回 false。onFailure 在没有完成时调用，用于回滚乐观更新。
   */
  async function withConfirm(id: string, attempt: (confirm: boolean) => Promise<void>, options: { confirm?: boolean; onFailure?: () => void; onError?: (error: unknown) => Confirmation | null } = {}): Promise<boolean> {
    mark(id, true);
    try {
      await attempt(options.confirm ?? false);
      return true;
    } catch (error) {
      const next = isConfirmationError(error)
        ? { title: ui.confirmAffectedTitle, affected: error.affected, run: () => withConfirm(id, attempt, { ...options, confirm: true }) }
        : options.onError?.(error) ?? null;
      if (!next) {
        toast.error(error);
        options.onFailure?.();
        return false;
      }
      return new Promise<boolean>(resolve => setConfirmation({ ...next, settle: done => {
        if (!done) options.onFailure?.();
        resolve(done);
      } }));
    } finally {
      mark(id, false);
      // 账号列表带有所属适配器的状态，组件变化后一起刷新。
      void client.invalidateQueries({ queryKey: packagesKey });
      void client.invalidateQueries({ queryKey: ['instances'] });
    }
  }

  async function toggle(pkg: Package) {
    const enable = !pkg.Enabled;
    const flip = (value: boolean) => client.setQueryData<Package[]>(packagesKey, list => list?.map(item => item.ID === pkg.ID ? { ...item, Enabled: value } : item));
    flip(enable);
    await withConfirm(pkg.ID, async confirm => {
      flip(enable);
      await changePackage(enable ? 'enable' : 'disable', pkg.ID, confirm);
      toast.success((enable ? ui.packageEnabled : ui.packageDisabled).replace('{name}', packageName(pkg)));
    }, { onFailure: () => flip(pkg.Enabled) });
  }

  async function restart(pkg: Package) {
    await withConfirm(pkg.ID, async () => {
      await changePackage('restart', pkg.ID);
      toast.success(ui.packageRestarted.replace('{name}', packageName(pkg)));
    });
  }

  async function reload(pkg: Package) {
    await withConfirm(pkg.ID, async () => {
      await changePackage('reload', pkg.ID);
      toast.success(ui.packageReloaded.replace('{name}', packageName(pkg)));
    });
  }

  function install(input: InstallInput, onLog?: (log: string) => void, replace = 'archive' in input ? input.replace === true : input.Replace === true): Promise<boolean> {
    const key = 'archive' in input ? input.archive.name : input.Source;
    return withConfirm(key, async confirm => {
      let result: Package;
      if ('archive' in input) {
        const form = new FormData();
        form.append('archive', input.archive);
        form.append('confirm', String(confirm));
        form.append('replace', String(replace));
        result = await installPackage(form);
      } else {
        result = await installPackage({ ...input, Replace: replace, Confirm: confirm }, onLog);
      }
      toast.success(ui.packageInstalled.replace('{name}', packageName(result)).replace('{version}', result.Version));
      if (result.Warnings?.length) setWarnings(result.Warnings);
    }, {
      // 同类组件已存在时 Core 返回不带 affected 的 ALREADY_EXISTS；询问后带 Replace 重发。
      onError: error => !replace && error instanceof AdminAPIError && error.status === 409 && error.code === 'ALREADY_EXISTS'
        ? { title: ui.replaceComponent, affected: [error.message], run: () => install(input, onLog, true) }
        : null,
    });
  }

  async function update(pkg: Package, archive?: File): Promise<boolean> {
    return withConfirm(pkg.ID, async confirm => {
      let result: { warnings?: string[] };
      if (archive) {
        const form = new FormData();
        form.append('archive', archive);
        form.append('confirm', String(confirm));
        result = await updatePackage(pkg.ID, form);
      } else {
        result = await updatePackage(pkg.ID, { confirm });
      }
      const after = (await listPackages()).find(item => item.ID === pkg.ID);
      toast.success(ui.packageUpdated.replace('{name}', packageName(pkg)).replace('{version}', after?.Version ?? ''));
      if (after) setChangelog({ id: after.ID, name: packageName(after), version: after.Version });
      if (result.warnings?.length) setWarnings(result.warnings);
    });
  }

  async function uninstall(pkg: Package, purge: 0 | 1 | 2): Promise<boolean> {
    return withConfirm(pkg.ID, async confirm => {
      await uninstallPackage(pkg.ID, purge, confirm);
      toast.success(ui.packageUninstalled.replace('{name}', packageName(pkg)));
    });
  }

  const dialogs = <>
    {confirmation && <ConfirmDialog open onOpenChange={open => { if (!open) { confirmation.settle(false); setConfirmation(null); } }} title={confirmation.title}
      description={ui.confirmAffectedDesc} confirmLabel={ui.confirmContinue}
      onConfirm={() => { const { run, settle } = confirmation; setConfirmation(null); void run().then(result => settle(result !== false), () => settle(false)); }}>
      <ul className={styles.affected}>{confirmation.affected.map(item => <li key={item}>{item}</li>)}</ul>
    </ConfirmDialog>}
    {warnings && <Dialog open onOpenChange={open => { if (!open) setWarnings(null); }} title={ui.warningsTitle} size="sm"
      footer={<Button variant="primary" onClick={() => setWarnings(null)}>{ui.done}</Button>}>
      <ul className={styles.affected}>{warnings.map(item => <li key={item}>{item}</li>)}</ul>
    </Dialog>}
    {changelog && <ChangelogDialog component={changelog.id} name={changelog.name} version={changelog.version} open automatic onClose={() => setChangelog(null)} />}
  </>;

  return { toggle, restart, reload, install: (input, onLog) => install(input, onLog), update, uninstall, busy, dialogs };
}
