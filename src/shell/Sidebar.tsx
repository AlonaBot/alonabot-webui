import React, { useState, type JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  LogOut,
  MoreHorizontal,
  Pencil,
  X,
} from 'lucide-react';
import markSvg from '../assets/mark.svg?no-inline';
import type { RouteEntry } from '../routes';
import { useUI } from '../i18n/UI';
import { AboutDialog } from './AboutDialog';
import { Link, usePath } from './router';
import { loadSidebar, saveSidebar, type SidebarState } from './sidebar';

interface SidebarProps {
  routes: RouteEntry[];
  version: string;
  onLogout?: () => void;
}

interface SortableNavItemProps {
  entry: RouteEntry;
  collapsed: boolean;
  isActive: boolean;
  onContextMenu: (e: React.MouseEvent, entryId: string) => void;
}

function SortableNavItem(props: SortableNavItemProps): JSX.Element {
  const { entry, collapsed, isActive, onContextMenu } = props;
  const ui = useUI();
  const label = (ui as Record<string, string>)[entry.label];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const IconComponent = entry.icon;

  const content = (
    <div
      ref={setNodeRef}
      style={style}
      className={`sidebar-nav-item ${isActive ? 'is-active' : ''} ${isDragging ? 'is-dragging' : ''}`}
      onContextMenu={e => onContextMenu(e, entry.id)}
    >
      <Link to={entry.path} className="sidebar-nav-link">
        <IconComponent className="sidebar-nav-icon" size={18} aria-hidden="true" />
        {!collapsed ? <span className="sidebar-nav-label">{label}</span> : null}
      </Link>
      {!collapsed ? (
        <button
          type="button"
          className="sidebar-drag-handle"
          aria-label={ui.reorderItem.replace('{label}', label)}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
      ) : null}
    </div>
  );

  if (collapsed) {
    return (
      <Tooltip.Root delayDuration={200}>
        <Tooltip.Trigger asChild>{content}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="sidebar-tooltip-content" side="right" sideOffset={12}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  }

  return content;
}

function SortableEditItem(props: {
  entry: RouteEntry;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
}): JSX.Element {
  const { entry, visible, onVisibleChange } = props;
  const ui = useUI();
  const label = (ui as Record<string, string>)[entry.label];
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: entry.id });
  const Icon = entry.icon;

  return (
    <div ref={setNodeRef} className="edit-sidebar-item" style={{ transform: CSS.Transform.toString(transform), transition }}>
      <label className="edit-sidebar-label">
        <input type="checkbox" checked={visible} onChange={event => onVisibleChange(event.target.checked)} />
        <Icon size={16} className="edit-sidebar-icon" />
        <span>{label}</span>
      </label>
      <button ref={setActivatorNodeRef} type="button" className="edit-sidebar-drag-handle" aria-label={ui.reorderItem.replace('{label}', label)} {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>
    </div>
  );
}

/**
 * 侧栏组件。
 * 包含 AlonaBot 品牌菜单、主体导航（支持 dnd-kit 拖动排序、右键隐藏与恢复）、底部设置与关于对话框。
 */
