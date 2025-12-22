import React, { useEffect, useState } from 'react';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { useExecutionStore } from '../../store/useExecutionStore';
import { Save, RotateCcw, Eye } from 'lucide-react';
import { ContextViewer } from '../Modals/ContextViewer';

export const PropertiesPanel: React.FC = () => {
  const { workflow, selectedAgentId, updateLocalAgent, updateRouterPrompt, saveWorkflow } = useWorkflowStore();
  const { status, pausedContext } = useExecutionStore();
  const [localPrompt, setLocalPrompt] = useState('');
  const [showContext, setShowContext] = useState(false);
  
  const isRouter = selectedAgentId === 'Router';
  const canInspect = status === 'PAUSED' && pausedContext?.agent === selectedAgentId;
  
  const selectedAgent = React.useMemo(() => {
    if (!workflow) return null;
    if (isRouter) return { 
        id: 'Router', 
        name: 'Router', 
        role: 'Orchestrator', 
        systemPrompt: workflow.routerPrompt,
        color: '#6366f1',
        description: 'Decides the next step based on conversation history.'
    };
    return workflow.agents.find(a => a.id === selectedAgentId);
  }, [workflow, selectedAgentId]);

  useEffect(() => {
    if (selectedAgent) {
        setLocalPrompt(selectedAgent.systemPrompt);
    }
  }, [selectedAgent?.id]); // Only reset when ID changes

  if (!selectedAgent || !workflow) {
    return (
      <div className="w-80 h-full bg-slate-800 border-l border-slate-700 p-6 flex items-center justify-center text-slate-500">
        Select a node to edit properties
      </div>
    );
  }

  const handleSave = () => {
    if (isRouter) {
        updateRouterPrompt(localPrompt);
    } else {
        updateLocalAgent(selectedAgent.id, { systemPrompt: localPrompt });
    }
  };

  // Auto-update store on blur
  const handleBlur = () => {
      if (isRouter) {
          updateRouterPrompt(localPrompt);
      } else {
          updateLocalAgent(selectedAgent.id, { systemPrompt: localPrompt });
      }
  };

  return (
    <div className="w-96 h-full bg-slate-800 border-l border-slate-700 flex flex-col shadow-2xl z-20">
      <div className="p-4 border-b border-slate-700 flex justify-between items-center" style={{ borderLeft: `4px solid ${selectedAgent.color}` }}>
        <div>
          <h2 className="text-white font-bold text-lg">{selectedAgent.name}</h2>
          <p className="text-slate-400 text-xs">{selectedAgent.role}</p>
        </div>
        <div className="flex items-center space-x-2">
             {canInspect && (
                 <button 
                    onClick={() => setShowContext(true)}
                    className="p-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-full shadow-lg animate-pulse"
                    title="Inspect Pending Context"
                 >
                    <Eye size={16} />
                 </button>
             )}
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: selectedAgent.color }}></div>
        </div>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        <div className="mb-4">
            <label className="block text-slate-400 text-xs uppercase font-bold mb-2">Description</label>
            <p className="text-slate-300 text-sm bg-slate-900/50 p-2 rounded">{selectedAgent.description}</p>
        </div>

        <div className="mb-4 h-full flex flex-col">
            <label className="block text-slate-400 text-xs uppercase font-bold mb-2">System Prompt / Instructions</label>
            <textarea
                className="flex-1 w-full bg-slate-900 text-slate-200 text-xs font-mono p-3 rounded border border-slate-700 focus:border-blue-500 outline-none resize-none leading-relaxed"
                value={localPrompt}
                onChange={(e) => setLocalPrompt(e.target.value)}
                onBlur={handleBlur}
                spellCheck={false}
            />
            <p className="text-slate-500 text-[10px] mt-1">
                Use natural language to define behavior. Supports XML tags like &lt;read_file&gt; for tools.
            </p>
        </div>
      </div>

      {showContext && pausedContext && (
          <ContextViewer data={pausedContext} onClose={() => setShowContext(false)} />
      )}
    </div>
  );
};
