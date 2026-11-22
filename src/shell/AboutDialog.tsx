import { useState, type JSX } from 'react';
import { ExternalLink } from 'lucide-react';
import oflTxtUrl from '../assets/fonts/OFL.txt?no-inline';
import markSvg from '../assets/mark.svg?no-inline';
import { ChangelogDialog } from '../components/ChangelogDialog';
import { useUI } from '../i18n/UI';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import styles from './AboutDialog.module.css';

/** 「关于」：版本、项目主页、字体与许可证，可打开 Core 的更新说明。 */
export function AboutDialog({ open, onOpenChange, version }: { open: boolean; onOpenChange: (open: boolean) => void; version: string }): JSX.Element {
  const ui = useUI();
  const [changelog, setChangelog] = useState(false);
  return <>
    <Dialog open={open} onOpenChange={onOpenChange} size="sm"
      title={<span className={styles.brand}><img src={markSvg} alt="" width={32} height={34} />AlonaBot</span>}
      description={ui.aboutDesc}
      footer={<Button onClick={() => setChangelog(true)}>{ui.viewChangelog}</Button>}>
      <dl className={styles.facts}>
        <dt>{ui.version}</dt><dd className={styles.mono}>{version}</dd>
        <dt>{ui.projectHome}</dt><dd><a href="https://github.com/AlonaBot/AlonaBot" target="_blank" rel="noreferrer">GitHub <ExternalLink size={12} /></a></dd>
        <dt>{ui.font}</dt><dd><a href={oflTxtUrl} target="_blank" rel="noreferrer">JetBrains Mono (SIL OFL 1.1) <ExternalLink size={12} /></a></dd>
        <dt>{ui.license}</dt><dd>MIT License</dd>
      </dl>
    </Dialog>
    <ChangelogDialog component="core" version={version} open={changelog} onClose={() => setChangelog(false)} />
  </>;
}
