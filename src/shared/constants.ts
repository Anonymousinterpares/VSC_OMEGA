export const CHANNELS = {
  TO_MAIN: {
    OPEN_FOLDER: 'open-folder',
    READ_FILE: 'read-file',
    WRITE_FILE: 'write-file',
    SEND_MESSAGE: 'send-message',
    REVIEW_DECISION: 'review-decision',
    GET_SETTINGS: 'get-settings',
    SAVE_SETTINGS: 'save-settings',
    TASK_CONFIRMATION_DECISION: 'task-confirmation-decision',
    ABORT_WORKFLOW: 'abort-workflow'
  },
  TO_RENDERER: {
    AGENT_STEP_UPDATE: 'agent-step-update',
    AGENT_CONTENT_UPDATE: 'agent-content-update',
    FOLDER_OPENED: 'folder-opened',
    PROPOSE_CHANGE: 'propose-change',
    REFRESH_TREE: 'refresh-tree',
    FILE_UPDATED: 'file-updated',
    REQUEST_TASK_CONFIRMATION: 'request-task-confirmation'
  }
};
