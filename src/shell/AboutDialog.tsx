import { useState, type JSX } from 'react';
import { ExternalLink } from 'lucide-react';
import oflTxtUrl from '../assets/fonts/OFL.txt?no-inline';
import { ChangelogDialog } from '../components/ChangelogDialog';
import { useUI } from '../i18n/UI';
import { BrandMark } from '../ui/BrandMark';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

/** 「关于」对话框：精修品牌徽章、版本、主页、字体许可与 Core 更新说明入口。 */
export function AboutDialog({
  open,
  onOpenChange,
  version,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
}): JSX.Element {
  const ui = useUI();
  const [changelog, setChangelog] = useState(false);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        size="sm"
        title={
          <span className="inline-flex items-center gap-2.5">
            <BrandMark size={32} badge />
            <span>AlonaBot</span>
          </span>
        }
        description={ui.aboutDesc}
        footer={<Button variant="soft" onClick={() => setChangelog(true)}>{ui.viewChangelog}</Button>}
      >
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/60 p-4 text-sm">
          <dt className="text-[var(--color-ink-muted)]">{ui.version}</dt>
          <dd className="font-mono font-medium text-[var(--color-ink)]">{version}</dd>
          <dt className="text-[var(--color-ink-muted)]">{ui.projectHome}</dt>
          <dd>
            <a
              href="https://github.com/AlonaBot/AlonaBot"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
            >
              GitHub <ExternalLink size={12} />
            </a>
          </dd>
          <dt className="text-[var(--color-ink-muted)]">{ui.font}</dt>
          <dd>
            <a
              href={oflTxtUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:underline"
            >
              JetBrains Mono (SIL OFL 1.1) <ExternalLink size={12} />
            </a>
          </dd>
          <dt className="text-[var(--color-ink-muted)]">{ui.license}</dt>
          <dd className="text-[var(--color-ink)]">MIT License</dd>
        </dl>
      </Dialog>
      <ChangelogDialog component="core" version={version} open={changelog} onClose={() => setChangelog(false)} />
    </>
  );
}
