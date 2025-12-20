import React, { useRef, useState } from 'react';
import { X, Pin, Check } from 'lucide-react';
import { useFileStore, ITab } from '../../store/useFileStore';
import clsx from 'clsx';
import { createPortal } from 'react-dom';

interface TabProps {
    tab: ITab;
    isActive: boolean;
    onContextMenu: (e: React.MouseEvent, tabId: string) => void;
    index: number;
}

const Tab: React.FC<TabProps> = ({ tab, isActive, onContextMenu, index }) => {
    const { setActiveTab, closeTab, markTabPermanent, reorderTabs, tabs, unsavedFiles } = useFileStore();
    const isDirty = unsavedFiles.has(tab.path);
    
    // Drag State
    const [dropPosition, setDropPosition] = useState<'left' | 'right' | null>(null);

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('text/plain', index.toString());
        e.dataTransfer.effectAllowed = "move";
        // e.dataTransfer.setDragImage(img, 0, 0); // Optional: Custom ghost image
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Necessary to allow dropping
        
        // Calculate drop position relative to center
        const rect = e.currentTarget.getBoundingClientRect();
        const mid = (rect.left + rect.right) / 2;
        const position = e.clientX < mid ? 'left' : 'right';
        
        // Don't show indicator if dragging onto itself (roughly)
        // Note: we can't easily access source index here without dataTransfer.getData which is not available in dragOver
        // But we can just render.
        setDropPosition(position);
    };

    const handleDragLeave = () => {
        setDropPosition(null);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDropPosition(null);
        
        const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (isNaN(sourceIndex)) return;

        let destIndex = index;
        
        // Adjust destIndex based on drop side
        // If dropping on 'right', effectively we want to move AFTER this element.
        // reorderTabs logic: moves source to dest.
        // If source < dest, and we drop on right, we target index.
        // If source > dest, and we drop on right, we target index + 1?
        // Let's simplify:
        // reorderTabs(from, to) removes 'from', then inserts at 'to'.
        
        // If dropping 'right', we want to insert AFTER 'index'.
        if (dropPosition === 'right') {
            // If source is before dest, removing source shifts dest index down by 1.
            // But 'splice' handles index.
            // We want the final position to be index + 1?
            // Actually simpler: reorderTabs takes (src, dest).
            // If right, we effectively want to swap with next element?
            // No, we want to place it in the slot after current.
             
            // To achieve "Right of current":
            // If source < index: current shifts left.
            // If we move source to index, it goes BEFORE current.
            // If we move source to index+1, it goes AFTER current.
            // BUT: if source < index, 'index' refers to the item that will shift down.
            
            // Let's use array logic:
            // Remove source.
            // Calculate adjusted destination index.
            
            // To simplify usage of reorderTabs, let's map "Drop on Right" to "Insert at index + 1" (logically).
            // But we need to account for the removal of Source.
            
            if (sourceIndex < index) {
                // Source is to the left.
                // Dropping on Right of Index (which is > Source).
                // We want to move Source to Index.
                // e.g. [S, A, B(Target), C] -> Drop right of B -> [A, B, S, C]
                // splice(0, 1) -> [A, B, C]. Target B is now at 1. We want S at 2.
                // Original Index of B was 2.
                // So dest = 2.
                destIndex = index;
            } else {
                 // Source is to the right.
                 // Dropping on Right of Index (which is < Source).
                 // e.g. [A(Target), B, S] -> Drop right of A -> [A, S, B]
                 // splice(2, 1) -> [A, B]. Target A is at 0. We want S at 1.
                 // Original Index of A was 0.
                 // So dest = 1 (index + 1).
                 destIndex = index + 1;
            }
        } else {
            // Drop Position Left
            // We want to insert BEFORE current.
             if (sourceIndex < index) {
                // Source left.
                // e.g. [S, A, B(Target)] -> Drop left of B.
                // Want [A, S, B].
                // splice(0, 1) -> [A, B]. Target B is at 1. We want S at 1.
                // Original Index of B was 2.
                // So dest = index - 1.
                destIndex = index - 1;
            } else {
                 // Source right.
                 // e.g. [A(Target), B, S] -> Drop left of A.
                 // Want [S, A, B].
                 // splice(2, 1) -> [A, B]. Target A is at 0. We want S at 0.
                 // Original Index of A was 0.
                 // So dest = index.
                 destIndex = index;
            }
        }

        reorderTabs(sourceIndex, destIndex);
    };

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDirty) {
             const fileName = tab.path.split(/[/\\]/).pop();
             if (confirm(`Save changes to ${fileName}?`)) {
                 alert("Please save the file using Ctrl+S before closing.");
                 return;
             } else {
                 if (!confirm(`Discard changes to ${fileName}?`)) {
                     return; 
                 }
             }
        }
        closeTab(tab.id);
    };

    return (
        <div
            className={clsx(
                "group relative flex items-center h-full px-3 min-w-[120px] max-w-[200px] border-r border-[#252526] select-none cursor-pointer text-sm transition-colors",
                isActive ? "bg-[#1e1e1e] text-white" : "bg-[#2d2d2d] text-gray-400 hover:bg-[#2a2d2e]",
                tab.isPreview && !isActive && "italic"
            )}
            style={{ backgroundColor: tab.color && !isActive ? tab.color : undefined }}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => markTabPermanent(tab.id)}
            onContextMenu={(e) => onContextMenu(e, tab.id)}
            draggable
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drag Indicator */}
            {dropPosition === 'left' && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 z-10" />
            )}
            {dropPosition === 'right' && (
                <div className="absolute right-0 top-0 bottom-0 w-1 bg-blue-500 z-10" />
            )}

            {tab.isPinned && <Pin size={10} className="mr-2 text-gray-400 flex-shrink-0" />}
            
            <span className={clsx("truncate flex-1", tab.isPreview && "italic")}>
                {tab.path.split(/[/\\]/).pop()}
            </span>

            {isDirty && (
                 <span className="ml-2 w-2 h-2 rounded-full bg-white block group-hover:hidden" />
            )}

            <button 
                onClick={handleClose}
                className={clsx(
                    "ml-2 p-0.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-700 transition-opacity",
                    isDirty && "group-hover:block" // Always show close on hover
                )}
            >
                <X size={14} />
            </button>
            
            {/* Top Border for Active */}
            {isActive && <div className="absolute top-0 left-0 right-0 h-[1px] bg-blue-500" />}
        </div>
    );
};

