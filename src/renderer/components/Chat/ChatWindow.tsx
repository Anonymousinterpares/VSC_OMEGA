import React, { useState, useRef, useEffect } from 'react';
import { Send, ChevronDown, ChevronRight, Activity, Layers, RefreshCw } from 'lucide-react';
import { IAgentMessage } from '@/shared/types';
import { CHANNELS } from '@/shared/constants';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useFileStore } from '../../store/useFileStore';

// Helper component for collapsible sections with Retry
const CollapsibleLog: React.FC<{ 
    title: string; 
    content: string; 
    onRetry?: () => void; 
    isRetrying?: boolean 
}> = ({ title, content, onRetry, isRetrying }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="mt-2 mb-2 border border-gray-700 rounded bg-gray-900 overflow-hidden text-xs">
      <div 
        className="flex items-center justify-between p-2 hover:bg-gray-800 bg-black/20"
      >
        <div className="flex items-center cursor-pointer flex-1" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <ChevronDown size={14} className="mr-1 text-gray-500" /> : <ChevronRight size={14} className="mr-1 text-gray-500" />}
            <Activity size={12} className="mr-2 text-blue-500" />
            <span className="font-mono font-semibold text-gray-400 select-none">{title}</span>
        </div>
        
        {onRetry && (
            <button 
                onClick={(e) => { e.stopPropagation(); onRetry(); }}
                className={`p-1 hover:bg-gray-700 rounded ${isRetrying ? 'animate-spin text-blue-400' : 'text-gray-500 hover:text-white'}`}
                title="Retry this step"
            >
                <RefreshCw size={12} />
            </button>
        )}
      </div>
      {isOpen && (
        <div className="p-2 border-t border-gray-800 bg-black/40 font-mono whitespace-pre-wrap text-gray-500">
          {content}
        </div>
      )}
    </div>
  );
};

// Message Renderer
const MessageContent: React.FC<{ content: string, steps?: any[], onStepRetry: (step: any) => void }> = ({ content, steps, onStepRetry }) => {
  const [showSteps, setShowSteps] = useState(false);
  const [retryingStepIndex, setRetryingStepIndex] = useState<number | null>(null);

  const handleRetryClick = (step: any, index: number) => {
      setRetryingStepIndex(index);
      onStepRetry(step);
      // Reset spinner after 2s (or handle via prop if we tracked state globally)
      setTimeout(() => setRetryingStepIndex(null), 2000); 
  };

  return (
    <div className="flex flex-col">
      {steps && steps.length > 0 && (
        <div className="mb-2">
            <button 
                onClick={() => setShowSteps(!showSteps)}
                className="flex items-center text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 px-2 py-1 rounded"
            >
                <Layers size={12} className="mr-1" />
                {showSteps ? 'Hide Agent Process' : `Show Agent Process (${steps.length} steps)`}
            </button>
            
            {showSteps && (
                <div className="mt-2 pl-2 border-l-2 border-gray-700 space-y-2">
                    {steps.map((step, idx) => (
                        <CollapsibleLog 
                            key={idx} 
                            title={`${step.agent}${step.reasoning ? `: ${step.reasoning}` : ''}`} 
                            content={step.output} 
                            onRetry={() => handleRetryClick(step, idx)}
                            isRetrying={retryingStepIndex === idx}
                        />
                    ))}
                </div>
            )}
        </div>
      )}

      <div className="whitespace-pre-wrap">{content}</div>
    </div>
  );
};

