// The door pass scanner (supabase/migrations/0005): a full-screen camera that reads the QR code on a guest's pass.
// The door screen does the rest (parse, look the pass up, open the guest's card); this screen only shows the camera,
// says why a code didn't work, and keeps scanning. No camera here (web build, simulator) → a message, never a crash.
// Camera refused → onDenied (the door shows the message under the search box).
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../../providers/AppProvider';
import { radius, size, space, toneColors } from '../../theme/tokens';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { PressScale } from '../Press';
import { Txt } from '../Txt';

type DoorT = ReturnType<typeof useApp>['t']['door'];
/** null = it worked (the door closes the scanner); a string = say this and keep scanning */
export type ScanAnswer = string | null;

const INK = '#FFFFFF', DIM = 'rgba(255,255,255,0.78)', BG = '#0F0F0F';
// a code that got a "no" is not asked about again while it stays in front of the camera; once it has been out of
// sight this long it is (someone may have fixed the list). After a failed connection the same code is retried this often.
const AGAIN_MS = 2500;

export function Scanner({ visible, t, onClose, onScanned, onDenied }: {
  visible: boolean; t: DoorT; onClose: () => void; onScanned: (data: string) => Promise<ScanAnswer>; onDenied: () => void;
}) {
  const { reduceMotion, rtl } = useApp();
  return (
    <Modal visible={visible} animationType={reduceMotion ? 'none' : 'slide'} presentationStyle="fullScreen" onRequestClose={onClose} statusBarTranslucent>
      {visible ? <ScanBody t={t} rtl={rtl} onClose={onClose} onScanned={onScanned} onDenied={onDenied} /> : null}
    </Modal>
  );
}

function ScanBody({ t, rtl, onClose, onScanned, onDenied }: { t: DoorT; rtl: boolean; onClose: () => void; onScanned: (data: string) => Promise<ScanAnswer>; onDenied: () => void }) {
  const { c } = useApp();
  const no = toneColors(c, 'no');
  const [, requestPermission] = useCameraPermissions({ get: false, request: false });
  const [phase, setPhase] = useState<'start' | 'live' | 'off'>('start');
  const [msg, setMsg] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const busy = useRef(false);
  const last = useRef<{ data: string; at: number; final: boolean } | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    (async () => {
      // the web build: only with a real camera on the computer (expo-camera's native modules don't have this check)
      if (Platform.OS === 'web') {
        let ok = false;
        try { ok = await CameraView.isAvailableAsync(); } catch { ok = false; }
        if (!alive.current) return;
        if (!ok) { setPhase('off'); return; }
      }
      let granted = false;
      try { granted = !!(await requestPermission())?.granted; } catch { granted = false; }
      if (!alive.current) return;
      if (granted) setPhase('live'); else onDenied();
    })();
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scanned = async ({ data }: BarcodeScanningResult) => {
    if (busy.current || !data) return;
    const l = last.current;
    if (l && l.data === data && Date.now() - l.at < AGAIN_MS) { if (l.final) l.at = Date.now(); return; }
    busy.current = true; setLooking(true);
    let answer: ScanAnswer = null, final = true;
    try { answer = await onScanned(data); } catch { answer = t.scanErr; }
    if (!alive.current) return;
    if (answer === t.scanErr || answer === t.err) final = false;
    last.current = { data, at: Date.now(), final };
    busy.current = false; setLooking(false);
    setMsg(answer);
  };

  const close = (
    <PressScale kind="chip" testID="scan-close" accessibilityRole="button" accessibilityLabel={t.scanBack} onPress={onClose}
      style={{ width: size.target, height: size.target, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' }}>
      <Icon name="x" color={INK} />
    </PressScale>
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG, direction: rtl ? 'rtl' : 'ltr' }} testID="scanner" accessibilityViewIsModal>
      {phase === 'live' ? (
        <CameraView style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }} facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={scanned} onMountError={() => setPhase('off')} testID="scan-camera" />
      ) : null}
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: 16, paddingTop: 8 }}>
          <View style={{ flex: 1 }}><Txt v="title" color={INK} accessibilityRole="header">{t.scanTitle}</Txt></View>
          {close}
        </View>

        {phase === 'off' ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 12 }} testID="scan-off" accessibilityLiveRegion="polite">
            <Icon name="qr" size={44} color={DIM} />
            <Txt v="name" center color={INK}>{t.camOff}</Txt>
            <View style={{ maxWidth: 320 }}><Txt v="body" center color={DIM}>{t.camOffSub}</Txt></View>
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 24 }} pointerEvents="none">
            {/* the frame to hold the code in */}
            <View style={{ width: 240, height: 240, borderRadius: 22, borderWidth: 3, borderColor: INK, backgroundColor: 'transparent' }} testID="scan-frame" />
            <View style={{ maxWidth: 300, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radius.m, paddingVertical: 8, paddingHorizontal: 14 }}>
              <Txt v="body" center color={INK}>{phase === 'start' ? t.scanLooking : t.scanHint}</Txt>
            </View>
          </View>
        )}

        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
          {looking || msg ? (
            <View testID="scan-msg" accessibilityRole="alert" accessibilityLiveRegion="assertive"
              style={{ backgroundColor: looking ? 'rgba(0,0,0,0.7)' : no.bg, borderRadius: radius.m, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {looking ? null : <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: no.mark }} />}
              <View style={{ flex: 1 }}><Txt v="body" color={looking ? INK : c.ink}>{looking ? t.scanLooking : msg!}</Txt></View>
            </View>
          ) : null}
          <Button big block kind="secondary" icon="search" label={t.scanBack} onPress={onClose} testID="scan-back" />
        </View>
      </SafeAreaView>
    </View>
  );
}
