# Medicine Decoction Timer - Copilot Instructions

This is a React Native Expo application for timing traditional Chinese medicine decoction with system notifications.

## Project Overview
- **Type**: React Native Mobile App
- **Framework**: Expo
- **Languages**: JavaScript/JSX
- **Main Features**: Timer with notifications, configurable parameters, local storage

## Key Files
- `App.js` - Main application component with full UI and logic
- `app.json` - Expo configuration with notification plugins
- `package.json` - Dependencies and scripts
- `README.md` - User documentation

## Development Commands
- `npm start` - Start Expo development server
- `npm run ios` - Run on iOS simulator/device
- `npm run android` - Run on Android device/emulator
- `npm run web` - Run in web browser

## Key Dependencies
- react-native-paper: Material Design UI components
- expo-notifications: System notifications
- @react-native-async-storage/async-storage: Local data persistence
- react-native-safe-area-context: Safe area support

## Architecture Notes
- Single file component in App.js for simplicity
- Uses React Hooks for state management
- AsyncStorage for configuration persistence
- Expo Notifications for alarm functionality

## Testing Instructions
1. Start the app with `npm start`
2. Test basic flow: Start timer → Verify phase progression
3. Test notifications: Verify alarm sounds when phase completes
4. Test settings: Change parameters and verify persistence
5. Test pause/resume: Verify timer state is maintained

## Known Considerations
- App should stay active for accurate timing
- Notifications require permission grant on first use
- Time configuration supports custom durations for all phases
