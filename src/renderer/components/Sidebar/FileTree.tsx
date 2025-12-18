import React, { useState } from 'react';
import { IFileNode } from '@/shared/types';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { useFileStore } from '../../store/useFileStore';
import clsx from 'clsx';

const FileTreeNode: React.FC<{ node: IFileNode; depth?: number }> = ({ node, depth = 0 }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { selectFile, selectedFile } = useFileStore();

  const handleClick = () => {
    if (node.type === 'folder') {
      setIsOpen(!isOpen);
    } else {
      selectFile(node.path);
    }
  };

  const isSelected = selectedFile === node.path;

  return (
    <div>
      <div
        className={clsx(
          "flex items-center py-1 px-2 cursor-pointer hover:bg-gray-800 text-sm select-none",
          isSelected && "bg-blue-900/50 text-blue-200"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        <span className="mr-1 text-gray-500">
          {node.type === 'folder' ? (
            isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="w-[14px] inline-block" /> 
          )}
        </span>
        <span className={clsx("mr-2", node.type === 'folder' ? "text-yellow-500" : "text-blue-400")}>
            {node.type === 'folder' ? <Folder size={14} fill="currentColor" /> : <File size={14} />}
        </span>
        <span className={clsx("truncate", node.type === 'folder' ? "font-semibold text-gray-300" : "text-gray-400")}>
            {node.name}
        </span>
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
            onClick={openFolder}
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
