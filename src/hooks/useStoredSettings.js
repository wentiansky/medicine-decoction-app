import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const { DEFAULT_SETTINGS, normalizeSettings } = require('../timerCore')

export default function useStoredSettings({ writeLog }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [tempSettings, setTempSettings] = useState(DEFAULT_SETTINGS)
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem('medicineSettings')
      if (stored) {
        const parsed = normalizeSettings(JSON.parse(stored))
        setSettings(parsed)
        setTempSettings(parsed)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  const openSettingsModal = () => {
    setTempSettings(settings)
    setShowSettingsModal(true)
  }

  const closeSettingsModal = () => {
    setShowSettingsModal(false)
  }

  const saveSettings = async () => {
    const safeSettings = normalizeSettings(tempSettings)
    try {
      await AsyncStorage.setItem('medicineSettings', JSON.stringify(safeSettings))
      writeLog('info', 'settings', 'settings saved', safeSettings)
      setSettings(safeSettings)
      setTempSettings(safeSettings)
      setShowSettingsModal(false)
    } catch (error) {
      console.error('Error saving settings:', error)
      writeLog('error', 'settings', 'failed to save settings', error)
    }
  }

  const fillTestSettings = __DEV__
    ? () => {
        const testSettings = {
          soakTime: 0.11,
          highHeatTime: 0.11,
          lowHeatTime: 0.11
        }
        setTempSettings(testSettings)
        writeLog('info', 'settings', 'test settings filled', testSettings)
      }
    : null

  return {
    settings,
    tempSettings,
    setTempSettings,
    showSettingsModal,
    openSettingsModal,
    closeSettingsModal,
    saveSettings,
    fillTestSettings
  }
}
