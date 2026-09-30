/**
 * Hand-maintained registry of every MCP tool. Imported by `server.ts` after
 * the Nuxt shims are installed; each default export is a tool definition
 * built via `defineMcpTool` (which is a no-op passthrough — see
 * `node_modules/@nuxtjs/mcp-toolkit/dist/runtime/server/mcp/definitions/tools.js`).
 *
 * Adding a new tool: add it under `server/mcp/tools/**` for the HTTP server
 * (auto-discovery) AND append it here for the stdio bundle. The two
 * registries are checked against each other by
 * `tests/unit/mcp-stdio/tools.parity.test.ts` — CI will fail if either
 * registry drifts.
 *
 * Note on the local import aliases (`tasks_listTasks`, etc.): they are
 * **local JS identifiers**, NOT tool names. The runtime tool name is
 * declared inside each module's `defineMcpTool({ name: 'b24_...' })` call;
 * these camelCase aliases predate the issue #129 rename and are kept
 * verbatim so the file's diff history stays focused on the actual rename
 * (tool-name strings + their imports). Renaming the aliases is a pure-
 * cosmetic refactor for a separate PR.
 */
import users_currentUser from '~/server/mcp/tools/users/current-user'
import users_findUser from '~/server/mcp/tools/users/find-user'
import users_getUser from '~/server/mcp/tools/users/get-user'

import chats_recentChat from '~/server/mcp/tools/chats/recent-chat'
import chats_findChat from '~/server/mcp/tools/chats/find-chat'
import chats_getChat from '~/server/mcp/tools/chats/get-chat'
import chats_listChatMessages from '~/server/mcp/tools/chats/list-chat-messages'
import chats_searchChatMessages from '~/server/mcp/tools/chats/search-chat-messages'
import chats_searchRecentChatMessages from '~/server/mcp/tools/chats/search-recent-chat-messages'
import chats_sendChatMessage from '~/server/mcp/tools/chats/send-chat-message'
import chats_sendChatFile from '~/server/mcp/tools/chats/send-chat-file'

import tasks_createTask from '~/server/mcp/tools/tasks/create-task'
import tasks_listTasks from '~/server/mcp/tools/tasks/list-tasks'
import tasks_updateTask from '~/server/mcp/tools/tasks/update-task'
import tasks_addTaskComment from '~/server/mcp/tools/tasks/add-task-comment'
import tasks_startTask from '~/server/mcp/tools/tasks/start-task'
import tasks_pauseTask from '~/server/mcp/tools/tasks/pause-task'
import tasks_completeTask from '~/server/mcp/tools/tasks/complete-task'
import tasks_approveTask from '~/server/mcp/tools/tasks/approve-task'
import tasks_disapproveTask from '~/server/mcp/tools/tasks/disapprove-task'
import tasks_deferTask from '~/server/mcp/tools/tasks/defer-task'
import tasks_renewTask from '~/server/mcp/tools/tasks/renew-task'
import tasks_rateTask from '~/server/mcp/tools/tasks/rate-task'
import tasks_addChecklistItem from '~/server/mcp/tools/tasks/add-checklist-item'
import tasks_listChecklistItems from '~/server/mcp/tools/tasks/list-checklist-items'
import tasks_completeChecklistItem from '~/server/mcp/tools/tasks/complete-checklist-item'
import tasks_renewChecklistItem from '~/server/mcp/tools/tasks/renew-checklist-item'
import tasks_deleteChecklistItem from '~/server/mcp/tools/tasks/delete-checklist-item'
import tasks_addTaskResult from '~/server/mcp/tools/tasks/add-task-result'
import tasks_listTaskResults from '~/server/mcp/tools/tasks/list-task-results'
import tasks_updateTaskResult from '~/server/mcp/tools/tasks/update-task-result'
import tasks_deleteTaskResult from '~/server/mcp/tools/tasks/delete-task-result'
import tasks_addElapsedTime from '~/server/mcp/tools/tasks/add-elapsed-time'
import tasks_listElapsedTime from '~/server/mcp/tools/tasks/list-elapsed-time'
import tasks_updateElapsedTime from '~/server/mcp/tools/tasks/update-elapsed-time'
import tasks_deleteElapsedTime from '~/server/mcp/tools/tasks/delete-elapsed-time'
import tasks_addTaskDependency from '~/server/mcp/tools/tasks/add-task-dependency'
import tasks_removeTaskDependency from '~/server/mcp/tools/tasks/remove-task-dependency'

import disk_listStorage from '~/server/mcp/tools/disk/list-storage'
import disk_listFolder from '~/server/mcp/tools/disk/list-folder'
import disk_searchDrive from '~/server/mcp/tools/disk/search-drive'
import disk_getFile from '~/server/mcp/tools/disk/get-file'
import disk_getFileLink from '~/server/mcp/tools/disk/get-file-link'
import disk_readFileText from '~/server/mcp/tools/disk/read-file-text'
import disk_createFolder from '~/server/mcp/tools/disk/create-folder'
import disk_uploadFile from '~/server/mcp/tools/disk/upload-file'

import meta_submitFeedback from '~/server/mcp/tools/meta/submit-feedback'
import meta_listSessions from '~/server/mcp/tools/meta/list-sessions'

export const tools = [
  users_currentUser,
  users_findUser,
  users_getUser,
  chats_recentChat,
  chats_findChat,
  chats_getChat,
  chats_listChatMessages,
  chats_searchChatMessages,
  chats_searchRecentChatMessages,
  chats_sendChatMessage,
  chats_sendChatFile,
  tasks_createTask,
  tasks_listTasks,
  tasks_updateTask,
  tasks_addTaskComment,
  tasks_startTask,
  tasks_pauseTask,
  tasks_completeTask,
  tasks_approveTask,
  tasks_disapproveTask,
  tasks_deferTask,
  tasks_renewTask,
  tasks_rateTask,
  tasks_addChecklistItem,
  tasks_listChecklistItems,
  tasks_completeChecklistItem,
  tasks_renewChecklistItem,
  tasks_deleteChecklistItem,
  tasks_addTaskResult,
  tasks_listTaskResults,
  tasks_updateTaskResult,
  tasks_deleteTaskResult,
  tasks_addElapsedTime,
  tasks_listElapsedTime,
  tasks_updateElapsedTime,
  tasks_deleteElapsedTime,
  tasks_addTaskDependency,
  tasks_removeTaskDependency,
  disk_listStorage,
  disk_listFolder,
  disk_searchDrive,
  disk_getFile,
  disk_getFileLink,
  disk_readFileText,
  disk_createFolder,
  disk_uploadFile,
  meta_submitFeedback,
  meta_listSessions,
] as const