export const TabBar = () => {
    const { tabs, activeTabId, togglePinTab, setTabColor } = useFileStore();
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, tabId: string } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, tabId });
    };

    const closeMenu = () => setContextMenu(null);

    // Color Palette
    const colors = [
        '#000000', '#808080', '#c0c0c0', '#ffffff', '#800000', '#ff0000', '#808000', '#ffff00', 
        '#008000', '#00ff00', '#008080', '#00ffff', '#000080', '#0000ff', '#800080', '#ff00ff',
        '#660000', '#663300', '#666600', '#336600', '#006600', '#006633', '#006666', '#003366', 
        '#000066', '#330066', '#660066', '#660033', '#333333', '#555555', '#999999', '#eeeeee'
    ];

    return (
        <div className="flex h-9 bg-[#252526] overflow-x-auto scrollbar-hide w-full" onMouseLeave={closeMenu}>
            {tabs.map((tab, idx) => (
                <Tab 
                    key={tab.id} 
                    tab={tab} 
                    index={idx}
                    isActive={activeTabId === tab.id} 
                    onContextMenu={handleContextMenu}
                />
            ))}

            {/* Context Menu Portal */}
            {contextMenu && createPortal(
                <div 
                    className="fixed z-50 bg-[#252526] border border-gray-700 shadow-xl rounded py-1 min-w-[200px]"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onMouseLeave={closeMenu}
                >
                    <div 
                        className="px-3 py-1 hover:bg-[#094771] cursor-pointer text-xs text-white flex items-center"
                        onClick={() => { togglePinTab(contextMenu.tabId); closeMenu(); }}
                    >
                        <Pin size={12} className="mr-2" />
                        {tabs.find(t => t.id === contextMenu.tabId)?.isPinned ? 'Unpin Tab' : 'Pin Tab'}
                    </div>
                    <div className="border-t border-gray-700 my-1" />
                    <div className="px-3 py-1 text-xs text-gray-500 font-bold uppercase">Tab Color</div>
                    <div className="grid grid-cols-8 gap-1 px-3 py-1 bg-[#1e1e1e] p-2">
                        {colors.map(c => (
                            <div 
                                key={c}
                                className="w-4 h-4 rounded-sm cursor-pointer border border-gray-600 hover:border-white"
                                style={{ backgroundColor: c }}
                                onClick={() => { setTabColor(contextMenu.tabId, c); closeMenu(); }}
                                title={c}
                            />
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};