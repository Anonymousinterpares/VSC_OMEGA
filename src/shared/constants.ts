export const CHANNELS = {
  TO_MAIN: {
    OPEN_FOLDER: 'open-folder',
    READ_FILE: 'read-file',
    WRITE_FILE: 'write-file',
    SEARCH_IN_FILES: 'search-in-files',
    REPLACE_IN_FILES: 'replace-in-files',
    SEND_MESSAGE: 'send-message',
    REVIEW_DECISION: 'review-decision',
    GET_SETTINGS: 'get-settings',
    SAVE_SETTINGS: 'save-settings',
    TASK_CONFIRMATION_DECISION: 'task-confirmation-decision',
    ABORT_WORKFLOW: 'abort-workflow'
  },
    TO_RENDERER: {
        AGENT_STEP_UPDATE: 'agent:step-update',
        AGENT_CONTENT_UPDATE: 'agent:content-update',
        AGENT_STATUS_UPDATE: 'agent:status-update',
        FOLDER_OPENED: 'file:folder-opened',
        FILE_READ: 'file:read',
        FILE_UPDATED: 'file:updated',
        REFRESH_TREE: 'file:refresh-tree',
        PROPOSE_CHANGE: 'proposal:change',
        REQUEST_TASK_CONFIRMATION: 'proposal:task-confirmation'
    }
};