export function Sidebar(props: SidebarProps): JSX.Element {
  const { routes, version, onLogout } = props;
  const ui = useUI();
  const labels: Record<string, string> = ui;
  const currentPath = usePath();

  const mainRoutes = routes.filter(r => r.group === 'main');
  const bottomRoutes = routes.filter(r => r.group === 'bottom');
  const availableMainIds = mainRoutes.map(r => r.id);

  const [state, setState] = useState<SidebarState>(() => loadSidebar(availableMainIds));
  const [aboutOpen, setAboutOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // 右键上下文菜单状态
  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    targetId: string;
  } | null>(null);

  const updateState = (updater: (prev: SidebarState) => SidebarState) => {
    setState(prev => {
      const next = updater(prev);
      saveSidebar(next);
      return next;
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      updateState(prev => {
        const oldIndex = prev.order.indexOf(String(active.id));
        const newIndex = prev.order.indexOf(String(over.id));
        return {
          ...prev,
          order: arrayMove(prev.order, oldIndex, newIndex),
        };
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, entryId: string) => {
    e.preventDefault();
    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      targetId: entryId,
    });
  };

  const hideEntry = (id: string) => {
    updateState(prev => ({
      ...prev,
      hidden: prev.hidden.includes(id) ? prev.hidden : [...prev.hidden, id],
    }));
    setContextMenu(null);
  };

  const unhideEntry = (id: string) => {
    updateState(prev => ({
      ...prev,
      hidden: prev.hidden.filter(item => item !== id),
    }));
  };

  const toggleCollapsed = () => {
    updateState(prev => ({ ...prev, collapsed: !prev.collapsed }));
  };

  // 根据 state.order 排列 main routes，并过滤隐藏项
  const routeMap = new Map(mainRoutes.map(r => [r.id, r]));
  const sortedMainRoutes = state.order
    .map(id => routeMap.get(id))
    .filter((r): r is RouteEntry => r !== undefined);

  const visibleMainRoutes = sortedMainRoutes.filter(r => !state.hidden.includes(r.id));
  const hiddenMainRoutes = sortedMainRoutes.filter(r => state.hidden.includes(r.id));

  return (
    <Tooltip.Provider>
      <aside className={`shell-sidebar ${state.collapsed ? 'is-collapsed' : ''}`}>
        {/* 折叠/展开侧栏把手 */}
        <button
          type="button"
          className="sidebar-collapse-handle"
          onClick={toggleCollapsed}
          aria-label={state.collapsed ? ui.expandSidebar : ui.collapseSidebar}
        >
          {state.collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* 顶部 Logo 与下拉菜单 */}
        <div className="sidebar-header">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="sidebar-brand-button"
                aria-label={ui.brandMenu}
              >
                <img src={markSvg} alt="AlonaBot" width={32} height={32} className="sidebar-brand-mark" />
                {!state.collapsed ? (
                  <>
                    <span className="sidebar-brand-text">AlonaBot</span>
                    <ChevronDown size={14} className="sidebar-brand-chevron" />
                  </>
                ) : null}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="dropdown-menu-content" side="bottom" align="start">
                <DropdownMenu.Item
                  className="dropdown-menu-item"
                  onSelect={() => setEditDialogOpen(true)}
                >
                  <Pencil size={15} />
                  <span>{ui.editSidebar}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="dropdown-menu-item"
                  onSelect={toggleCollapsed}
                >
                  {state.collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
                  <span>{state.collapsed ? ui.expandSidebar : ui.collapseSidebar}</span>
                </DropdownMenu.Item>
                {onLogout ? (
                  <>
                    <DropdownMenu.Separator className="dropdown-menu-separator" />
                    <DropdownMenu.Item
                      className="dropdown-menu-item is-danger"
                      onSelect={onLogout}
                    >
                      <LogOut size={15} />
                      <span>{ui.logout}</span>
                    </DropdownMenu.Item>
                  </>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        {/* 主导航条目（支持拖拽排序） */}
        <nav className="sidebar-nav-section" aria-label={ui.mainNavigation}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleMainRoutes.map(r => r.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="sidebar-nav-list">
                {visibleMainRoutes.map(entry => (
                  <SortableNavItem
                    key={entry.id}
                    entry={entry}
                    collapsed={state.collapsed}
                    isActive={currentPath === entry.path}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* 隐藏入口收进底部的「更多」 */}
          {hiddenMainRoutes.length > 0 ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="sidebar-nav-item sidebar-more-button"
                  aria-label={ui.hiddenNavigation}
                >
                  <div className="sidebar-nav-link">
                    <MoreHorizontal className="sidebar-nav-icon" size={18} />
                    {!state.collapsed ? <span className="sidebar-nav-label">{ui.sidebarMore}</span> : null}
                  </div>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="dropdown-menu-content" side="right" align="start">
                  <div className="dropdown-section-title">{ui.sidebarHiddenTitle}</div>
                  {hiddenMainRoutes.map(item => {
                    const ItemIcon = item.icon;
                    return (
                      <div key={item.id} className="dropdown-more-row">
                        <Link to={item.path} className="dropdown-more-link">
                          <ItemIcon size={16} />
                          <span>{labels[item.label]}</span>
                        </Link>
                        <button
                          type="button"
                          className="dropdown-restore-button"
                          title={ui.restoreToSidebar}
                          onClick={() => unhideEntry(item.id)}
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    );
                  })}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : null}
        </nav>

        {/* 底部系统设置与版本信息 */}
        <div className="sidebar-footer">
          {bottomRoutes.map(entry => {
            const BottomIcon = entry.icon;
            const itemContent = (
              <div
                key={entry.id}
                className={`sidebar-nav-item ${currentPath === entry.path ? 'is-active' : ''}`}
              >
                <Link to={entry.path} className="sidebar-nav-link">
                  <BottomIcon className="sidebar-nav-icon" size={18} aria-hidden="true" />
                  {!state.collapsed ? <span className="sidebar-nav-label">{labels[entry.label]}</span> : null}
                </Link>
              </div>
            );

            if (state.collapsed) {
              return (
                <Tooltip.Root key={entry.id} delayDuration={200}>
                  <Tooltip.Trigger asChild>{itemContent}</Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="sidebar-tooltip-content" side="right" sideOffset={12}>
                      {labels[entry.label]}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              );
            }
            return itemContent;
          })}

          <button
            type="button"
            className="sidebar-version-button font-mono"
            onClick={() => setAboutOpen(true)}
            aria-label={ui.about}
          >
            {version}
          </button>
        </div>

        {/* 右键菜单弹层 */}
        {contextMenu ? (
          <div
            className="sidebar-context-overlay"
            onClick={() => setContextMenu(null)}
            onContextMenu={e => {
              e.preventDefault();
              setContextMenu(null);
            }}
          >
            <div
              className="dropdown-menu-content sidebar-context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={e => e.stopPropagation()}
            >
              <div
                className="dropdown-menu-item"
                onClick={() => hideEntry(contextMenu.targetId)}
              >
                <EyeOff size={15} />
                <span>{ui.hideFromSidebar}</span>
              </div>
              <div
                className="dropdown-menu-item"
                onClick={() => {
                  setContextMenu(null);
                  setEditDialogOpen(true);
                }}
              >
                <Pencil size={15} />
                <span>{ui.editSidebar}</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* 「编辑侧栏」对话框 */}
        <Dialog.Root open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content edit-sidebar-dialog">
              <div className="dialog-header">
                <Dialog.Title className="dialog-title">{ui.editSidebarTitle}</Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="dialog-close-button" aria-label={ui.close}>
                    <X size={16} />
                  </button>
                </Dialog.Close>
              </div>
              <p className="dialog-subtitle">{ui.editSidebarDesc}</p>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortedMainRoutes.map(r => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="edit-sidebar-list">
                    {sortedMainRoutes.map(item => (
                      <SortableEditItem key={item.id} entry={item} visible={!state.hidden.includes(item.id)}
                        onVisibleChange={visible => visible ? unhideEntry(item.id) : hideEntry(item.id)} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <div className="dialog-actions">
                <button
                  type="button"
                  className="dialog-button is-primary"
                  onClick={() => setEditDialogOpen(false)}
                >
                  {ui.done}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* 「关于」对话框 */}
        <AboutDialog
          open={aboutOpen}
          onOpenChange={setAboutOpen}
          version={version}
        />
      </aside>
    </Tooltip.Provider>
  );
}
