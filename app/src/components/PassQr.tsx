// A guest's door pass QR (supabase/migrations/0005), drawn the same way as the web invite page (invite.html drawPass):
// the link <site>/door.html#p=<key>, error correction M, black on white, a 4-module quiet zone, square.
// The door scans it (door/Scanner) and looks the key up with door_pass_lookup_v2.
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { config } from '../lib/config';
import qrcode from '../lib/vendor/qrcode';

export const passLink = (key: string) => `${config.siteUrl}/door.html#p=${key}`;
/** "SN-4821" */
export const passCode = (code: string | null | undefined) => (code ? 'SN-' + String(code).replace(/\D/g, '') : '');

export function PassQr({ value, size = 232, label }: { value: string; size?: number; label: string }) {
  const { d, N } = useMemo(() => {
    const q = qrcode(0, 'M'); q.addData(value, 'Byte'); q.make();
    const n = q.getModuleCount(), quiet = 4;
    let p = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c)) continue;
      let w = 1; while (c + w < n && q.isDark(r, c + w)) w++;
      p += `M${c + quiet} ${r + quiet}h${w}v1h-${w}z`; c += w - 1;
    }
    return { d: p, N: n + quiet * 2 };
  }, [value]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size, backgroundColor: '#FFFFFF', direction: 'ltr' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${N} ${N}`}>
        <Rect x={0} y={0} width={N} height={N} fill="#FFFFFF" />
        <Path d={d} fill="#000000" />
      </Svg>
    </View>
  );
}
