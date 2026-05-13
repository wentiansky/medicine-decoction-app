const DEFAULT_LOG_PAGE_SIZE = 20

const getVisibleLogs = (
  logs,
  visibleCount = DEFAULT_LOG_PAGE_SIZE
) => {
  const safeLogs = Array.isArray(logs) ? logs : []
  return safeLogs.slice(0, Math.max(0, visibleCount))
}

const getNextVisibleCount = (
  currentVisibleCount,
  totalCount,
  pageSize = DEFAULT_LOG_PAGE_SIZE
) => {
  const safeCurrent = Math.max(0, currentVisibleCount || 0)
  const safeTotal = Math.max(0, totalCount || 0)
  const safePageSize = Math.max(1, pageSize || DEFAULT_LOG_PAGE_SIZE)

  return Math.min(safeTotal, safeCurrent + safePageSize)
}

module.exports = {
  DEFAULT_LOG_PAGE_SIZE,
  getNextVisibleCount,
  getVisibleLogs
}
