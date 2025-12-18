import { FileSystemService } from '../services/FileSystem';

export class ToolHandler {
  private fileSystem: FileSystemService;

  constructor(fileSystem: FileSystemService) {
    this.fileSystem = fileSystem;
  }

  async executeTools(response: string): Promise<string> {
    let output = '';
    
    // 1. Handle <write_file>
    // Regex to capture path attribute and content between tags
    // Note: This is a basic regex; production might need a robust XML parser
    const writeRegex = /<write_file\s+path=["'](.*?)["']\s*>([\s\S]*?)<\/write_file>/g;
    let match;
    while ((match = writeRegex.exec(response)) !== null) {
      const [_, filePath, content] = match;
      try {
        await this.fileSystem.handleWriteFile(filePath, content.trim());
        output += `\n[System] Successfully wrote to ${filePath}\n`;
      } catch (err: any) {
        output += `\n[System] Error writing to ${filePath}: ${err.message}\n`;
      }
    }

    // 2. Handle <read_file>
    const readRegex = /<read_file>(.*?)<\/read_file>/g;
    while ((match = readRegex.exec(response)) !== null) {
      const filePath = match[1];
      try {
        const content = await this.fileSystem.handleReadFile(filePath);
        output += `\n### FILE: ${filePath}\n${content}\n### END FILE\n`;
      } catch (err: any) {
        output += `\n[System] Error reading ${filePath}: ${err.message}\n`;
      }
    }
    
    // 3. Handle <search> (Stub for now)
    const searchRegex = /<search\s+query=["'](.*?)["']\s+type=["'](.*?)["']\s*\/>/g;
    while ((match = searchRegex.exec(response)) !== null) {
        const [_, query] = match;
        // TODO: Implement actual SearchService
        output += `\n[System] Search functionality not yet implemented (Query: ${query})\n`;
    }

    return output;
  }
}
