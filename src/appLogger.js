const LOG_STORAGE_KEY = 'medicine-decoction-runtime-logs'
const DEFAULT_MAX_LOG_ENTRIES = 200

const normalizeLogLevel = level =>
  ['info', 'warn', 'error'].includes(level) ? level : 'info'

const serializeValue = (value, seen = new WeakSet()) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    }
  }

  if (value === undefined) return null
  if (value === null || typeof value !== 'object') return value

  if (seen.has(value)) {
    return '[Circular]'
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map(item => serializeValue(item, seen))
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      serializeValue(item, seen)
    ])
  )
}

const serializeDetails = details => {
  try {
    return serializeValue(details)
  } catch (error) {
    return { unserializable: true, message: String(details) }
  }
}

const readStoredLogs = async (storage, storageKey) => {
  const stored = await storage.getItem(storageKey)
  if (!stored) return []

  try {
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    return []
  }
}

const formatLogsForCopy = logs =>
  logs
    .map(log => {
      const header = `[${log.timestamp}] ${String(log.level || 'info').toUpperCase()} ${log.module || 'app'} - ${log.message || ''}`
      if (!log.details) return header

      return `${header}\n${JSON.stringify(log.details, null, 2)}`
    })
    .join('\n\n')

const createAppLogger = ({
  storage,
  storageKey = LOG_STORAGE_KEY,
  maxEntries = DEFAULT_MAX_LOG_ENTRIES,
  now = () => new Date(),
  idFactory = () =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}) => {
  if (!storage) {
    throw new Error('createAppLogger requires a storage adapter')
  }

  const appendLog = async (level, moduleName, message, details) => {
    const timestamp = now().toISOString()
    const entry = {
      id: idFactory(),
      timestamp,
      level: normalizeLogLevel(level),
      module: moduleName || 'app',
      message: message || '',
      details: serializeDetails(details)
    }
    const logs = await readStoredLogs(storage, storageKey)
    const nextLogs = [entry, ...logs].slice(0, maxEntries)
    await storage.setItem(storageKey, JSON.stringify(nextLogs))
    return entry
  }

  return {
    info: (moduleName, message, details) =>
      appendLog('info', moduleName, message, details),
    warn: (moduleName, message, details) =>
      appendLog('warn', moduleName, message, details),
    error: (moduleName, message, details) =>
      appendLog('error', moduleName, message, details),
    getLogs: () => readStoredLogs(storage, storageKey),
    clearLogs: () => storage.removeItem(storageKey)
  }
}

module.exports = {
  DEFAULT_MAX_LOG_ENTRIES,
  LOG_STORAGE_KEY,
  createAppLogger,
  formatLogsForCopy
}
