import { useEffect, useMemo, useState, type JSX, type MouseEvent as ReactMouseEvent } from 'react';
import {
  closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, useReducedMotion } from 'motion/react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown, ChevronLeft, ChevronRight, EyeOff, GripVertical, LogOut, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { cn } from '../lib/cn';
import { BrandMark } from '../ui/BrandMark';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Dialog } from '../ui/Dialog';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { AboutDialog } from './AboutDialog';
import { CoreStatusPill } from './CoreStatusPill';
import { Link } from './router';
import {
  arrangeSidebar,
  loadSidebar,
  moveSidebarItem,
  saveSidebar,
  type SidebarState,
} from './sidebarState';

/** 侧栏条目：内置页面或插件页面。disabledReason 非空时置灰不可进入。 */
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
 * 桌面侧栏：品牌菜单、平等自由排序与可隐藏的导航、motion layoutId 磁吸指示条，
 * 以及底部系统设置与 Core 活体状态胶囊。
 */
export function Sidebar({
  entries,
  bottom,
  version,
  coreStartedAt,
  coreUpdate,
  coreUpdateFailed,
  onLogout,
}: {
  entries: readonly NavEntry[];
  bottom: readonly NavEntry[];
  version: string;
  coreStartedAt?: string;
  coreUpdate?: { version: string; releaseURL: string };
  coreUpdateFailed?: boolean;
  onLogout?: () => void;
}): JSX.Element {
  const ui = useUI();
  const [state, setState] = useState<SidebarState>(loadSidebar);
  const [editing, setEditing] = useState(false);
  const [about, setAbout] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  const update = (next: (previous: SidebarState) => SidebarState): void =>
    setState(previous => {
      const value = next(previous);
      saveSidebar(value);
      return value;
    });
  const toggle = (): void => update(previous => ({ ...previous, collapsed: !previous.collapsed }));
  const setHidden = (id: string, hidden: boolean): void =>
    update(previous => ({
      ...previous,
      hidden: hidden ? [...new Set([...previous.hidden, id])] : previous.hidden.filter(item => item !== id),
    }));

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const byID = useMemo(() => new Map(entries.map(entry => [entry.id, entry])), [entries]);
  const available = useMemo(() => entries.map(entry => entry.id), [entries]);
  const { visible, hidden } = arrangeSidebar(state, available);
  const collapsed = state.collapsed;

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        'alona-glass sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-y-0 border-l-0 transition-[width] duration-200 ease-[var(--ease-out)] md:flex',
        collapsed ? 'w-[74px]' : 'w-[252px]',
      )}
    >
      <Tooltip content={`${collapsed ? ui.expandSidebar : ui.collapseSidebar} (${collapseShortcut})`} side="right">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? ui.expandSidebar : ui.collapseSidebar}
          className="absolute top-6 -right-3 z-40 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] shadow-sm transition-all hover:scale-105 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </Tooltip>

      <div className={cn('flex items-center px-3.5 pt-4 pb-3', collapsed && 'justify-center px-2')}>
        <Menu
          trigger={
            <button
              type="button"
              aria-label={ui.brandMenu}
              className={cn(
                'group flex w-full items-center gap-2.5 rounded-[14px] p-1.5 text-left transition-colors hover:bg-[var(--color-surface-2)]/80',
                collapsed && 'w-auto justify-center',
              )}
            >
              <BrandMark size={34} badge />
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold tracking-tight text-[var(--color-ink)]">AlonaBot</div>
                  </div>
                  <ChevronDown size={15} className="shrink-0 text-[var(--color-ink-muted)] transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
                </>
              )}
            </button>
          }
        >
          <MenuItem icon={<Pencil size={15} />} onSelect={() => setEditing(true)}>
            {ui.editSidebar}
          </MenuItem>
          <MenuItem icon={collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />} shortcut={collapseShortcut} onSelect={toggle}>
            {collapsed ? ui.expandSidebar : ui.collapseSidebar}
          </MenuItem>
          {onLogout && (
            <>
              <MenuSeparator />
              <MenuItem icon={<LogOut size={15} />} tone="danger" onSelect={onLogout}>
                {ui.logout}
              </MenuItem>
            </>
          )}
        </Menu>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-1" aria-label={ui.mainNavigation}>
        <DraggableList
          ids={visible}
          byID={byID}
          collapsed={collapsed}
          onMove={(active, over) => update(previous => moveSidebarItem(previous, available, active, over))}
          onContextMenu={(event, id) => {
            event.preventDefault();
            setContextMenu({ x: event.clientX, y: event.clientY, id });
          }}
        />
        {hidden.length > 0 && (
          <div className="mt-2 border-t border-[var(--color-line)]/60 pt-2">
            <Menu
              side="right"
              trigger={
                <button
                  type="button"
                  aria-label={ui.hiddenNavigation}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  <MoreHorizontal size={18} aria-hidden="true" />
                  {!collapsed && <span>{ui.sidebarMore}</span>}
                </button>
              }
            >
              <MenuLabel>{ui.sidebarHiddenTitle}</MenuLabel>
              {hidden.map(id => {
                const entry = byID.get(id);
                if (!entry) return null;
                const Icon = entry.icon;
                return (
                  <MenuItem key={id} icon={<Icon size={15} />} onSelect={() => setHidden(id, false)} shortcut={ui.restoreToSidebar}>
                    {entry.label}
                  </MenuItem>
                );
              })}
            </Menu>
          </div>
        )}
      </nav>

      <div className="border-t border-[var(--color-line)]/70 px-2.5 py-3">
        <div className="flex flex-col gap-1">
          {bottom.map(entry => (
            <NavLink key={entry.id} entry={entry} collapsed={collapsed} />
          ))}
        </div>
        <CoreStatusPill
          version={version}
          startedAt={coreStartedAt}
          collapsed={collapsed}
          coreUpdate={coreUpdate}
          coreUpdateFailed={coreUpdateFailed}
          onOpenAbout={() => setAbout(true)}
        />
      </div>

      {contextMenu && (
        <Menu
          open
          onOpenChange={open => { if (!open) setContextMenu(null); }}
          trigger={<span className="fixed h-0 w-0" style={{ left: contextMenu.x, top: contextMenu.y }} />}
        >
          <MenuItem icon={<EyeOff size={15} />} onSelect={() => setHidden(contextMenu.id, true)}>
            {ui.hideFromSidebar}
          </MenuItem>
          <MenuItem icon={<Pencil size={15} />} onSelect={() => setEditing(true)}>
            {ui.editSidebar}
          </MenuItem>
        </Menu>
      )}

      <EditSidebarDialog
        open={editing}
        onOpenChange={setEditing}
        ids={[...visible, ...hidden]}
        hidden={hidden}
        byID={byID}
        onMove={(active, over) => update(previous => moveSidebarItem(previous, available, active, over))}
        onVisibleChange={(id, value) => setHidden(id, !value)}
      />
      <AboutDialog open={about} onOpenChange={setAbout} version={version} />
    </aside>
  );
}

