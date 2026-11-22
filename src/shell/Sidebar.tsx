import { useEffect, useMemo, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react';
import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpCircle, ChevronDown, ChevronLeft, ChevronRight, EyeOff, GripVertical, LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil } from 'lucide-react';
import markSvg from '../assets/mark.svg?no-inline';
import { useUI } from '../i18n/UI';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Dialog } from '../ui/Dialog';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { AboutDialog } from './AboutDialog';
import { Link } from './router';
import { arrangeSidebar, loadSidebar, moveSidebarItem, saveSidebar, type SidebarState } from './sidebarState';
import styles from './Sidebar.module.css';

/** 侧栏条目：内置页面或插件页面。disabledReason 非空时条目置灰、不可进入。 */
export type NavEntry = {
  id: string;
  label: string;
  icon: LucideIcon;
  to: string;
  active: boolean;
  disabledReason?: string;
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const collapseShortcut = isMac ? '⌘\\' : 'Ctrl+\\';

/**
 * 桌面侧栏：品牌菜单、可拖动排序与隐藏的导航、底部设置与版本。
 * 收起状态、顺序与隐藏项保存在浏览器里；⌘\ / Ctrl+\ 切换收起。
 */
export function Sidebar({ entries, bottom, version, coreUpdate, coreUpdateFailed, onLogout }: {
  entries: readonly NavEntry[];
  bottom: readonly NavEntry[];
  version: string;
  coreUpdate?: { version: string; releaseURL: string };
  coreUpdateFailed?: boolean;
  onLogout?: () => void;
}): JSX.Element {
  const ui = useUI();
  const [state, setState] = useState<SidebarState>(loadSidebar);
  const [editing, setEditing] = useState(false);
  const [about, setAbout] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  const update = (next: (previous: SidebarState) => SidebarState) => setState(previous => {
    const value = next(previous);
    saveSidebar(value);
    return value;
  });
  const toggle = () => update(previous => ({ ...previous, collapsed: !previous.collapsed }));
  const setHidden = (id: string, hidden: boolean) => update(previous => ({
    ...previous,
    hidden: hidden ? [...new Set([...previous.hidden, id])] : previous.hidden.filter(item => item !== id),
  }));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') { event.preventDefault(); toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const byID = useMemo(() => new Map(entries.map(entry => [entry.id, entry])), [entries]);
  const available = useMemo(() => entries.map(entry => entry.id), [entries]);
  const { visible, hidden } = arrangeSidebar(state, available);
  const collapsed = state.collapsed;

  return <aside className={styles.sidebar} data-collapsed={collapsed || undefined}>
    <Tooltip content={`${collapsed ? ui.expandSidebar : ui.collapseSidebar} (${collapseShortcut})`} side="right">
      <button type="button" className={styles.handle} onClick={toggle} aria-label={collapsed ? ui.expandSidebar : ui.collapseSidebar}>
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </Tooltip>

    <Menu trigger={<button type="button" className={styles.brand} aria-label={ui.brandMenu}>
      <img src={markSvg} alt="" width={30} height={32} />
      <span className={styles.brandText}>AlonaBot</span>
      <ChevronDown size={15} className={styles.brandChevron} aria-hidden />
    </button>}>
      <MenuItem icon={<Pencil size={16} />} onSelect={() => setEditing(true)}>{ui.editSidebar}</MenuItem>
      <MenuItem icon={collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />} shortcut={collapseShortcut} onSelect={toggle}>{collapsed ? ui.expandSidebar : ui.collapseSidebar}</MenuItem>
      {onLogout && <><MenuSeparator /><MenuItem icon={<LogOut size={16} />} onSelect={onLogout}>{ui.logout}</MenuItem></>}
    </Menu>

    <nav className={styles.nav} aria-label={ui.mainNavigation}>
      <DraggableList ids={visible} byID={byID} collapsed={collapsed}
        onMove={(active, over) => update(previous => moveSidebarItem(previous, available, active, over))}
        onContextMenu={(event, id) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, id }); }} />
      {hidden.length > 0 && <Menu side="right" trigger={<button type="button" className={styles.item} aria-label={ui.hiddenNavigation}>
        <MoreHorizontal size={20} className={styles.icon} aria-hidden /><span className={styles.label}>{ui.sidebarMore}</span>
      </button>}>
        <MenuLabel>{ui.sidebarHiddenTitle}</MenuLabel>
        {hidden.map(id => {
          const entry = byID.get(id)!;
          const Icon = entry.icon;
          return <MenuItem key={id} icon={<Icon size={16} />} onSelect={() => setHidden(id, false)} shortcut={ui.restoreToSidebar}>{entry.label}</MenuItem>;
        })}
      </Menu>}
    </nav>

    <div className={styles.footer}>
      {bottom.map(entry => <NavLink key={entry.id} entry={entry} collapsed={collapsed} />)}
      <div className={styles.version}>
        <button type="button" onClick={() => setAbout(true)} aria-label={ui.about}>v{version.replace(/^v/, '')}</button>
        {coreUpdate && <Tooltip content={`${ui.newVersionAvailable}: ${coreUpdate.version}`} side="right">
          <a href={coreUpdate.releaseURL} target="_blank" rel="noreferrer" className={styles.update} aria-label={`${ui.newVersionAvailable}: ${coreUpdate.version}`}>
            <ArrowUpCircle size={14} /><span className={styles.label}>{coreUpdate.version}</span>
          </a>
        </Tooltip>}
        {coreUpdateFailed && <Tooltip content={ui.updateCheckFailed} side="right"><span className={styles.updateFailed} role="status" aria-label={ui.updateCheckFailed}><ArrowUpCircle size={14} /></span></Tooltip>}
      </div>
    </div>

    {contextMenu && <Menu open onOpenChange={open => { if (!open) setContextMenu(null); }}
      trigger={<span className={styles.contextAnchor} style={{ left: contextMenu.x, top: contextMenu.y }} />}>
      <MenuItem icon={<EyeOff size={16} />} onSelect={() => setHidden(contextMenu.id, true)}>{ui.hideFromSidebar}</MenuItem>
      <MenuItem icon={<Pencil size={16} />} onSelect={() => setEditing(true)}>{ui.editSidebar}</MenuItem>
    </Menu>}

    <EditSidebarDialog open={editing} onOpenChange={setEditing} ids={[...visible, ...hidden]} hidden={hidden} byID={byID}
      onMove={(active, over) => update(previous => moveSidebarItem(previous, available, active, over))}
      onVisibleChange={(id, value) => setHidden(id, !value)} />
    <AboutDialog open={about} onOpenChange={setAbout} version={version} />
  </aside>;
}

