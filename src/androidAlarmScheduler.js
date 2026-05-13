import { NativeModules, Platform } from 'react-native'

export const getAndroidAlarmModule = () => {
  if (Platform.OS !== 'android') return null
  return NativeModules.AndroidAlarmScheduler || null
}
