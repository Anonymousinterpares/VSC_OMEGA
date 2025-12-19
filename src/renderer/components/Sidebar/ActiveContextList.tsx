import React from 'react';
import { Database, X } from 'lucide-react';
import { useContextStore } from '../../store/useContextStore';

export const ActiveContextList = () => {
    const { activeContext, removeContextItem } = useContextStore();

    return (
        <div className="h-1/3 flex flex-col bg-gray-900 border-t border-gray-800">
            <div className="h-8 flex items-center px-3 bg-[#252526] border-b border-gray-800">
                <Database size={12} className="mr-2 text-blue-400" />
                <span className="text-xs font-bold text-gray-400 uppercase">Active Context</span>
                <span className="ml-auto text-xs text-gray-600">{activeContext.length} items</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {activeContext.length === 0 && (
                    <div className="text-xs text-gray-600 text-center mt-4 italic">
                        Select code → Right Click → "Add to Context"
                    </div>
                )}
                {activeContext.map(item => (
                    <div key={item.id} className="bg-gray-800 rounded border border-gray-700 p-2 text-xs relative group">
                        <div className="font-bold text-blue-300 mb-1 truncate" title={item.path}>
                            {item.path.replace(/\\/g, '/').split('/').pop()}
                        </div>
                        <div className="text-gray-500 font-mono">
                            Lines {item.startLine}-{item.endLine}
                        </div>
                        <button 
                            onClick={() => removeContextItem(item.id)}
                            className="absolute top-1 right-1 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};
