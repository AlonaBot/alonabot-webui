import React, { useEffect, useId, useRef, useState, type JSX } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { useUI } from '../i18n/UI';
import { filterSearch, type SearchItem } from './search';

interface GlobalSearchProps {
  items: SearchItem[];
  placeholder?: string;
  emptyText?: string;
  selectHint?: string;
  openHint?: string;
  openRequest?: number;
}

/**
 * 顶栏全局搜索组件。
 * 平时收拢为图标按钮，悬停或聚焦时向左平滑展开，支持 ⌘K/Ctrl+K 全局快捷键。
 */
export function GlobalSearch(props: GlobalSearchProps): JSX.Element {
  const ui = useUI();
  const {
    items,
    placeholder = ui.searchPlaceholder,
    emptyText = ui.searchEmpty,
    selectHint = ui.searchSelect,
    openHint = ui.searchOpen,
  } = props;

  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const isMac = typeof navigator !== 'undefined' && /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent);
  const shortcutLabel = isMac ? '⌘K' : 'Ctrl+K';

  const isExpanded = isHovered || isFocused || query.length > 0;
  const filteredResults = isExpanded && query.trim() ? filterSearch(items, query) : [];

  // 快捷键 ⌘K / Ctrl+K 与 Escape 处理
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isCmdK) {
        event.preventDefault();
        inputRef.current?.focus();
        setIsFocused(true);
      } else if (event.key === 'Escape' && isFocused) {
        event.preventDefault();
        setQuery('');
        inputRef.current?.blur();
        setIsFocused(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFocused]);

  // 外部请求打开搜索
  useEffect(() => {
    if (props.openRequest !== undefined && props.openRequest > 0) {
      inputRef.current?.focus();
      setIsFocused(true);
    }
  }, [props.openRequest]);

  // 点击外部收起
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
        if (!query.trim()) {
          setQuery('');
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [query]);

  // 重置键盘高亮项索引
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelectResult = (item: SearchItem) => {
    item.run();
    setQuery('');
    setIsFocused(false);
    setIsHovered(false);
    inputRef.current?.blur();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (filteredResults.length === 0) {
      if (event.key === 'Escape') {
        inputRef.current?.blur();
        setIsFocused(false);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredResults.length) % filteredResults.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const current = filteredResults[selectedIndex];
      if (current) {
        handleSelectResult(current);
      }
    }
  };

  // 按分组渲染结果
  const groupedSections: { section: string; items: { item: SearchItem; globalIndex: number }[] }[] = [];
  let currentIndex = 0;
  for (const item of filteredResults) {
    let group = groupedSections.find(g => g.section === item.section);
    if (!group) {
      group = { section: item.section, items: [] };
      groupedSections.push(group);
    }
    group.items.push({ item, globalIndex: currentIndex });
    currentIndex += 1;
  }

  const showDropdown = isFocused && query.trim().length > 0;

  return (
    <div
      ref={containerRef}
      className={`global-search-container ${isExpanded ? 'is-expanded' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="search"
    >
      <div className="search-input-shell" onClick={() => inputRef.current?.focus()}>
        <Search className="search-icon" size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          value={query}
          placeholder={isExpanded ? placeholder : ''}
          aria-label={placeholder}
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          onFocus={() => setIsFocused(true)}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleInputKeyDown}
        />
        {isExpanded ? (
          <span className="search-badge" aria-hidden="true">
            {isFocused ? 'Esc' : shortcutLabel}
          </span>
        ) : null}
      </div>

      {showDropdown ? (
        <div className="search-dropdown" id={listboxId} role="listbox">
          {filteredResults.length === 0 ? (
            <div className="search-empty">{emptyText}</div>
          ) : (
            <div className="search-results-list">
              {groupedSections.map(group => (
                <div key={group.section} className="search-group">
                  <div className="search-group-header" role="presentation">
                    {group.section}
                  </div>
                  {group.items.map(({ item, globalIndex }) => {
                    const isSelected = globalIndex === selectedIndex;
                    return (
                      <div
                        key={item.id}
                        role="option"
                        aria-selected={isSelected}
                        className={`search-item ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => handleSelectResult(item)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <span className="search-item-title">{item.title}</span>
                        {isSelected ? <CornerDownLeft size={14} className="search-enter-icon" /> : null}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="search-footer" aria-hidden="true">
                <span className="search-hint">↑↓ {selectHint}</span>
                <span className="search-hint">↵ {openHint}</span>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
