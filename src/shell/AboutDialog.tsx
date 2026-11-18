import { useUI } from '../i18n/UI';
import React, { type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ExternalLink, X } from 'lucide-react';
import oflTxtUrl from '../assets/fonts/OFL.txt?no-inline';
import markSvg from '../assets/mark.svg?no-inline';

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
}

/**
 * 「关于」对话框组件。
 * 展示 AlonaBot 版本号、项目主页链接与开源许可说明。
 */
export function AboutDialog(props: AboutDialogProps): JSX.Element {
  const { open, onOpenChange, version } = props;
  const ui = useUI();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content about-dialog-content">
          <div className="about-dialog-header">
            <div className="about-brand-row">
              <img src={markSvg} alt="AlonaBot" width={40} height={40} className="about-brand-logo" />
              <div>
                <Dialog.Title className="about-app-title">AlonaBot</Dialog.Title>
                <Dialog.Description className="about-app-desc">
                  {ui.aboutDesc}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="dialog-close-button" aria-label={ui.close}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="about-info-grid">
            <div className="about-info-row">
              <span className="about-info-label">{ui.version}</span>
              <span className="about-info-value font-mono">{version}</span>
            </div>
            <div className="about-info-row">
              <span className="about-info-label">{ui.projectHome}</span>
              <a
                href="https://github.com/AlonaBot/AlonaBot"
                target="_blank"
                rel="noreferrer"
                className="about-info-link"
              >
                GitHub <ExternalLink size={12} />
              </a>
            </div>
            <div className="about-info-row">
              <span className="about-info-label">{ui.font}</span>
              <a href={oflTxtUrl} target="_blank" rel="noreferrer" className="about-info-link">
                JetBrains Mono (SIL OFL 1.1) <ExternalLink size={12} />
              </a>
            </div>
            <div className="about-info-row">
              <span className="about-info-label">{ui.license}</span>
              <span className="about-info-value">MIT License</span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
