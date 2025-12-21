import React, { useState } from 'react';
import { Files, Search, Settings, FolderOpen, MoreVertical, Share2 } from 'lucide-react';
import clsx from 'clsx';
import { FileTree } from './FileTree';
import { SearchPanel } from './SearchPanel';
import { ActiveContextList } from './ActiveContextList';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useFileStore } from '../../store/useFileStore';
import { useViewStore } from '../../store/useViewStore';

type SidebarView = 'explorer' | 'search';

export const Sidebar = () => {
    const [sidebarView, setSidebarView] = useState<SidebarView>('explorer');
    const { activeView, setActiveView } = useViewStore();
    const { toggleModal } = useSettingsStore();
    const { openFolder } = useFileStore();

    const handleViewChange = (view: 'explorer' | 'search') => {
        setSidebarView(view);
        setActiveView('editor'); // Switch back to editor when sidebar is clicked
    };

    return (
        <div className="flex h-full w-full">
            {/* Activity Bar */}
            <div className="w-12 flex flex-col items-center py-4 bg-[#333333] border-r border-gray-800 text-gray-400">
                <button 
                    onClick={() => handleViewChange('explorer')}
                    className={clsx("p-2 mb-2 rounded hover:text-white relative", activeView === 'editor' && sidebarView === 'explorer' && "text-white")}
                    title="Explorer"
                >
                    <Files size={24} strokeWidth={1.5} />
                    {activeView === 'editor' && sidebarView === 'explorer' && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />}
                </button>
                <button 
                    onClick={() => handleViewChange('search')}
                    className={clsx("p-2 mb-2 rounded hover:text-white relative", activeView === 'editor' && sidebarView === 'search' && "text-white")}
                    title="Search"
                >
                    <Search size={24} strokeWidth={1.5} />
                    {activeView === 'editor' && sidebarView === 'search' && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />}
                </button>

                <div className="w-8 h-px bg-gray-700 my-2"></div>

                <button 
                    onClick={() => setActiveView('workflow')}
                    className={clsx("p-2 mb-2 rounded hover:text-white relative", activeView === 'workflow' && "text-white")}
                    title="Workflow Builder"
                >
                    <Share2 size={24} strokeWidth={1.5} />
                    {activeView === 'workflow' && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />}
                </button>

                <div className="mt-auto">
                    <button 
                        onClick={toggleModal}
                        className="p-2 rounded hover:text-white"
                        title="Settings"
                    >
                        <Settings size={24} strokeWidth={1.5} />
                    </button>
                </div>
            </div>

            {/* Side Panel Content */}
            <div className="flex-1 flex flex-col bg-[#252526] min-w-0">
                {sidebarView === 'explorer' && (
                    <div className="flex flex-col h-full">
                        {/* Explorer Header */}
                        <div className="h-9 flex items-center justify-between px-4 bg-[#252526] text-gray-300 text-xs font-bold uppercase tracking-wider border-b border-gray-800">
                            <span>Explorer</span>
                            <div className="flex space-x-1">
                                <button onClick={openFolder} className="p-1 hover:bg-gray-700 rounded" title="Open Folder">
                                    <FolderOpen size={14} />
                                </button>
                                <button className="p-1 hover:bg-gray-700 rounded" title="More Actions">
                                    <MoreVertical size={14} />
                                </button>
                            </div>
                        </div>
                        
                        {/* File Tree */}
                        <div className="flex-1 overflow-hidden">
                            <FileTree />
                        </div>

                        {/* Active Context */}
                        <ActiveContextList />
                    </div>
                )}

                {sidebarView === 'search' && (
                    <SearchPanel />
                )}
            </div>
        </div>
    );
};
