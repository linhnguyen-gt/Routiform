/**
 * In-flight Open WebUI chat turns, so the Stop button has something to stop.
 *
 * The SPA is handed a `task_id` per turn and later posts it to `/owui/api/tasks/stop/<id>`
 * (or, once a chat is persisted, stops every task on a chat id). Nothing else in Routiform
 * needs this — a turn started by the OpenAI-compatible gateway is aborted by the caller
 * hanging up, but an Open WebUI turn outlives its HTTP request on purpose: the request
 * returns `{ task_ids }` immediately and the answer arrives over the socket.
 */

export interface ChatTask {
  chatId: string;
  controller: AbortController;
}

const tasks = new Map<string, ChatTask>();

export function registerTask(taskId: string, chatId: string, controller: AbortController): void {
  tasks.set(taskId, { chatId, controller });
}

export function releaseTask(taskId: string): void {
  tasks.delete(taskId);
}

/** @returns true if a live task was found and aborted. */
export function abortTask(taskId: string): boolean {
  const task = tasks.get(taskId);
  if (!task) return false;
  task.controller.abort();
  tasks.delete(taskId);
  return true;
}

/** @returns the ids of the tasks that were aborted. */
export function abortTasksByChatId(chatId: string): string[] {
  const aborted: string[] = [];
  for (const [taskId, task] of tasks) {
    if (task.chatId !== chatId) continue;
    task.controller.abort();
    tasks.delete(taskId);
    aborted.push(taskId);
  }
  return aborted;
}

export function listTaskIdsByChatId(chatId: string): string[] {
  return [...tasks].filter(([, task]) => task.chatId === chatId).map(([taskId]) => taskId);
}
