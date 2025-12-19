import { dialog, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IFileNode } from '../../shared/types';
import { CHANNELS } from '../../shared/constants';

export class FileSystemService {
  private mainWindow: BrowserWindow;
  private projectRoot: string | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  async handleOpenFolder() {
    const { canceled, filePaths } = await dialog.showOpenDialog(this.mainWindow, {
      properties: ['openDirectory']
    });

    if (canceled || filePaths.length === 0) {
      return;
    }

    this.projectRoot = filePaths[0];
    const tree = await this.readDirectory(this.projectRoot);
    
    this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.FOLDER_OPENED, {
      rootPath: this.projectRoot,
      tree
    });
  }

  async handleReadFile(filePath: string): Promise<string> {
    const resolvedPath = this.resolvePath(filePath);
    return await fs.readFile(resolvedPath, 'utf-8');
  }

  async handleWriteFile(filePath: string, content: string): Promise<void> {
    const resolvedPath = this.resolvePath(filePath);
    
    // Create Shadow Backup
    await this.createBackup(resolvedPath);

    // Ensure directory exists
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

    await fs.writeFile(resolvedPath, content, 'utf-8');

    // Notify Frontend
    this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.FILE_UPDATED, {
        path: resolvedPath,
        content: content
    });
    
    // Refresh Tree (in case new file created)
    if (this.projectRoot) {
        const tree = await this.readDirectory(this.projectRoot);
        this.mainWindow.webContents.send(CHANNELS.TO_RENDERER.REFRESH_TREE, { tree });
    }
  }

  private async createBackup(resolvedPath: string): Promise<void> {
      try {
          // Check if file exists
          await fs.access(resolvedPath);
      } catch {
          // File doesn't exist, no backup needed
          return;
      }

      if (!this.projectRoot) return;

      const historyDir = path.join(this.projectRoot, '.hive', 'history');
      try {
          await fs.mkdir(historyDir, { recursive: true });
          
          const filename = path.basename(resolvedPath);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupPath = path.join(historyDir, `${filename}.${timestamp}.bak`);
          
          await fs.copyFile(resolvedPath, backupPath);
          // console.log(`Backup created at ${backupPath}`);
      } catch (err) {
          console.error("Failed to create backup:", err);
          // We don't block the write if backup fails, but we log it.
      }
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    // If we have a project root, resolve against it
    if (this.projectRoot) {
      return path.join(this.projectRoot, filePath);
    }
    // Fallback to CWD (or maybe should throw error if no folder open?)
    return path.resolve(filePath);
  }

  private async readDirectory(dirPath: string): Promise<IFileNode[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nodes: IFileNode[] = [];

    const ignoreList = [
      'node_modules', 
      '.git', 
      '.hive', 
      'dist', 
      'out', 
      'build', 
      '.env', 
      '.DS_Store', 
      '__pycache__', 
      '.pytest_cache',
      '.vscode',
      '.idea',
      'coverage'
    ];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      // Basic Ignore List
      if (ignoreList.includes(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        const children = await this.readDirectory(fullPath);
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'folder',
          children: children.sort((a, b) => {
             // Folders first
             if (a.type === b.type) return a.name.localeCompare(b.name);
             return a.type === 'folder' ? -1 : 1;
          })
        });
      } else {
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'file'
        });
      }
    }

    // Sort: Folders first, then files
    return nodes.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
    });
  }

  async handleSearch(query: string, type: 'file' | 'content' | 'symbol' = 'content'): Promise<string> {
    if (!this.projectRoot) {
        return "Error: No project folder is open.";
    }

    const results: string[] = [];
    const searchInternal = async (dir: string) => {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                // Skip common ignored folders
                if (['node_modules', '.git', 'dist', 'out', 'build', '.hive'].includes(entry.name)) continue;

                if (entry.isDirectory()) {
                    await searchInternal(fullPath);
                } else {
                    if (type === 'file') {
                        if (entry.name.toLowerCase().includes(query.toLowerCase())) {
                            results.push(`FILE: ${fullPath}`);
                        }
                    } else {
                        // Content or Symbol search
                        try {
                            const content = await fs.readFile(fullPath, 'utf-8');
                            // Simple case-insensitive search
                            const lines = content.split('\n');
                            lines.forEach((line, index) => {
                                if (line.toLowerCase().includes(query.toLowerCase())) {
                                    // Limit line length for display
                                    const trimmedLine = line.trim().substring(0, 100); 
                                    results.push(`${fullPath} (Line ${index + 1}): ${trimmedLine}`);
                                }
                            });
                        } catch (err) {
                            // Ignore binary read errors etc
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`Error searching ${dir}:`, err);
        }
    };

    await searchInternal(this.projectRoot);
    
    if (results.length === 0) return "No matches found.";
    // Limit to top 50 results to save context
    return results.slice(0, 50).join('\n');
  }
}
