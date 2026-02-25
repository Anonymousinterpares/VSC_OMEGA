import { LLMService } from '../services/LLMService';

export interface ISessionStats {
    totalInput: number;
    totalOutput: number;
    currentContextSize: number;
    agentStats: Record<string, { input: number; output: number; contextSize: number }>;
}

export class HistoryManager {
    private stats: any = {
        totalInput: 0,
        totalOutput: 0,
        currentContextSize: 0,
        agentStats: {} as Record<string, { input: number; output: number; contextSize: number }>
    };

    private currentTurnStats = {
        input: 0,
        output: 0,
        agent: ''
    };

    /**
     * Updates live estimates during streaming.
     */
    public updateLiveOutput(deltaLength: number) {
        this.currentTurnStats.output += deltaLength / 4;
    }

    /**
     * Updates stats with official token counts from the LLM provider.
     */
    public updateUsage(usage: any, agent: string) {
        if (!usage) return;
        this.currentTurnStats.input = usage.promptTokenCount || 0;
        this.currentTurnStats.output = usage.candidatesTokenCount || 0;
        this.currentTurnStats.agent = agent;
    }

    /**
     * Commits the current turn's stats to the global session stats.
     */
    public commitTurn() {
        const agent = this.currentTurnStats.agent;
        if (!agent) return;

        this.stats.totalInput += this.currentTurnStats.input;
        this.stats.totalOutput += Math.round(this.currentTurnStats.output);
        this.stats.currentContextSize = this.currentTurnStats.input;

        if (!this.stats.agentStats[agent]) {
            this.stats.agentStats[agent] = { input: 0, output: 0, contextSize: 0 };
        }
        this.stats.agentStats[agent].input += this.currentTurnStats.input;
        this.stats.agentStats[agent].output += Math.round(this.currentTurnStats.output);
        this.stats.agentStats[agent].contextSize = this.currentTurnStats.input;

        // Reset current
        this.currentTurnStats = { input: 0, output: 0, agent: '' };
    }

    public getStats() {
        // Return a merged view of session + current turn
        const displayStats = {
            totalInput: this.stats.totalInput + this.currentTurnStats.input,
            totalOutput: this.stats.totalOutput + (Math.round(this.currentTurnStats.output)),
            currentContextSize: this.currentTurnStats.input || this.stats.currentContextSize,
            agentStats: { ...this.stats.agentStats }
        };

        if (this.currentTurnStats.agent) {
            const agent = this.currentTurnStats.agent;
            const existing = displayStats.agentStats[agent] || { input: 0, output: 0, contextSize: 0 };
            displayStats.agentStats[agent] = {
                input: existing.input + this.currentTurnStats.input,
                output: existing.output + Math.round(this.currentTurnStats.output),
                contextSize: this.currentTurnStats.input || existing.contextSize
            };
        }
        return displayStats;
    }

    public resetStats() {
        this.stats = {
            totalInput: 0,
            totalOutput: 0,
            currentContextSize: 0,
            agentStats: {}
        };
        this.currentTurnStats = { input: 0, output: 0, agent: '' };
    }

    /**
     * Formats history array into a text block for the LLM.
     */
    public formatHistoryText(history: any[]): string {
        if (!history || history.length === 0) return "";
        return history.map(m => `[${m.role === 'user' ? 'User' : (m.agentName || 'System')}]: ${m.content}`).join('\n\n') + '\n\n';
    }

    /**
     * Compresses history using the LLM when it grows too large.
     */
    public async compressHistory(messages: any[], llm: LLMService): Promise<any[]> {
        if (!messages || messages.length <= 6) return messages;

        const KEEP_COUNT = 4;
        const recentMessages = messages.slice(-KEEP_COUNT);
        const olderMessages = messages.slice(0, -KEEP_COUNT);

        const historyText = olderMessages.map(m => `[${m.role} (${m.agentName || 'User'})]: ${m.content}`).join('\n\n');

        const systemPrompt = "You are a Technical Project Manager. Your task is to compress the following chat history into a detailed, structured summary.";
        const userPrompt = `
Analyze the conversation history below. 
Identify the key topics discussed, decisions made, and technical details established.
Produce a summary that preserves all critical technical context (file paths, bug fixes, user preferences, architectural decisions) but removes conversational fluff.

Format the output as a set of topic blocks:
### Topic: [Topic Name]
- [Chronological Detail 1]
- [Chronological Detail 2]

HISTORY TO COMPRESS:
${historyText}
        `;

        try {
            const summary = await llm.generateCompletion(systemPrompt, userPrompt, "", (usage) => this.updateUsage(usage, 'System_Compressor'));
            
            const summaryMessage = {
                id: Date.now().toString(),
                role: 'system',
                agentName: 'Context Manager',
                content: `**[CONTEXT COMPRESSED]**\nThe following is a summary of the earlier conversation:\n\n${summary}`,
                timestamp: Date.now()
            };

            return [summaryMessage, ...recentMessages];
        } catch (err) {
            console.error("Compression failed", err);
            return messages;
        }
    }
}
