import { View } from 'react-native'
import { Button, IconButton, Modal, Text } from 'react-native-paper'
import styles from '../styles/appStyles'

export default function PermissionGuideModal({
  visible,
  visiblePermissionScenarioCards,
  hasPendingBackgroundReminder,
  currentPermissionGuide,
  permissionGuidePrimaryIssue,
  shouldShowPermissionRecheckButton,
  onDismiss,
  onOpenSetting,
  onRecheck
}) {
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      contentContainerStyle={styles.permissionGuide}
    >
      <View style={styles.permissionGuideHeader}>
        <Text variant="headlineSmall" style={styles.permissionGuideTitle}>
          开启可靠提醒
        </Text>
        <IconButton
          icon="close"
          size={20}
          onPress={onDismiss}
          style={styles.permissionGuideCloseButton}
        />
      </View>
      <Text variant="bodyMedium" style={styles.permissionGuideText}>
        为了在不同场景下都及时提醒你，建议按下面的步骤逐步开启权限。
      </Text>
      {visiblePermissionScenarioCards.map(card => (
        <View key={card.id} style={styles.permissionScenarioCard}>
          <View style={styles.permissionScenarioHeader}>
            <Text style={styles.permissionScenarioTitle}>
              {card.id === 'lockScreenReminder' && !hasPendingBackgroundReminder
                ? '锁屏提醒'
                : card.title}
            </Text>
            <View
              style={[
                styles.permissionScenarioBadge,
                card.completed
                  ? styles.permissionScenarioBadgeDone
                  : styles.permissionScenarioBadgePending
              ]}
            >
              <Text
                style={[
                  styles.permissionScenarioBadgeText,
                  card.completed
                    ? styles.permissionScenarioBadgeTextDone
                    : styles.permissionScenarioBadgeTextPending
                ]}
              >
                {card.statusText}
              </Text>
            </View>
          </View>
          <Text style={styles.permissionScenarioDetail}>{card.detail}</Text>
          {card.id === 'lockScreenReminder' &&
          !card.completed &&
          card.missingTitles.length > 0 ? (
            <Text style={styles.permissionScenarioMissing}>
              还需开启：{card.missingTitles.join('、')}
            </Text>
          ) : null}
        </View>
      ))}
      <View style={styles.permissionGuideHint}>
        <Text style={styles.permissionGuideHintTitle}>下一步怎么操作</Text>
        <Text style={styles.permissionGuideHintText}>
          {currentPermissionGuide.settingHint}
        </Text>
      </View>
      <Button
        mode="contained"
        onPress={() => onOpenSetting(permissionGuidePrimaryIssue)}
        style={styles.permissionGuideButton}
      >
        去开启权限
      </Button>
      {shouldShowPermissionRecheckButton ? (
        <Button mode="outlined" onPress={onRecheck} style={styles.permissionGuideButton}>
          重新检测
        </Button>
      ) : null}
      <Button mode="text" onPress={onDismiss} style={styles.permissionGuideButton}>
        稍后再说
      </Button>
    </Modal>
  )
}
