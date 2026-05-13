import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { registerRootComponent } from 'expo'

import App from './App'

const APP_MODIFICATION_VERSION = '修改版 2026-05-12 锁屏闹钟 v7 showIntent'

function VersionedApp() {
  return (
    <View style={styles.root}>
      <App />
      <View pointerEvents="none" style={styles.versionBadge}>
        <Text style={styles.versionText}>{APP_MODIFICATION_VERSION}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  versionBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.55)'
  },
  versionText: {
    color: '#fff',
    fontSize: 11
  }
})

// registerRootComponent calls AppRegistry.registerComponent('main', () => VersionedApp);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
registerRootComponent(VersionedApp)
