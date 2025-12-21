export class ContextManager {
    
    public buildContextString(
        userContext: any[] | undefined, 
        fileTree: any[], 
        workingSet: Map<string, string>
    ): string {
        let output = "";

        // 1. File Tree (Structure)
        if (fileTree) {
            output += `Project Files (Structure):\n${this.flattenFileTree(fileTree).join('\n')}\n\n`;
        }

        // 2. Process Context
        // We want to verify which User Context items are stale (superseded by Working Set)
        const supersededFiles = new Set<string>();

        if (userContext && userContext.length > 0) {
            output += "### ACTIVE CONTEXT (User Selected):\n";
            
            for (const item of userContext) {
                const path = item.path;
                
                // Check if this file has been modified in the session
                if (workingSet.has(path)) {
                    // It is superseded. We do NOT add the original content.
                    // We track it to mention it later if needed, or just silently replace.
                    supersededFiles.add(path);
                    output += `\n> [NOTE]: User selected context for '${path}' is superseded by recent session changes (see below).\n`;
                } else {
                    // Not modified, add as is
                    if (item.type === 'fragment') {
                        output += `\n### FRAGMENT: ${item.path} (Lines ${item.startLine}-${item.endLine})\n${item.content}\n### END FRAGMENT\n`;
                    } else if (item.type === 'file') {
                        output += `\n### FILE: ${item.path}\n${item.content}\n### END FILE\n`;
                    }
                }
            }
            output += "\n";
        }

        // 3. Recently Modified (Session Context) - The Source of Truth
        if (workingSet.size > 0) {
            output += "### RECENTLY MODIFIED FILES (Session Working Set):\n";
            output += "> These files have been modified or read during this session. This is the LATEST content.\n";
            
            for (const [path, content] of workingSet) {
                output += `\n### FILE: ${path}\n${content}\n### END FILE\n`;
            }
            output += "\n";
        }

        return output;
    }

    private flattenFileTree(nodes: any[]): string[] {
        let paths: string[] = [];
        for (const node of nodes) {
            if (node.type === 'file') {
                paths.push(node.path);
            } else if (node.children) {
                paths = [...paths, ...this.flattenFileTree(node.children)];
            }
        }
        return paths;
    }
}