function NavLink({ entry, collapsed, dragHandle }: { entry: NavEntry; collapsed: boolean; dragHandle?: JSX.Element }): JSX.Element {
  const Icon = entry.icon;
  const link = <Link to={entry.to} className={styles.item} aria-label={entry.label} aria-current={entry.active ? 'page' : undefined} data-disabled={entry.disabledReason !== undefined}>
    <Icon size={20} className={styles.icon} aria-hidden />
    <span className={styles.label}>{entry.label}</span>
    {dragHandle}
  </Link>;
  const tip = entry.disabledReason ?? (collapsed ? entry.label : undefined);
  return tip ? <Tooltip content={tip} side="right">{link}</Tooltip> : link;
}

/** 可拖动排序的导航：原位置不移动，拖动时浮起一张卡片，并在目标位置画插入线。 */
function DraggableList({ ids, byID, collapsed, onMove, onContextMenu }: {
  ids: readonly string[];
  byID: ReadonlyMap<string, NavEntry>;
  collapsed: boolean;
  onMove: (active: string, over: string) => void;
  onContextMenu: (event: ReactMouseEvent, id: string) => void;
}): JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const [active, setActive] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const reset = () => { setActive(null); setOver(null); };
  const activeEntry = active ? byID.get(active) : undefined;
  const after = active && over ? ids.indexOf(active) < ids.indexOf(over) : false;

  return <DndContext sensors={sensors} collisionDetection={closestCenter}
    onDragStart={(event: DragStartEvent) => setActive(String(event.active.id))}
    onDragOver={(event: DragOverEvent) => setOver(event.over ? String(event.over.id) : null)}
    onDragEnd={(event: DragEndEvent) => { if (event.over) onMove(String(event.active.id), String(event.over.id)); reset(); }}
    onDragCancel={reset}>
    <div className={styles.list}>
      {ids.map(id => <DraggableItem key={id} entry={byID.get(id)!} collapsed={collapsed} dragging={active === id}
        insert={over === id && active !== id ? (after ? 'after' : 'before') : undefined} onContextMenu={event => onContextMenu(event, id)} />)}
    </div>
    <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
      {activeEntry && <div className={styles.overlay}><GripVertical size={14} aria-hidden /><activeEntry.icon size={18} aria-hidden /><span>{activeEntry.label}</span></div>}
    </DragOverlay>
  </DndContext>;
}

