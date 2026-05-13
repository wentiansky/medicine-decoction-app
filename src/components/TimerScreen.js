import { Platform, ScrollView, View } from 'react-native'
import { Button, Card, Text } from 'react-native-paper'
import styles from '../styles/appStyles'

export default function TimerScreen({
  flowComplete,
  phases,
  isRunning,
  isWaitingForContinue,
  currentPhase,
  timeLeft,
  currentPhaseInfo,
  displaySeconds,
  formatTime,
  onOpenPermissionGuide,
  onStartTimer,
  onPauseTimer,
  onStopTimer,
  onRestartTimer
}) {
  const isInitialState =
    !isRunning && !isWaitingForContinue && currentPhase === 1 && timeLeft === 0

  return (
    <ScrollView style={styles.content}>
      {Platform.OS === 'android' && (
        <View style={styles.permissionBanner}>
          <View style={styles.permissionBannerIcon}>
            <Text style={styles.permissionBannerIconText}>权</Text>
          </View>
          <Text style={styles.permissionBannerText} numberOfLines={1}>
            后台/锁屏提醒权限可按需开启
          </Text>
          <Button
            mode="contained-tonal"
            compact
            onPress={onOpenPermissionGuide}
            style={styles.permissionBannerButton}
            labelStyle={styles.permissionBannerButtonLabel}
          >
            开启
          </Button>
        </View>
      )}

      {flowComplete ? (
        <View style={styles.timerContainer}>
          <Card style={styles.completeCard}>
            <Card.Content style={styles.completeContent}>
              <Text variant="displaySmall" style={styles.completeTitle}>
                熬药完成
              </Text>
              <Text variant="headlineSmall" style={styles.completeMark}>
                全部阶段已完成
              </Text>
              <Text variant="bodyLarge" style={styles.completeText}>
                可以关火收药了
              </Text>
            </Card.Content>
          </Card>
          <Card style={styles.progressCard}>
            <Card.Content>
              <Text variant="labelMedium">进度</Text>
              <View style={styles.progressBar}>
                {phases.map(phase => (
                  <View
                    key={phase.id}
                    style={[styles.progressDot, { backgroundColor: '#4CAF50' }]}
                  />
                ))}
              </View>
            </Card.Content>
          </Card>
        </View>
      ) : isInitialState ? (
        <View style={styles.startContainer}>
          <Text variant="displayMedium" style={styles.welcomeText}>
            熬中药计时器
          </Text>
          <Text variant="bodyLarge" style={styles.descText}>
            准备好开始熬中药了吗？
          </Text>
          <Card style={styles.scheduleCard}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.cardTitle}>
                今天的流程
              </Text>
              {phases.map((phase, index) => (
                <Text key={index} style={styles.phaseText}>
                  • {phase.shortName}: {phase.description}
                </Text>
              ))}
            </Card.Content>
          </Card>
        </View>
      ) : (
        <View style={styles.timerContainer}>
          <Card style={styles.timerCard}>
            <Card.Content style={styles.timerContent}>
              {currentPhase <= 7 ? (
                <>
                  <Text variant="headlineSmall" style={styles.phaseName}>
                    {currentPhaseInfo.name}
                  </Text>
                  {currentPhaseInfo.subtitle ? (
                    <Text variant="titleMedium" style={styles.phaseSubtitle}>
                      {currentPhaseInfo.subtitle}
                    </Text>
                  ) : null}
                  <Text variant="displayLarge" style={styles.timer}>
                    {formatTime(displaySeconds)}
                  </Text>
                </>
              ) : (
                <>
                  <Text variant="headlineSmall">✓ 完成！</Text>
                  <Text variant="bodyLarge">所有阶段已完成</Text>
                </>
              )}
            </Card.Content>
          </Card>

          {currentPhase <= 7 ? (
            <Card style={styles.progressCard}>
              <Card.Content>
                <Text variant="labelMedium">进度</Text>
                <View style={styles.progressBar}>
                  {phases.map((phase, index) => (
                    <View
                      key={index}
                      style={[
                        styles.progressDot,
                        {
                          backgroundColor:
                            phase.id < currentPhase
                              ? '#4CAF50'
                              : phase.id === currentPhase
                                ? '#2196F3'
                                : '#E0E0E0'
                        }
                      ]}
                    />
                  ))}
                </View>
              </Card.Content>
            </Card>
          ) : null}
        </View>
      )}

      <View style={styles.buttonContainer}>
        {flowComplete ? (
          <>
            <Button
              mode="contained"
              onPress={onRestartTimer}
              style={styles.button}
              labelStyle={styles.buttonLabel}
            >
              重新开始
            </Button>
            <Button
              mode="outlined"
              onPress={onStopTimer}
              style={styles.button}
              labelStyle={styles.buttonLabel}
            >
              重置
            </Button>
          </>
        ) : isInitialState ? (
          <Button
            mode="contained"
            onPress={onStartTimer}
            style={styles.button}
            labelStyle={styles.buttonLabel}
          >
            开始熬中药
          </Button>
        ) : (
          <>
            {isRunning && !isWaitingForContinue ? (
              <Button
                mode="contained"
                onPress={onPauseTimer}
                style={styles.button}
                labelStyle={styles.buttonLabel}
              >
                暂停
              </Button>
            ) : (
              <Button
                mode="contained"
                onPress={onStartTimer}
                style={styles.button}
                labelStyle={styles.buttonLabel}
              >
                继续
              </Button>
            )}
            <Button
              mode="outlined"
              onPress={onStopTimer}
              style={styles.button}
              labelStyle={styles.buttonLabel}
            >
              重置
            </Button>
          </>
        )}
      </View>
    </ScrollView>
  )
}