export const ChatWindow: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<IAgentMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { settings } = useSettingsStore();
  const { fileTree } = useFileStore();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Streaming Listener
  useEffect(() => {
      if (window.electron) {
          const removeListener = window.electron.ipcRenderer.on(CHANNELS.TO_RENDERER.AGENT_STEP_UPDATE, (data: { steps: any[] }) => {
              setMessages(prev => {
                  const lastMsg = prev[prev.length - 1];
                  if (lastMsg && lastMsg.role === 'assistant' && lastMsg.isStreaming) {
                      return [
                          ...prev.slice(0, -1),
                          { ...lastMsg, steps: data.steps }
                      ];
                  }
                  return prev;
              });
          });
          return () => removeListener();
      }
  }, []);

  const handleStepRetry = async (step: any) => {
      if (isThinking || !window.electron) return;
      
      setIsThinking(true);
      try {
          // Send request to run ONLY this agent with the stored input
          const response = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.SEND_MESSAGE, {
              agent: step.agent,
              message: step.input, // The original input for this step
              context: { fileTree }
          });

          // We append the result as a NEW message for clarity, 
          // or we could update the existing step (too complex for now).
          const retryMsg: IAgentMessage = {
            id: Date.now().toString(),
            role: 'assistant',
            agentName: `${step.agent} (Retry)`,
            content: response.content,
            steps: [], // No steps for a single agent run (unless it recurses? Router won't recurse if agent is specific)
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, retryMsg]);

      } catch (err) {
          console.error("Retry failed", err);
      } finally {
          setIsThinking(false);
      }
  };

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;

    const userMsg: IAgentMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    // Add User Message
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    // Add Placeholder Bot Message
    const botId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
        id: botId,
        role: 'assistant',
        agentName: 'Gemini',
        content: '', // Empty initially
        steps: [],
        timestamp: Date.now(),
        isStreaming: true // Marker
    }]);

    try {
        let responseContent = "I am in browser mode. Connect to Electron for AI.";
        
        if (window.electron) {
            // Send to backend
            const response = await window.electron.ipcRenderer.invoke(CHANNELS.TO_MAIN.SEND_MESSAGE, {
                agent: 'Router', // Default
                message: userMsg.content,
                context: {
                    fileTree: fileTree // INJECT FILE TREE
                }
            });
            responseContent = response.content;
            
            // Update the placeholder with final content and remove streaming flag
            setMessages(prev => {
                return prev.map(msg => {
                    if (msg.id === botId) {
                        return { ...msg, content: responseContent, steps: response.steps || msg.steps, isStreaming: false };
                    }
                    return msg;
                });
            });
        } else {
             setMessages(prev => prev.map(msg => msg.id === botId ? { ...msg, content: responseContent, isStreaming: false } : msg));
        }

    } catch (err) {
        console.error(err);
        const errorMsg: IAgentMessage = {
            id: (Date.now() + 2).toString(),
            role: 'system',
            content: "Error communicating with Agent.",
            timestamp: Date.now()
        };
        setMessages(prev => [...prev, errorMsg]);
        // Also stop streaming on the bot msg if it failed
        setMessages(prev => prev.map(msg => msg.id === botId ? { ...msg, isStreaming: false } : msg));
    } finally {
        setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-800">
      {/* Header */}
      <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-900">
        <span className="font-semibold text-gray-200">Agent Chat</span>
        <span className="text-xs text-gray-500">{settings.selectedModel}</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[95%] rounded-lg p-3 ${
              msg.role === 'user' 
                ? 'bg-blue-600 text-white' 
                : msg.role === 'system'
                ? 'bg-red-900/50 text-red-200 border border-red-800'
                : 'bg-gray-800 text-gray-200 border border-gray-700'
            }`}>
              {msg.agentName && <div className="text-xs font-bold mb-1 text-blue-400">{msg.agentName}</div>}
              <div className="text-sm">
                <MessageContent 
                    content={msg.content} 
                    steps={msg.steps} 
                    onStepRetry={handleStepRetry}
                />
              </div>
            </div>
          </div>
        ))}
        {isThinking && (
            <div className="flex justify-start">
                <div className="bg-gray-800 text-gray-400 text-xs px-3 py-2 rounded-lg animate-pulse">
                    Thinking...
                </div>
            </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 bg-gray-900 border-t border-gray-800">
        <div className="relative">
          <textarea
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-10 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
            rows={3}
            placeholder="Ask the agents..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="absolute bottom-2 right-2 p-1.5 bg-blue-600 rounded-md text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