function DraggableItem({ entry, collapsed, dragging, insert, onContextMenu }: {
  entry: NavEntry;
  collapsed: boolean;
  dragging: boolean;
  insert?: 'before' | 'after';
  onContextMenu: (event: ReactMouseEvent) => void;
}): JSX.Element {
  const ui = useUI();
  const drag = useDraggable({ id: entry.id, disabled: collapsed });
  const drop = useDroppable({ id: entry.id });
  const handle = collapsed ? undefined : <span ref={drag.setActivatorNodeRef} className={styles.grip} aria-label={ui.reorderItem.replace('{label}', entry.label)}
    {...drag.attributes} {...drag.listeners} onClick={event => event.preventDefault()}><GripVertical size={14} /></span>;
  return <div ref={node => { drag.setNodeRef(node); drop.setNodeRef(node); }} className={styles.slot} data-dragging={dragging || undefined} data-insert={insert} onContextMenu={onContextMenu}>
    <NavLink entry={entry} collapsed={collapsed} dragHandle={handle} />
  </div>;
}

function EditSidebarDialog({ open, onOpenChange, ids, hidden, byID, onMove, onVisibleChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: readonly string[];
  hidden: readonly string[];
  byID: ReadonlyMap<string, NavEntry>;
  onMove: (active: string, over: string) => void;
  onVisibleChange: (id: string, visible: boolean) => void;
}): JSX.Element {
  const ui = useUI();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  return <Dialog open={open} onOpenChange={onOpenChange} title={ui.editSidebarTitle} description={ui.editSidebarDesc} size="sm"
    footer={<Button variant="primary" onClick={() => onOpenChange(false)}>{ui.done}</Button>}>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={event => { if (event.over && event.active.id !== event.over.id) onMove(String(event.active.id), String(event.over.id)); }}>
      <SortableContext items={[...ids]} strategy={verticalListSortingStrategy}>
        <div className={styles.editList}>
          {ids.map(id => <EditRow key={id} entry={byID.get(id)!} visible={!hidden.includes(id)} onVisibleChange={value => onVisibleChange(id, value)} />)}
        </div>
      </SortableContext>
    </DndContext>
  </Dialog>;
}

function EditRow({ entry, visible, onVisibleChange }: { entry: NavEntry; visible: boolean; onVisibleChange: (visible: boolean) => void }): JSX.Element {
  const ui = useUI();
  const sortable = useSortable({ id: entry.id });
  const Icon = entry.icon;
  return <div ref={sortable.setNodeRef} className={styles.editRow} data-dragging={sortable.isDragging || undefined}
    style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}>
    <Checkbox checked={visible} onCheckedChange={onVisibleChange} aria-label={entry.label} />
    <Icon size={18} aria-hidden className={styles.icon} />
    <span className={styles.editLabel}>{entry.label}</span>
    {visible ? null : <EyeOff size={14} aria-hidden className={styles.icon} />}
    <button type="button" ref={sortable.setActivatorNodeRef} className={styles.editGrip} aria-label={ui.reorderItem.replace('{label}', entry.label)} {...sortable.attributes} {...sortable.listeners}><GripVertical size={16} /></button>
  </div>;
}

