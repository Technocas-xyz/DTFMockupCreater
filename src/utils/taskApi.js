// ── Task Management client ───────────────────────────────────────────────────
// Design Studio draws the task screens; every task, user and state transition
// still belongs to the Task Management app (pm2 `task-app`, port 4100). Calls go
// to /task-api on this same origin, which the designstudio vhost proxies to that
// API with the visitor's Authentik identity attached — so the person is the same
// person in both apps, and no task logic is duplicated here.
//
// The token is that app's own JWT, kept apart from Design Studio's `auth_token`.

const BASE = '/task-api'
const TOKEN_KEY = 'dk_task_token'

let token = localStorage.getItem(TOKEN_KEY)

export function setTaskToken(next) {
  token = next
  if (next) localStorage.setItem(TOKEN_KEY, next)
  else localStorage.removeItem(TOKEN_KEY)
}

export class TaskApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function req(path, opts = {}, retry = true) {
  let res
  try {
    res = await fetch(BASE + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...opts.headers,
      },
    })
  } catch {
    throw new TaskApiError('Task Management is unreachable from here', 0)
  }

  // An expired token is the ordinary case after 12 hours — trade the Authentik
  // identity for a fresh one and run the call again rather than logging out.
  if (res.status === 401 && retry) {
    setTaskToken(null)
    const signed = await signIn().catch(() => null)
    if (signed) return req(path, opts, false)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new TaskApiError(data.error || res.statusText || 'Request failed', res.status)
  return data
}

/** Exchange the Authentik headers (added by nginx) for this person's task-app token. */
async function signIn() {
  const d = await req('/auth/sso', { method: 'POST' }, false)
  setTaskToken(d.token)
  return d.user
}

/**
 * Who is using the Task Manager? Returns the task-app user (role ADMIN | SALES |
 * DESIGNER | IT) — that role, not the studio's own, decides which view is shown.
 * Throws a message worth showing when the person has suite access but no task
 * account: the task app deliberately never auto-creates one.
 */
export async function taskSignIn() {
  if (token) {
    try {
      const d = await req('/auth/me', {}, false)
      // `suiteAdmin` missing means the token predates the Authentik admin claim.
      // Trading it for a fresh one is silent; leaving it would quietly demote an
      // administrator to the designer view until the old token expired.
      if (d.user?.suiteAdmin !== undefined) return d.user
      setTaskToken(null)
    } catch {
      setTaskToken(null)
    }
  }
  return signIn()
}

const qs = (params = {}) => {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  const s = new URLSearchParams(clean).toString()
  return s ? '?' + s : ''
}

export const taskApi = {
  me: () => req('/auth/me'),
  stats: (params) => req('/tasks/stats' + qs(params)),
  tasks: (params) => req('/tasks' + qs(params)),
  task: (id) => req('/tasks/' + id),
  createTask: (payload) => req('/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  transition: (id, body) => req(`/tasks/${id}/transition`, { method: 'POST', body: JSON.stringify(body) }),
  assignTask: (id, body) => req(`/tasks/${id}/assign`, { method: 'POST', body: JSON.stringify(body) }),
  comment: (id, commentText, audioData, audioTranscript) =>
    req(`/tasks/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        commentText,
        ...(audioData ? { audioData } : {}),
        ...(audioData && audioTranscript ? { audioTranscript } : {}),
      }),
    }),
  toggleChecklist: (taskId, itemId, isCompleted) =>
    req(`/tasks/${taskId}/checklist/${itemId}`, { method: 'PATCH', body: JSON.stringify({ isCompleted }) }),
  addArtworks: (id, artworks) => req(`/tasks/${id}/artworks`, { method: 'POST', body: JSON.stringify({ artworks }) }),
  removeArtwork: (id, artworkId) => req(`/tasks/${id}/artworks/${artworkId}`, { method: 'DELETE' }),
  uploadFile: (id, body) => req(`/tasks/${id}/files`, { method: 'POST', body: JSON.stringify(body) }),
  getFile: (id, fileId) => req(`/tasks/${id}/files/${fileId}`),
  deleteFile: (id, fileId) => req(`/tasks/${id}/files/${fileId}`, { method: 'DELETE' }),
  remind: (id) => req(`/tasks/${id}/remind`, { method: 'POST' }),
  deleteTask: (id, reason) => req('/tasks/' + id, { method: 'DELETE', body: JSON.stringify({ reason }) }),
  assignableUsers: () => req('/users?assignable=1'),
  transcribe: (audioData) => req('/transcribe', { method: 'POST', body: JSON.stringify({ audioData }) }),
}

export function initials(name = '') {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
