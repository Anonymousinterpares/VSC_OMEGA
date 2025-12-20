import React, { useRef, useState } from 'react';
import { X, Pin, Check } from 'lucide-react';
import { useFileStore, ITab } from '../../store/useFileStore';
import clsx from 'clsx';
import { createPortal } from 'react-dom';

interface TabProps {
    tab: ITab;
    isActive: boolean;
    onContextMenu: (e: React.MouseEvent, tabId: string) => void;
}

const Tab: React.FC<TabProps> = ({ tab, isActive, onContextMenu }) => {
    const { setActiveTab, closeTab, markTabPermanent, reorderTabs, tabs, unsavedFiles } = useFileStore();
    const isDirty = unsavedFiles.has(tab.path);
    const dragItem = useRef<number>(0);
    const dragOverItem = useRef<number>(0);

    const handleDragStart = (e: React.DragEvent, index: number) => {
        dragItem.current = index;
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragEnter = (e: React.DragEvent, index: number) => {
        dragOverItem.current = index;
    };

    const handleDragEnd = () => {
        const sourceIndex = dragItem.current;
        const destIndex = dragOverItem.current;
        if (sourceIndex !== destIndex) {
            reorderTabs(sourceIndex, destIndex);
        }
        dragItem.current = 0;
        dragOverItem.current = 0;
    };
    
    // Find index for DnD
    const index = tabs.findIndex(t => t.id === tab.id);

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Check dirty state here OR in the store. 
        // Store is simpler, but App.tsx handles global IPC dirty check. 
        // For individual tab close, we can replicate the check.
        if (isDirty) {
             const fileName = tab.path.split(/[/\\]/).pop();
             // We can't use native dialog easily from here synchronously unless we invoke main. 
             // We will assume standard "Don't Save" behavior for 'x' click on a tab unless we implement a custom modal.
             // However, user REQUESTED confirmation.
             if (confirm(`Save changes to ${fileName}?`)) {
                 // Trigger Save (Need to dispatch event or call store save if available)
                 // This is tricky without access to editor content directly here. 
                 // We will skip save for this specific click and just alert, 
                 // OR we rely on App.tsx global logic?
                 // Let's rely on global Close Window logic for "App Close", 
                 // but for "Tab Close" we warn.
                 alert("Please save the file using Ctrl+S before closing.");
                 return;
             } else {
                 // Discard changes?
                 // If confirm returns true (OK), we assume they wanted to save but we told them to use Ctrl+S.
                 // If they cancel/esc (Wait, native confirm has OK/Cancel).
                 // Actually standard confirm is "OK=True, Cancel=False".
                 // Let's try: "OK to discard?"
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
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnter={(e) => handleDragEnter(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
        >
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
        '#2d2d2d', '#3e2723', '#4e342e', '#37474f', '#263238', '#212121', 
        '#1b5e20', '#2e7d32', '#006064', '#01579b', '#1a237e', '#311b92',
        '#4a148c', '#880e4f', '#b71c1c', '#bf360c' // Sample 16
    ];

    return (
        <div className="flex h-9 bg-[#252526] overflow-x-auto scrollbar-hide w-full" onMouseLeave={closeMenu}>
            {tabs.map(tab => (
                <Tab 
                    key={tab.id} 
                    tab={tab} 
                    isActive={activeTabId === tab.id} 
                    onContextMenu={handleContextMenu}
                />
            ))}

            {/* Context Menu Portal */}
            {contextMenu && createPortal(
                <div 
                    className="fixed z-50 bg-[#252526] border border-gray-700 shadow-xl rounded py-1 min-w-[150px]"
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
                    <div className="grid grid-cols-4 gap-1 px-3 py-1">
                        {colors.map(c => (
                            <div 
                                key={c}
                                className="w-4 h-4 rounded-sm cursor-pointer border border-transparent hover:border-white"
                                style={{ backgroundColor: c }}
                                onClick={() => { setTabColor(contextMenu.tabId, c); closeMenu(); }}
                            />
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
