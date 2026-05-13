const assert = require('node:assert/strict')
const test = require('node:test')

const {
  DEFAULT_LOG_PAGE_SIZE,
  getNextVisibleCount,
  getVisibleLogs
} = require('./logPagination')

const createLogs = count =>
  Array.from({ length: count }, (_, index) => ({
    id: `log-${index + 1}`,
    message: `message-${index + 1}`
  }))

test('getVisibleLogs returns only the first page by default', () => {
  const logs = createLogs(30)

  assert.deepEqual(
    getVisibleLogs(logs).map(log => log.id),
    createLogs(DEFAULT_LOG_PAGE_SIZE).map(log => log.id)
  )
})

test('getVisibleLogs returns all logs when visible count exceeds total', () => {
  const logs = createLogs(8)

  assert.deepEqual(getVisibleLogs(logs, 20), logs)
})

test('getNextVisibleCount advances by one page without exceeding total logs', () => {
  assert.equal(getNextVisibleCount(20, 65), 40)
  assert.equal(getNextVisibleCount(40, 65), 60)
  assert.equal(getNextVisibleCount(60, 65), 65)
  assert.equal(getNextVisibleCount(65, 65), 65)
})
