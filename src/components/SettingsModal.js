import { View } from 'react-native'
import { Button, Modal, Text, TextInput } from 'react-native-paper'
import styles from '../styles/appStyles'

export default function SettingsModal({
  visible,
  tempSettings,
  setTempSettings,
  onDismiss,
  onSave,
  onFillTestSettings,
  showTestSettings
}) {
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      contentContainerStyle={styles.modalContent}
    >
      <Text variant="headlineSmall" style={styles.modalTitle}>
        配置时间
      </Text>
      {showTestSettings && onFillTestSettings ? (
        <Button
          mode="outlined"
          onPress={onFillTestSettings}
          style={styles.testSettingsButton}
        >
          填入测试值 0.11 分钟
        </Button>
      ) : null}
      <TextInput
        label="泡水时间（分钟）"
        value={tempSettings.soakTime.toString()}
        onChangeText={text =>
          setTempSettings({
            ...tempSettings,
            soakTime: text
          })
        }
        keyboardType="decimal-pad"
        style={styles.input}
      />
      <TextInput
        label="大火熬药时间（分钟）"
        value={tempSettings.highHeatTime.toString()}
        onChangeText={text =>
          setTempSettings({
            ...tempSettings,
            highHeatTime: text
          })
        }
        keyboardType="decimal-pad"
        style={styles.input}
      />
      <TextInput
        label="小火熬药时间（分钟）"
        value={tempSettings.lowHeatTime.toString()}
        onChangeText={text =>
          setTempSettings({
            ...tempSettings,
            lowHeatTime: text
          })
        }
        keyboardType="decimal-pad"
        style={styles.input}
      />
      <View style={styles.modalButtons}>
        <Button mode="outlined" onPress={onDismiss} style={styles.modalButton}>
          取消
        </Button>
        <Button mode="contained" onPress={onSave} style={styles.modalButton}>
          保存
        </Button>
      </View>
    </Modal>
  )
}
