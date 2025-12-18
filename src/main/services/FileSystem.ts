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
    await fs.writeFile(resolvedPath, content, 'utf-8');
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
}