function NavLink({
  entry,
  collapsed,
  dragHandle,
}: {
  entry: NavEntry;
  collapsed: boolean;
  dragHandle?: JSX.Element;
}): JSX.Element {
  const Icon = entry.icon;
  const reduced = useReducedMotion();
  const disabled = entry.disabledReason !== undefined;
  const link = (
    <Link
      to={entry.to}
      aria-label={entry.label}
      aria-current={entry.active ? 'page' : undefined}
      data-disabled={disabled}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors duration-150',
        collapsed && 'justify-center px-0',
        disabled
          ? 'pointer-events-none opacity-40'
          : entry.active
            ? 'text-[var(--color-accent-strong)]'
            : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)]/75 hover:text-[var(--color-ink)]',
      )}
    >
      {entry.active && (
        <motion.span
          layoutId="sidebar-active-pill"
          transition={reduced ? { duration: 0.01 } : { type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-xl border border-[color-mix(in_srgb,var(--color-accent)_32%,var(--color-line))] bg-[var(--color-surface)] shadow-[var(--shadow-card)]"
          aria-hidden="true"
        />
      )}
      {entry.active && (
        <motion.span
          layoutId="sidebar-active-bar"
          transition={reduced ? { duration: 0.01 } : { type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[var(--color-accent)]"
          aria-hidden="true"
        />
      )}
      <Icon
        size={18}
        className={cn('relative z-10 shrink-0 transition-transform duration-150 group-hover:scale-105', entry.active && 'text-[var(--color-accent)]')}
        aria-hidden="true"
      />
      {!collapsed && <span className="relative z-10 min-w-0 flex-1 truncate">{entry.label}</span>}
      {dragHandle}
    </Link>
  );
  const tip = entry.disabledReason ?? (collapsed ? entry.label : undefined);
  return tip ? <Tooltip content={tip} side="right">{link}</Tooltip> : link;
}

function DraggableList({
  ids,
  byID,
  collapsed,
  onMove,
  onContextMenu,
}: {
  ids: readonly string[];
  byID: ReadonlyMap<string, NavEntry>;
  collapsed: boolean;
  onMove: (active: string, over: string) => void;
  onContextMenu: (event: ReactMouseEvent, id: string) => void;
}): JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const [active, setActive] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const reset = (): void => {
    setActive(null);
    setOver(null);
  };
  const activeEntry = active ? byID.get(active) : undefined;
  const after = active && over ? ids.indexOf(active) < ids.indexOf(over) : false;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event: DragStartEvent) => setActive(String(event.active.id))}
      onDragOver={(event: DragOverEvent) => setOver(event.over ? String(event.over.id) : null)}
      onDragEnd={(event: DragEndEvent) => {
        if (event.over) onMove(String(event.active.id), String(event.over.id));
        reset();
      }}
      onDragCancel={reset}
    >
      <div className="flex flex-col gap-0.5">
        {ids.map(id => {
          const entry = byID.get(id);
          if (!entry) return null;
          return (
            <DraggableItem
              key={id}
              entry={entry}
              collapsed={collapsed}
              dragging={active === id}
              insert={over === id && active !== id ? (after ? 'after' : 'before') : undefined}
              onContextMenu={event => onContextMenu(event, id)}
            />
          );
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }}>
        {activeEntry && (
          <div className="alona-glass-elevated flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-[var(--color-ink)]">
            <GripVertical size={14} className="text-[var(--color-ink-muted)]" aria-hidden="true" />
            <activeEntry.icon size={17} className="text-[var(--color-accent)]" aria-hidden="true" />
            <span>{activeEntry.label}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function DraggableItem({
  entry,
  collapsed,
  dragging,
  insert,
  onContextMenu,
}: {
  entry: NavEntry;
  collapsed: boolean;
  dragging: boolean;
  insert?: 'before' | 'after';
  onContextMenu: (event: ReactMouseEvent) => void;
}): JSX.Element {
  const ui = useUI();
  const drag = useDraggable({ id: entry.id, disabled: collapsed });
  const drop = useDroppable({ id: entry.id });
  const handle = collapsed ? undefined : (
    <span
      ref={drag.setActivatorNodeRef}
      aria-label={ui.reorderItem.replace('{label}', entry.label)}
      {...drag.attributes}
      {...drag.listeners}
      onClick={event => event.preventDefault()}
      className="relative z-10 inline-flex shrink-0 cursor-grab text-[var(--color-ink-muted)] opacity-0 transition-opacity group-hover:opacity-70 hover:opacity-100"
    >
      <GripVertical size={13} />
    </span>
  );

  return (
    <div
      ref={node => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      data-dragging={dragging || undefined}
      data-insert={insert}
      onContextMenu={onContextMenu}
      className={cn(
        'relative rounded-xl',
        dragging && 'opacity-35',
        insert === 'before' && 'before:absolute before:inset-x-2 before:-top-0.5 before:h-0.5 before:rounded-full before:bg-[var(--color-accent)]',
        insert === 'after' && 'after:absolute after:inset-x-2 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-[var(--color-accent)]',
      )}
    >
      <NavLink entry={entry} collapsed={collapsed} dragHandle={handle} />
    </div>
  );
}

function EditSidebarDialog({
  open,
  onOpenChange,
  ids,
  hidden,
  byID,
  onMove,
  onVisibleChange,
}: {
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
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={ui.editSidebarTitle}
      description={ui.editSidebarDesc}
      size="sm"
      footer={
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          {ui.done}
        </Button>
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={event => {
          if (event.over && event.active.id !== event.over.id) {
            onMove(String(event.active.id), String(event.over.id));
          }
        }}
      >
        <SortableContext items={[...ids]} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5 py-1">
            {ids.map(id => {
              const entry = byID.get(id);
              if (!entry) return null;
              return (
                <EditRow
                  key={id}
                  entry={entry}
                  visible={!hidden.includes(id)}
                  onVisibleChange={value => onVisibleChange(id, value)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </Dialog>
  );
}

function EditRow({
  entry,
  visible,
  onVisibleChange,
}: {
  entry: NavEntry;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
}): JSX.Element {
  const ui = useUI();
  const sortable = useSortable({ id: entry.id });
  const Icon = entry.icon;
  return (
    <div
      ref={sortable.setNodeRef}
      data-dragging={sortable.isDragging || undefined}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className="flex items-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm"
    >
      <Checkbox checked={visible} onCheckedChange={onVisibleChange} aria-label={entry.label} />
      <Icon size={16} aria-hidden="true" className="shrink-0 text-[var(--color-ink-muted)]" />
      <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">{entry.label}</span>
      {!visible && <EyeOff size={14} aria-hidden="true" className="text-[var(--color-ink-muted)]" />}
      <button
        type="button"
        ref={sortable.setActivatorNodeRef}
        aria-label={ui.reorderItem.replace('{label}', entry.label)}
        className="cursor-grab text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
        {...sortable.attributes}
        {...sortable.listeners}
      >
        <GripVertical size={15} />
      </button>
    </div>
  );
}
