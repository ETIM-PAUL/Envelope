// Full-screen QR scanner for Send. Uses expo-camera's own barcode detection (ML Kit's on-device
// model on Android, bundled into the app), not Google's code-scanner UI, so it also works on
// phones without Google services.
import Feather from '@expo/vector-icons/Feather'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import { useRef, useState } from 'react'
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fontFamily } from '../design/tokens'
import { parseScannedCode, type ScannedCode } from '../utils/parse-scanned-code'
import { Button } from './button'

const FRAME_SIZE = 240

export function QrScanner({
  visible,
  onScanned,
  onClose,
}: {
  visible: boolean
  onScanned: (code: ScannedCode) => void
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const [permission, requestPermission] = useCameraPermissions()
  const [unrecognized, setUnrecognized] = useState(false)
  // The camera reports the same code many times a second; only the first good read counts.
  const handled = useRef(false)

  function handleShow() {
    handled.current = false
    setUnrecognized(false)
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission()
  }

  function handleBarcode({ data }: BarcodeScanningResult) {
    if (handled.current) return
    const code = parseScannedCode(data)
    if (!code) {
      setUnrecognized(true)
      return
    }
    handled.current = true
    onScanned(code)
  }

  return (
    <Modal visible={visible} animationType="slide" onShow={handleShow} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.ink[950] }}>
        {permission?.granted ? (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={visible ? handleBarcode : undefined}
            />
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
            >
              <View
                style={{
                  width: FRAME_SIZE,
                  height: FRAME_SIZE,
                  borderRadius: 24,
                  borderWidth: 3,
                  borderColor: unrecognized ? colors.seal[500] : colors.paper[500],
                }}
              />
              <Text
                className="text-paper-500 text-base mt-6 text-center px-10"
                style={{ fontFamily: fontFamily.uiSemibold }}
              >
                {unrecognized
                  ? "That QR code isn't a Solana address. Try another."
                  : 'Point at an Envelope or Solana wallet QR code'}
              </Text>
            </View>
          </>
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <Feather name="camera" size={40} color={colors.mute[500]} />
            <Text className="text-paper-500 text-xl mt-5 mb-2 text-center" style={{ fontFamily: fontFamily.display }}>
              Camera access needed
            </Text>
            <Text className="text-mute-500 text-base mb-8 text-center" style={{ fontFamily: fontFamily.ui }}>
              Envelope uses the camera only to read the QR code of the person you&apos;re paying.
            </Text>
            <View className="w-full max-w-xs">
              {permission && !permission.canAskAgain ? (
                <Button label="Open settings" onPress={() => void Linking.openSettings()} />
              ) : (
                <Button label="Allow camera" onPress={() => void requestPermission()} />
              )}
            </View>
          </View>
        )}

        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="Close scanner"
          style={{ position: 'absolute', top: insets.top + 12, left: 20 }}
          className="w-11 h-11 rounded-full bg-ink-900 items-center justify-center"
        >
          <Feather name="x" size={22} color={colors.paper[500]} />
        </Pressable>
      </View>
    </Modal>
  )
}
