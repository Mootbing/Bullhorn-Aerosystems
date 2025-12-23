'use client';

import { useEffect, useCallback, ReactNode } from 'react';
import { TEXT, BG, BORDER } from '@/config/styles';
import { COLORS } from '@/config/constants';

// Generic menu item type
export interface MenuItem {
  id: string;
  label: string;
  icon: (active: boolean, highlighted: boolean) => ReactNode;
  colors: { active: string; inactive: string; highlighted: string };
  count?: number;
  section?: string;
}

export interface MenuSection {
  id: string;
  label: string;
  items: MenuItem[];
}

interface SelectorMenuProps {
  sections: MenuSection[];
  activeId: string;
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (itemId: string, sectionId: string) => void;
  containerClassName?: string;
  footer?: string;
}

export function SelectorMenu({
  sections,
  activeId,
  highlightedIndex,
  setHighlightedIndex,
  isOpen,
  onClose,
  onSelect,
  containerClassName = '',
  footer = 'click to select',
}: SelectorMenuProps) {
  // Flatten all items for navigation
  const allItems = sections.flatMap(section => 
    section.items.map(item => ({ ...item, sectionId: section.id }))
  );
  
  // Arrow key navigation
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'w' || e.key === 'W' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex((highlightedIndex - 1 + allItems.length) % allItems.length);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 's' || e.key === 'S' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        e.stopPropagation();
        setHighlightedIndex((highlightedIndex + 1) % allItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const item = allItems[highlightedIndex];
        if (item) {
          onSelect(item.id, item.sectionId);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, allItems, highlightedIndex, setHighlightedIndex, onSelect, onClose]);
  
  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.selector-menu-container')) {
        onClose();
      }
    };
    
    const timeout = setTimeout(() => {
      window.addEventListener('click', handleClickOutside);
    }, 10);
    
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen, onClose]);
  
  // Calculate global index for an item
  const getGlobalIndex = useCallback((sectionId: string, itemIndex: number) => {
    let globalIdx = 0;
    for (const section of sections) {
      if (section.id === sectionId) {
        return globalIdx + itemIndex;
      }
      globalIdx += section.items.length;
    }
    return 0;
  }, [sections]);

  return (
    <div 
      className={`selector-menu-container absolute bottom-full left-0 mb-2 ${BG.PANEL_BLUR} ${BORDER.PANEL} overflow-hidden transition-all duration-200 ease-out ${
        isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
      } ${containerClassName}`}
      style={{ minWidth: '160px' }}
    >
      <div className={`px-2 py-1 ${BORDER.DIVIDER_B} ${TEXT.SECONDARY}`}>
        SELECT MODE <span className={TEXT.DIMMED}>↑↓</span>
      </div>
      
      {sections.map((section, sectionIdx) => (
        <div key={section.id}>
          {/* Section header */}
          <div className={`px-2 py-0.5 ${sectionIdx > 0 ? 'mt-1 ' + BORDER.DIVIDER : ''} ${TEXT.DIMMED} ${TEXT.XS}`}>
            {section.label}
          </div>
          
          {/* Section items */}
          {section.items.map((item, itemIdx) => {
            const globalIdx = getGlobalIndex(section.id, itemIdx);
            const isActive = activeId === item.id;
            const isHighlighted = highlightedIndex === globalIdx;
            const textColor = isHighlighted ? item.colors.highlighted : isActive ? item.colors.active : COLORS.TEXT_SECONDARY;
            
            return (
              <div
                key={item.id}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all duration-100 ${
                  isHighlighted ? `${BG.HOVER} border-l-2` : 'border-l-2 border-transparent'
                }`}
                style={{ borderLeftColor: isHighlighted ? item.colors.highlighted : 'transparent' }}
                onClick={() => onSelect(item.id, section.id)}
                onMouseEnter={() => setHighlightedIndex(globalIdx)}
              >
                {item.icon(isActive, isHighlighted)}
                <span style={{ color: textColor }}>{item.label}</span>
                {item.count !== undefined && (
                  <span className="ml-auto" style={{ color: isHighlighted ? item.colors.highlighted : COLORS.TEXT_SECONDARY }}>
                    {item.count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
      
      <div className={`px-2 py-1 ${BORDER.DIVIDER} ${TEXT.DIMMED} text-center`}>
        {footer}
      </div>
    </div>
  );
}

