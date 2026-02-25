import { ipcMain } from 'electron';
import path from 'path';
import * as fs from 'fs-extra';
import { CHANNELS } from '../../shared/constants';

export class AssetIPCController {
    constructor() {
        this.registerHandlers();
    }

    private registerHandlers() {
        ipcMain.handle(CHANNELS.TO_MAIN.SAVE_TEMP_IMAGE, async (_, { name, data }) => {
            try {
                // data is expected to be a base64 string or buffer
                const buffer = Buffer.from(data.replace(/^data:image\/\w+;base64,/, ""), 'base64');
                const projectRoot = process.cwd();
                const uploadsDir = path.join(projectRoot, '.gemini', 'tmp', 'uploads');
                await fs.ensureDir(uploadsDir);
                
                const uniqueName = `${Date.now()}_${name}`;
                const filePath = path.join(uploadsDir, uniqueName);
                
                await fs.writeFile(filePath, buffer);
                return { success: true, path: filePath };
            } catch (err: any) {
                console.error("Failed to save temp image:", err);
                return { success: false, error: err.message };
            }
        });
    }
}
