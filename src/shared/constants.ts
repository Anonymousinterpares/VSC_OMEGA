export const CHANNELS = {
  TO_MAIN: {
    OPEN_FOLDER: 'open-folder',
    READ_FILE: 'read-file',
    WRITE_FILE: 'write-file',
    SEARCH_IN_FILES: 'search-in-files',
    REPLACE_IN_FILES: 'replace-in-files',
    BACKUP_FILE: 'backup-file',
    GET_BACKUPS: 'get-backups',
    RESTORE_BACKUP: 'restore-backup',
    CHECK_DIRTY: 'check-dirty',
    GET_SETTINGS: 'get-settings',
    SAVE_SETTINGS: 'save-settings',
    CHECK_SYNTAX: 'check-syntax',
    SEND_MESSAGE: 'send-message',
    ABORT_WORKFLOW: 'abort-workflow',
    COMPRESS_CONTEXT: 'compress-context',
    RESET_SESSION: 'reset-session',
    REVIEW_DECISION: 'review-decision',
    TASK_CONFIRMATION_DECISION: 'task-confirmation-decision',

    // Workflow Editor
    GET_WORKFLOW: 'get-workflow',
    SAVE_WORKFLOW: 'save-workflow',
    RESET_WORKFLOW: 'reset-workflow',
    UNDO_WORKFLOW: 'undo-workflow',
    REDO_WORKFLOW: 'redo-workflow',
    PAUSE_WORKFLOW: 'pause-workflow',
    RESUME_WORKFLOW: 'resume-workflow',
    
    // Terminal
    KILL_PROCESS: 'terminal:kill-process'
  },
  TO_RENDERER: {
        AGENT_STEP_UPDATE: 'agent:step-update',
        AGENT_CONTENT_UPDATE: 'agent:content-update',
        AGENT_STATUS_UPDATE: 'agent:status-update',
        AGENT_PHASE_UPDATE: 'agent:phase-update',
        AGENT_PAUSED: 'agent:paused',
        AGENT_RESUMED: 'agent:resumed',
        AGENT_TOKEN_UPDATE: 'agent:token-update',
        FOLDER_OPENED: 'file:folder-opened',
        FILE_READ: 'file:read',
        FILE_UPDATED: 'file:updated',
        REFRESH_TREE: 'file:refresh-tree',
        PROPOSE_CHANGE: 'proposal:change',
        REQUEST_TASK_CONFIRMATION: 'proposal:task-confirmation',
        DIRTY_CHECK_REQUEST: 'app:dirty-check-request',
        AGENT_PLAN_UPDATE: 'agent:plan-update',
        
        // Terminal
        TERMINAL: {
            START: 'terminal:start',
            OUTPUT: 'terminal:output',
            STOP: 'terminal:stop',
            KILLED: 'terminal:killed'
        }
    }
};
