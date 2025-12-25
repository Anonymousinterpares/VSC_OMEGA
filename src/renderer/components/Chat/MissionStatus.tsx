import React from 'react';
import { useTaskStore, ITask } from '../../store/useTaskStore';
import { useExecutionStore } from '../../store/useExecutionStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { AgentPhase } from '../../../shared/types';
import { Loader2, Server, Terminal, FileCode, BrainCircuit, Play } from 'lucide-react';

const PhaseIndicator = () => {
  const { agentPhase, phaseDetails } = useExecutionStore();

  if (agentPhase === 'IDLE') return null;

  const getPhaseConfig = (phase: AgentPhase) => {
    switch (phase) {
      case 'PREPARING_CONTEXT': return { icon: FileCode, color: 'text-yellow-400', label: 'Preparing Context' };
      case 'WAITING_FOR_API': return { icon: Server, color: 'text-blue-400', label: 'Waiting for API' };
      case 'STREAMING': return { icon: BrainCircuit, color: 'text-purple-400', label: 'Thinking...' };
      case 'EXECUTING_TOOL': return { icon: Terminal, color: 'text-green-400', label: 'Executing Tool' };
      case 'ANALYZING': return { icon: Loader2, color: 'text-orange-400', label: 'Analyzing Output' };
      default: return { icon: Play, color: 'text-gray-400', label: 'Processing' };
    }
  };

  const config = getPhaseConfig(agentPhase);
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 p-2 bg-gray-800 rounded mb-2 border border-gray-700 text-xs shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
       <Icon className={`w-3.5 h-3.5 ${config.color} ${agentPhase === 'WAITING_FOR_API' || agentPhase === 'ANALYZING' ? 'animate-spin' : ''}`} />
       <div className="flex flex-col min-w-0">
          <span className={`font-bold ${config.color} leading-none mb-0.5`}>{config.label}</span>
          {phaseDetails && <span className="text-gray-400 truncate leading-none">{phaseDetails}</span>}
       </div>
    </div>
  );
};

const StatusIcon = ({ status }: { status: ITask['status'] }) => {
  switch (status) {
    case 'pending': return <span className="text-gray-500">⏳</span>;
    case 'in_progress': return <span className="text-blue-400 animate-pulse">🔨</span>;
    case 'review_pending': return <span className="text-yellow-400">🕵️</span>;
    case 'completed': return <span className="text-green-500">✅</span>;
    case 'failed': return <span className="text-red-500">❌</span>;
    default: return <span>•</span>;
  }
};

export const MissionStatus: React.FC = () => {
  const { tasks, strictMode, startTime, endTime } = useTaskStore();
  const { settings } = useSettingsStore();
  const [elapsed, setElapsed] = React.useState<string>("00:00");

  React.useEffect(() => {
    if (!startTime) {
        setElapsed("00:00");
        return;
    }

    const updateTimer = () => {
        const now = endTime || Date.now();
        const diff = Math.max(0, now - startTime);
        const seconds = Math.floor((diff / 1000) % 60);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const hours = Math.floor(diff / (1000 * 60 * 60));
        
        const fmt = (n: number) => n.toString().padStart(2, '0');
        if (hours > 0) {
            setElapsed(`${fmt(hours)}:${fmt(minutes)}:${fmt(seconds)}`);
        } else {
            setElapsed(`${fmt(minutes)}:${fmt(seconds)}`);
        }
    };

    updateTimer();
    
    let interval: NodeJS.Timeout | null = null;
    if (!endTime) {
        interval = setInterval(updateTimer, 1000);
    }

    return () => {
        if (interval) clearInterval(interval);
    };
  }, [startTime, endTime]);

  if (tasks.length === 0 && !startTime) return null;

  const progress = tasks.length > 0 
      ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100)
      : 0;

  return (
    <div className="border-t border-gray-700 bg-[#1e1e1e] p-3 flex flex-col gap-2 shadow-lg">
      <div className="flex justify-between items-center text-xs text-gray-400 uppercase tracking-wider font-bold">
        <span>Mission Status</span>
        <div className="flex items-center gap-3">
             <span className={`font-mono ${endTime ? 'text-green-500' : 'text-blue-400'}`}>{elapsed}</span>
             <span>{progress}% Complete</span>
        </div>
      </div>

      {settings.operationMode === 'documentation' && (
          <div className="bg-orange-900/50 border border-orange-500/50 text-orange-200 text-[10px] px-2 py-1 rounded flex items-center gap-2 justify-center">
              <span>📖 Documentation Mode Active (Read-Only Code)</span>
          </div>
      )}

      <div className="h-1 w-full bg-gray-700 rounded-full overflow-hidden">
        <div 
          className="h-full bg-green-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <PhaseIndicator />

      <div className="max-h-32 overflow-y-auto space-y-1 mt-1 pr-1 custom-scrollbar">
        {tasks.length === 0 ? (
            <div className="text-gray-500 italic text-center p-2 text-xs">
                Initializing mission parameters...
            </div>
        ) : (
            tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 text-sm p-1 hover:bg-[#2d2d2d] rounded">
            <StatusIcon status={task.status} />
            <span className={`flex-1 truncate ${task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
              <span className="font-bold mr-1">{task.id}:</span> {task.description}
            </span>
            {task.status === 'review_pending' && (
               <span className="text-[10px] bg-yellow-900 text-yellow-200 px-1 rounded border border-yellow-700">
                 Reviewing
               </span>
            )}
            {task.status === 'in_progress' && task.assignedAgent && (
                <span className="text-[10px] bg-blue-900 text-blue-200 px-1 rounded border border-blue-700">
                    {task.assignedAgent}
                </span>
            )}
          </div>
        )))}
      </div>
      
      {strictMode && (
          <div className="text-[10px] text-yellow-500 text-center border-t border-gray-700 pt-1">
              ⚠️ Strict Mode: Manual Approval Required
          </div>
      )}
    </div>
  );
};
