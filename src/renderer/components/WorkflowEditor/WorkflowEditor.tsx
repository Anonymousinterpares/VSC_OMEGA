import React, { useEffect, useState } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { NodeGraph } from './NodeGraph';
import { PropertiesPanel } from './PropertiesPanel';
import { Save, RotateCcw, Undo, Redo, Play } from 'lucide-react';
import clsx from 'clsx';

export const WorkflowEditor: React.FC = () => {
  const { 
    workflow, 
    fetchWorkflow, 
    saveWorkflow, 
    resetWorkflow, 
    undo, 
    redo,
    isLoading 
  } = useWorkflowStore();

  const [panelWidth, setPanelWidth] = useState(384); // Default w-96
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    fetchWorkflow();
  }, []);

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (!isDragging) return;
          // Calculate new width: Window Width - Mouse X
          // This assumes the panel is anchored to the right
          const newWidth = document.body.clientWidth - e.clientX;
          // Constraint: Min 100px, Max 80% of screen?
          if (newWidth > 100 && newWidth < document.body.clientWidth - 100) {
              setPanelWidth(newWidth);
          }
      };

      const handleMouseUp = () => {
          setIsDragging(false);
          document.body.style.cursor = 'default';
      };

      if (isDragging) {
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
          document.body.style.cursor = 'col-resize';
      }

      return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          document.body.style.cursor = 'default';
      };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
  };

  const handleSave = () => {
    if (workflow) saveWorkflow(workflow);
  };

  return (
    <div className="flex flex-col w-full h-full bg-slate-900 text-white">
      {/* Toolbar */}
      <div className="h-14 border-b border-slate-700 flex items-center px-4 justify-between bg-slate-800 shadow-sm z-30">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center">
                <Play size={16} fill="white" />
            </div>
            <div>
                <h1 className="font-bold text-sm">Workflow Builder</h1>
                <p className="text-[10px] text-slate-400">Design your Agentic Swarm</p>
            </div>
        </div>

        <div className="flex items-center gap-2">
            <button onClick={() => undo()} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Undo">
                <Undo size={18} />
            </button>
            <button onClick={() => redo()} className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Redo">
                <Redo size={18} />
            </button>
            <div className="w-px h-6 bg-slate-700 mx-2"></div>
            <button onClick={() => resetWorkflow()} className="p-2 hover:bg-red-900/30 rounded text-red-400 hover:text-red-300 transition-colors flex items-center gap-2 text-xs" title="Reset to Default">
                <RotateCcw size={14} />
                <span>Reset</span>
            </button>
            <button 
                onClick={handleSave} 
                className={clsx(
                    "px-4 py-1.5 rounded flex items-center gap-2 text-xs font-bold transition-colors shadow-lg",
                    isLoading ? "bg-indigo-800 text-indigo-400" : "bg-indigo-600 hover:bg-indigo-500 text-white"
                )}
            >
                <Save size={14} />
                {isLoading ? 'Saving...' : 'Save Workflow'}
            </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 relative">
            <NodeGraph />
        </div>
        
        {/* Resizer */}
        <div 
            className={`w-1 cursor-col-resize hover:bg-blue-500 transition-colors z-40 ${isDragging ? 'bg-blue-500' : 'bg-slate-700'}`}
            onMouseDown={handleMouseDown}
        />

        <div style={{ width: panelWidth }} className="flex-shrink-0 h-full overflow-x-auto overflow-y-hidden bg-slate-800 relative">
            <PropertiesPanel />
        </div>
      </div>
    </div>
  );
};
