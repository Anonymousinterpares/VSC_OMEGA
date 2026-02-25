import { ipcMain, dialog, BrowserWindow } from 'electron';
import { FileSystemService } from '../services/FileSystem';
import { CHANNELS } from '../../shared/constants';

export class FileIPCController {
    constructor(
        private fileSystemService: FileSystemService,
        private mainWindow: BrowserWindow
    ) {
        this.registerHandlers();
    }

    private registerHandlers() {
        ipcMain.on(CHANNELS.TO_MAIN.OPEN_FOLDER, () => this.fileSystemService.handleOpenFolder());
        
        ipcMain.handle(CHANNELS.TO_MAIN.READ_FILE, async (_, filePath) => {
            return await this.fileSystemService.handleReadFile(filePath);
        });
        
        ipcMain.handle(CHANNELS.TO_MAIN.WRITE_FILE, async (_, { filePath, content }) => {
            return await this.fileSystemService.handleWriteFile(filePath, content);
        });

        ipcMain.handle(CHANNELS.TO_MAIN.SEARCH_IN_FILES, async (_, options) => {
            return await this.fileSystemService.handleSearch(options);
        });

        ipcMain.handle(CHANNELS.TO_MAIN.REPLACE_IN_FILES, async (_, { options, replaceText }) => {
            return await this.fileSystemService.handleReplace(options, replaceText);
        });

        ipcMain.on(CHANNELS.TO_MAIN.BACKUP_FILE, async (_, { filePath, content }) => {
            await this.fileSystemService.handleBackupFile(filePath, content);
        });

        ipcMain.handle(CHANNELS.TO_MAIN.GET_BACKUPS, async () => {
            return await this.fileSystemService.getBackups();
        });

        ipcMain.handle(CHANNELS.TO_MAIN.RESTORE_BACKUP, async (_, filePath) => {
            return await this.fileSystemService.handleRestoreBackup(filePath);
        });

        ipcMain.on(CHANNELS.TO_MAIN.CHECK_DIRTY, async (_, { isDirty, unsavedCount }) => {
            if (isDirty) {
                const response = await dialog.showMessageBox(this.mainWindow, {
                    type: 'warning',
                    buttons: ['Save All & Exit', 'Exit without Saving', 'Cancel'],
                    defaultId: 0,
                    cancelId: 2,
                    title: 'Unsaved Changes',
                    message: `You have ${unsavedCount} unsaved file(s).`,
                    detail: 'Do you want to save your changes before exiting?'
                });

                if (response.response === 0) {
                    await this.fileSystemService.commitBackupsToFiles();
                    this.mainWindow.destroy(); // Use destroy to skip 'close' event
                } else if (response.response === 1) {
                    this.mainWindow.destroy();
                } 
            } else {
                this.mainWindow.destroy();
            }
        });
    }
}
