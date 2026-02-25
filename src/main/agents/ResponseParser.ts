import { ITask } from '../../shared/types';

export class ResponseParser {
    /**
     * Extracts tool tags from a stream buffer or full response.
     */
    public parseToolTags(text: string) {
        return {
            write: /<write_file path="([^"]+)">([\s\S]*?)<\/write_file>/.exec(text),
            replace: /<replace path="([^"]+)">\s*<old>([\s\S]*?)<\/old>\s*<new>([\s\S]*?)<\/new>\s*<\/replace>/.exec(text),
            patch: /<patch path="([^"]+)">([\s\S]*?)<\/patch>/.exec(text),
            read: /<read_file>(.*?)<\/read_file>/.exec(text),
            execute: /<execute_command(?:\s+background=["'](true|false)["'])?>([\s\S]*?)<\/execute_command>/.exec(text),
            genImage: /<generate_image\s+prompt="([^"]+)"(?:\s+aspect_ratio="([^"]+)")?\s*\/>/.exec(text),
            resizeImage: /<resize_image\s+path="([^"]+)"\s+width=(\d+)\s+height=(\d+)(?:\s+format="([^"]+)")?\s*\/>/.exec(text),
            saveAsset: /<save_asset\s+src="([^"]+)"\s+dest="([^"]+)"\s*\/>/.exec(text),
            search: /<search\s+query="([^"]+)"(?:\s+type="([^"]+)")?\s*\/>/.exec(text)
        };
    }

    /**
     * Parses task status markers from agent output.
     */
    public parseTaskMarkers(text: string) {
        return {
            completed: text.match(/\[COMPLETED:([^\]]+)\]/gi),
            verified: text.match(/\[VERIFIED:([^\]]+)\]/gi),
            rejected: text.match(/\[REJECTED:([^\]]+)\]/gi)
        };
    }

    /**
     * Extracts task IDs from a marker tag (e.g., [COMPLETED:1, 2]).
     */
    public extractIdsFromTag(tag: string): string[] {
        const contentMatch = tag.match(/\[(?:COMPLETED|VERIFIED|REJECTED):([^\]]+)\]/i);
        if (contentMatch && contentMatch[1]) {
            const ids = contentMatch[1].match(/\d+/g);
            return ids || [];
        }
        return [];
    }

    /**
     * Parses the Planner's output to generate a structured task list.
     */
    public parseChecklist(text: string): ITask[] {
        const strictRegex = /- \[ \] \*\*(Task \d+:)\*\* (.*?)(?:\*Verify by:\* (.*))?$/gm;
        const looseRegex = /^(?:-|\d+\.)\s*(?:[\s]*\[\s*\]\s*)?(?:\*\*)?(Task\s*\d+:)?(?:\*\*)?\s*(.*?)$/gm;

        const tasks: ITask[] = [];
        let match;

        // Try strict first
        while ((match = strictRegex.exec(text)) !== null) {
            tasks.push({
                id: match[1].replace(':', ''),
                description: match[2].trim(),
                status: 'pending'
            });
        }

        // If strict failed, try loose
        if (tasks.length === 0) {
            while ((match = looseRegex.exec(text)) !== null) {
                if (match[2] && match[2].trim().length > 5) {
                    tasks.push({
                        id: match[1] ? match[1].replace(':', '') : `Task ${tasks.length + 1}`,
                        description: match[2].trim(),
                        status: 'pending'
                    });
                }
            }
        }
        return tasks;
    }

    /**
     * Extracts a JSON block from Markdown code fences or raw text.
     */
    public parseJson(text: string): any | null {
        try {
            const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return null;
            const jsonString = jsonMatch[1] || jsonMatch[0];
            return JSON.parse(jsonString);
        } catch (e) {
            return null;
        }
    }
}
