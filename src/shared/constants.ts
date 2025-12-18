export const CHANNELS = {
  TO_MAIN: {
    SEND_MESSAGE: 'agent:send-message',
    UPDATE_CONTEXT: 'context:update',
    SEARCH_CODEBASE: 'search:query',
    READ_FILE: 'fs:read-file',
    WRITE_FILE: 'fs:write-file',
    OPEN_FOLDER: 'fs:open-folder',
    GET_SETTINGS: 'settings:get',
    SAVE_SETTINGS: 'settings:save',
  },
  TO_RENDERER: {
    AGENT_RESPONSE: 'agent:response',
    AGENT_STATUS: 'agent:status', // Thinking, etc.
    SEARCH_RESULTS: 'search:results',
    FOLDER_OPENED: 'fs:folder-opened', // Payload: { rootPath, tree: IFileNode[] }
    AGENT_STEP_UPDATE: 'agent:step-update', // Payload: { steps: [...] }
  }
};
