import { useEffect, useState } from 'react'
import { Alert, Clipboard, ScrollView, StyleSheet, View } from 'react-native'
import { Button, Card, Checkbox, Text } from 'react-native-paper'
const { formatLogsForCopy } = require('./appLogger')
const {
  DEFAULT_LOG_PAGE_SIZE,
  getNextVisibleCount,
  getVisibleLogs
} = require('./logPagination')

const levelColors = {
  info: '#2563EB',
  warn: '#B45309',
  error: '#B91C1C'
}

const formatTimestamp = timestamp => {
  try {
    return new Date(timestamp).toLocaleString()
  } catch (error) {
    return timestamp
  }
}

export default function LogScreen({ logger }) {
  const [logs, setLogs] = useState([])
  const [selectedLogIds, setSelectedLogIds] = useState(new Set())
  const [visibleCount, setVisibleCount] = useState(DEFAULT_LOG_PAGE_SIZE)

  const visibleLogs = getVisibleLogs(logs, visibleCount)
  const selectedLogs = visibleLogs.filter(log => selectedLogIds.has(log.id))
  const isSelecting = selectedLogIds.size > 0
  const hasMoreLogs = visibleLogs.length < logs.length

  const loadLogs = async () => {
    const nextLogs = await logger.getLogs()
    setLogs(nextLogs)
    setVisibleCount(DEFAULT_LOG_PAGE_SIZE)
    setSelectedLogIds(new Set())
  }

  const clearLogs = async () => {
    await logger.clearLogs()
    setLogs([])
    setSelectedLogIds(new Set())
    setVisibleCount(DEFAULT_LOG_PAGE_SIZE)
  }

  const toggleLogSelection = logId => {
    setSelectedLogIds(prev => {
      const next = new Set(prev)
      if (next.has(logId)) {
        next.delete(logId)
      } else {
        next.add(logId)
      }
      return next
    })
  }

  const selectAllLogs = () => {
    setSelectedLogIds(new Set(visibleLogs.map(log => log.id)))
  }

  const cancelSelection = () => {
    setSelectedLogIds(new Set())
  }

  const copySelectedLogs = () => {
    if (selectedLogs.length === 0) return

    Clipboard.setString(formatLogsForCopy(selectedLogs))
    Alert.alert('已复制', `已复制 ${selectedLogs.length} 条日志`)
  }

  const loadMoreLogs = () => {
    setVisibleCount(current => getNextVisibleCount(current, logs.length))
  }

  useEffect(() => {
    loadLogs()
  }, [])

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        {isSelecting ? (
          <>
            <Button
              mode="contained"
              onPress={copySelectedLogs}
              style={styles.actionButton}
            >
              复制选中
            </Button>
            <Button
              mode="outlined"
              onPress={selectAllLogs}
              style={styles.compactButton}
            >
              全选
            </Button>
            <Button
              mode="outlined"
              onPress={cancelSelection}
              style={styles.compactButton}
            >
              取消
            </Button>
          </>
        ) : (
          <>
            <Button mode="outlined" onPress={loadLogs} style={styles.actionButton}>
              刷新
            </Button>
            <Button mode="outlined" onPress={clearLogs} style={styles.actionButton}>
              清空
            </Button>
          </>
        )}
      </View>

      {isSelecting && (
        <Text variant="labelMedium" style={styles.selectionCount}>
          已选择 {selectedLogs.length} 条，当前页 {visibleLogs.length}/{logs.length} 条
        </Text>
      )}

      {!isSelecting && logs.length > 0 && (
        <Text variant="labelMedium" style={styles.selectionCount}>
          当前显示 {visibleLogs.length}/{logs.length} 条
        </Text>
      )}

      <ScrollView style={styles.list}>
        {logs.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Card.Content>
              <Text variant="bodyLarge" style={styles.emptyText}>
                暂无运行日志
              </Text>
            </Card.Content>
          </Card>
        ) : (
          visibleLogs.map(log => (
            <Card
              key={log.id}
              style={[
                styles.logCard,
                selectedLogIds.has(log.id) && styles.selectedLogCard
              ]}
            >
              <Card.Content>
                <View style={styles.logHeader}>
                  <Checkbox
                    status={
                      selectedLogIds.has(log.id) ? 'checked' : 'unchecked'
                    }
                    onPress={() => toggleLogSelection(log.id)}
                  />
                  <Text
                    variant="labelLarge"
                    style={[
                      styles.level,
                      { color: levelColors[log.level] || levelColors.info }
                    ]}
                  >
                    {log.level.toUpperCase()}
                  </Text>
                  <Text variant="labelMedium" style={styles.module}>
                    {log.module}
                  </Text>
                </View>
                <Text variant="bodyLarge" style={styles.message}>
                  {log.message}
                </Text>
                <Text variant="labelSmall" style={styles.timestamp}>
                  {formatTimestamp(log.timestamp)}
                </Text>
                {log.details ? (
                  <Text selectable style={styles.details}>
                    {JSON.stringify(log.details, null, 2)}
                  </Text>
                ) : null}
              </Card.Content>
            </Card>
          ))
        )}

        {hasMoreLogs ? (
          <Button
            mode="outlined"
            onPress={loadMoreLogs}
            style={styles.loadMoreButton}
          >
            加载更多日志
          </Button>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  actionButton: {
    flex: 1
  },
  compactButton: {
    minWidth: 76
  },
  selectionCount: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    color: '#4B5563'
  },
  list: {
    flex: 1,
    paddingHorizontal: 16
  },
  emptyCard: {
    marginTop: 16
  },
  emptyText: {
    textAlign: 'center',
    color: '#666'
  },
  logCard: {
    marginBottom: 12
  },
  selectedLogCard: {
    backgroundColor: '#EEF2FF'
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6
  },
  level: {
    fontWeight: 'bold'
  },
  module: {
    color: '#4B5563'
  },
  message: {
    marginBottom: 6,
    color: '#111827'
  },
  timestamp: {
    color: '#6B7280'
  },
  details: {
    marginTop: 8,
    padding: 10,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    color: '#374151',
    fontSize: 12
  },
  loadMoreButton: {
    marginVertical: 16
  }
})
