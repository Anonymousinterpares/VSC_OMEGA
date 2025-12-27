import React, { useState } from 'react';
import { IFileNode } from '@/shared/types';
import { ChevronRight, ChevronDown, File, Folder, Plus, Minus, Loader2 } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';
import { useContextStore } from '../../store/useContextStore';
import { CHANNELS } from '@/shared/constants';
import clsx from 'clsx';

const normalizePath = (p: string) => p.replace(/\\/g, '/').toLowerCase();

const FileTreeNode: React.FC<{ node: IFileNode; depth?: number }> = ({ node, depth = 0 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const { openFile, selectedFile } = useFileStore();
  const { activeContext, addContextItem, removeContextItem } = useContextStore();

  const nodePathNormalized = normalizePath(node.path);
  const isInContext = activeContext.some(item => normalizePath(item.path) === nodePathNormalized);

  const handleClick = () => {
    if (node.type === 'folder') {
      setIsOpen(!isOpen);
    } else {
      // Single Click -> Preview
      openFile(node.path, true);
    }
  };

  const handleDoubleClick = () => {
      if (node.type !== 'folder') {
          // Double Click -> Permanent
          openFile(node.path, false);
      }
  };

  const handleToggleContext = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isLoadingContext) return;

      if (isInContext) {
          // Remove
          const item = activeContext.find(i => i.path === node.path);
          if (item) {
              removeContextItem(item.id);
          }
      } else {
          // Add
          setIsLoadingContext(true);
          try {
              if (window.electron) {
                  const content = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.READ_FILE, node.path);
                  addContextItem({
                      id: node.path, // Use path as ID for simplicity
                      type: 'file',
                      path: node.path,
                      content: content
                  });
              }
          } catch (err) {
              console.error("Failed to read file for context:", err);
          } finally {
              setIsLoadingContext(false);
          }
      }
  };

  const isSelected = selectedFile === node.path;

  return (
    <div>
      <div
        className={clsx(
          "flex items-center py-1 px-2 cursor-pointer hover:bg-gray-800 text-sm select-none group relative pr-8",
          isSelected && "bg-blue-900/50 text-blue-200"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <span className="mr-1 text-gray-500">
          {node.type === 'folder' ? (
            isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="w-[14px] inline-block" /> 
          )}
        </span>
        <span className={clsx("mr-2", node.type === 'folder' ? "text-yellow-500" : (isInContext ? "text-emerald-400" : "text-blue-400"))}>
            {node.type === 'folder' ? <Folder size={14} fill="currentColor" /> : <File size={14} />}
        </span>
        <span className={clsx(
            "truncate transition-colors", 
            node.type === 'folder' ? "font-semibold text-gray-300" : "text-gray-400",
            isInContext && !isSelected && "text-emerald-300 font-bold shadow-emerald-500/20"
        )}>
            {node.name}
        </span>

        {/* Context Toggle Button - Only for files */}
        {node.type === 'file' && (
            <button
                onClick={handleToggleContext}
                className={clsx(
                    "absolute right-2 p-0.5 rounded transition-all",
                    isInContext 
                        ? "text-emerald-400 hover:text-red-400 hover:bg-gray-700 opacity-100" 
                        : "text-gray-500 hover:text-emerald-400 hover:bg-gray-700 opacity-0 group-hover:opacity-100"
                )}
                title={isInContext ? "Remove from Context" : "Add to Context"}
            >
                {isLoadingContext ? (
                    <Loader2 size={14} className="animate-spin" />
                ) : isInContext ? (
                    <Minus size={14} strokeWidth={3} />
                ) : (
                    <Plus size={14} strokeWidth={3} />
                )}
            </button>
        )}
      </div>

      {isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTree: React.FC = () => {
  const { fileTree, rootPath, openFolder } = useFileStore();

  if (!rootPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4 text-center">
        <p className="mb-4">No folder opened.</p>
        <button 
            onClick={() => {
                console.log("Renderer: Open Folder clicked");
                openFolder();
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
        >
            Open Folder
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full pb-4">
        <div className="px-2 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
            {rootPath.split('\\').pop()}
        </div>
      {fileTree.map((node) => (
        <FileTreeNode key={node.path} node={node} />
      ))}
    </div>
  );
};
