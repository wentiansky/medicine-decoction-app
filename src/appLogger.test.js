const assert = require('node:assert/strict')
const test = require('node:test')

const { createAppLogger, formatLogsForCopy } = require('./appLogger')

const createMemoryStorage = () => {
  const values = new Map()

  return {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
    removeItem: async key => values.delete(key)
  }
}

test('app logger writes newest entries first and caps stored logs', async () => {
  let tick = 0
  const logger = createAppLogger({
    storage: createMemoryStorage(),
    maxEntries: 2,
    now: () => new Date(Date.UTC(2026, 4, 12, 1, tick++)),
    idFactory: () => `log-${tick}`
  })

  await logger.info('timer', 'start requested', { phase: 1 })
  await logger.warn('permissions', 'permission missing', { id: 'exactAlarm' })
  await logger.error('alarm', 'schedule failed', new Error('denied'))

  assert.deepEqual(
    (await logger.getLogs()).map(log => ({
      id: log.id,
      level: log.level,
      module: log.module,
      message: log.message
    })),
    [
      {
        id: 'log-3',
        level: 'error',
        module: 'alarm',
        message: 'schedule failed'
      },
      {
        id: 'log-2',
        level: 'warn',
        module: 'permissions',
        message: 'permission missing'
      }
    ]
  )
})

test('app logger serializes Error details into readable metadata', async () => {
  const logger = createAppLogger({
    storage: createMemoryStorage(),
    now: () => new Date(Date.UTC(2026, 4, 12, 1, 0)),
    idFactory: () => 'fixed-id'
  })

  await logger.error('alarm', 'schedule failed', new Error('No exact alarm'))
  const [log] = await logger.getLogs()

  assert.equal(log.details.name, 'Error')
  assert.equal(log.details.message, 'No exact alarm')
  assert.match(log.details.stack, /No exact alarm/)
})

test('app logger serializes nested Error details', async () => {
  const logger = createAppLogger({
    storage: createMemoryStorage(),
    idFactory: () => 'fixed-id'
  })

  await logger.error('permissions', 'open setting failed', {
    action: 'openExactAlarmSettings',
    error: new Error('Activity not found')
  })
  const [log] = await logger.getLogs()

  assert.equal(log.details.action, 'openExactAlarmSettings')
  assert.equal(log.details.error.name, 'Error')
  assert.equal(log.details.error.message, 'Activity not found')
})

test('app logger clears persisted logs', async () => {
  const logger = createAppLogger({
    storage: createMemoryStorage(),
    idFactory: () => 'fixed-id'
  })

  await logger.info('timer', 'started')
  await logger.clearLogs()

  assert.deepEqual(await logger.getLogs(), [])
})

test('formatLogsForCopy creates stable text for selected logs', () => {
  assert.equal(
    formatLogsForCopy([
      {
        timestamp: '2026-05-12T02:00:00.000Z',
        level: 'error',
        module: 'alarm',
        message: 'schedule failed',
        details: {
          code: 'ERR_ANDROID_EXACT_ALARM_PERMISSION',
          seconds: 6
        }
      },
      {
        timestamp: '2026-05-12T02:01:00.000Z',
        level: 'info',
        module: 'appState',
        message: 'app state changed',
        details: null
      }
    ]),
    [
      '[2026-05-12T02:00:00.000Z] ERROR alarm - schedule failed',
      '{',
      '  "code": "ERR_ANDROID_EXACT_ALARM_PERMISSION",',
      '  "seconds": 6',
      '}',
      '',
      '[2026-05-12T02:01:00.000Z] INFO appState - app state changed'
    ].join('\n')
  )
})
