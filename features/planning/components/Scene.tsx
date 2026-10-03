import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import type { SceneKind } from '@/lib/ai';

/**
 * Simple illustrated picture for a trip option (prototype .photo). Fills any box:
 * the drawing keeps its shape at the bottom and the sky colour fills the space above.
 * `banner` centres it instead, for short strips like the winner card.
 */
export function Scene({ kind, banner }: { kind: SceneKind; banner?: boolean }) {
  return (
    <View style={[styles.box, banner && { justifyContent: 'center' }, { backgroundColor: SKIES[kind][0] }]}>
      <View style={styles.drawing}>
        <Drawing kind={kind} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden', justifyContent: 'flex-end' },
  drawing: { width: '100%', aspectRatio: 358 / 210 },
});

function Drawing({ kind }: { kind: SceneKind }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 358 210" preserveAspectRatio="xMidYMax slice">
      <Defs>
        <LinearGradient id={`sky-${kind}`} x1="0" y1="0" x2="0" y2="1">
          {SKIES[kind].map((c, i, all) => (
            <Stop key={c} offset={i / (all.length - 1)} stopColor={c} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x={-20} y={0} width={400} height={210} fill={`url(#sky-${kind})`} />
      {DRAW[kind]()}
    </Svg>
  );
}

const SKIES: Record<SceneKind, string[]> = {
  temple: ['#BFE3F4', '#7CC3E3', '#3D93BF'],
  island: ['#B7E1F4', '#7CC3E3', '#4FA6D3'],
  beach: ['#A9D8F0', '#5FB1DA', '#2C86B8'],
  city: ['#FFD9A8', '#F3A87C', '#7A6FB0'],
  heritage: ['#CDEBF8', '#9AD2EC', '#6DB7DE'],
  highlands: ['#E1F1F7', '#BFE1EE', '#9CCFE3'],
};

const sun = (cx: number, cy: number, fill = '#FFE39A') => <Circle cx={cx} cy={cy} r={18} fill={fill} opacity={0.9} />;

const DRAW: Record<SceneKind, () => React.ReactNode> = {
  temple: () => (
    <G>
      {sun(70, 48)}
      <Path d="M-20 150 C 60 70, 140 80, 200 120 S 320 60, 380 130 L380 210 L-20 210Z" fill="#3E8A52" opacity={0.85} />
      <Path d="M-20 175 C 80 120, 180 150, 260 130 S 360 120, 380 160 L380 210 L-20 210Z" fill="#2F6E3E" />
      <Rect x={248} y={112} width={22} height={70} fill="#F6F1E4" stroke="#B89B5A" strokeWidth={1} />
      <Path d="M240 118 L278 118 L259 104 Z" fill="#C8443A" />
      <Path d="M242 135 L276 135 L259 124 Z" fill="#C8443A" />
      <Path d="M244 152 L274 152 L259 142 Z" fill="#C8443A" />
      <Path d="M246 169 L272 169 L259 160 Z" fill="#C8443A" />
      <Rect x={257} y={96} width={4} height={10} fill="#E8B84A" />
      <Path d="M-20 195 C 60 185, 120 205, 200 195 S 320 185, 380 195 L380 210 L-20 210Z" fill="#2C86B8" />
      <Path d="M-20 200 C 40 194, 90 204, 150 199 L150 210 L-20 210Z" fill="#F1D8A6" />
    </G>
  ),
  island: () => (
    <G>
      {sun(290, 46)}
      <Rect x={-20} y={140} width={400} height={70} fill="#2C86B8" />
      <Path d="M30 145 C 60 80, 130 70, 170 145 Z" fill="#3E8A52" />
      <Path d="M150 145 C 190 100, 250 95, 300 145 Z" fill="#2F6E3E" />
      <Path d="M-20 160 C 80 150, 200 168, 380 156 L380 210 L-20 210Z" fill="#1F75A6" opacity={0.6} />
      <Path d="M220 172 L262 172 L254 182 L228 182 Z" fill="#FFFFFF" />
      <Path d="M240 150 L240 172 L256 168 Z" fill="#F6F1E4" />
    </G>
  ),
  beach: () => (
    <G>
      {sun(80, 52)}
      <Rect x={-20} y={128} width={400} height={82} fill="#2C86B8" />
      <Path d="M-40 210 C 40 150, 320 150, 400 210 Z" fill="#F1D8A6" />
      <Path d="M262 196 C 266 160, 272 130, 286 104" stroke="#8A6234" strokeWidth={6} fill="none" strokeLinecap="round" />
      <Path d="M286 104 C 262 92, 242 100, 232 116 C 252 104, 270 104, 286 106 Z" fill="#2F8A4C" />
      <Path d="M286 104 C 306 88, 330 92, 340 108 C 320 100, 302 100, 286 106 Z" fill="#2F8A4C" />
      <Path d="M286 104 C 280 82, 290 70, 306 66 C 294 78, 290 90, 288 104 Z" fill="#3E9E5A" />
    </G>
  ),
  city: () => (
    <G>
      {sun(110, 120, '#FFE6B5')}
      {[
        [10, 110, 34], [48, 80, 30], [82, 125, 40], [126, 60, 26], [156, 95, 38],
        [198, 70, 30], [232, 120, 34], [270, 50, 28], [302, 100, 36], [342, 85, 30],
      ].map(([x, y, w], i) => (
        <G key={x}>
          <Rect x={x} y={y} width={w} height={210 - y} fill={i % 2 ? '#24365F' : '#2E4473'} />
          {Array.from({ length: Math.floor((200 - y) / 18) }, (_, r) => (
            <Rect key={r} x={x + 6} y={y + 10 + r * 18} width={w - 12} height={4} fill="#F7D488" opacity={0.55} />
          ))}
        </G>
      ))}
    </G>
  ),
  heritage: () => (
    <G>
      {sun(300, 44)}
      {[0, 64, 128, 192, 256, 320].map((x, i) => (
        <G key={x}>
          <Rect x={x} y={110 + (i % 2) * 8} width={62} height={80} fill={i % 3 === 1 ? '#D9A441' : '#B8433A'} />
          <Path d={`M${x - 4} ${112 + (i % 2) * 8} L${x + 31} ${92 + (i % 2) * 8} L${x + 66} ${112 + (i % 2) * 8} Z`} fill="#8E2F28" />
          <Rect x={x + 10} y={128 + (i % 2) * 8} width={14} height={18} fill="#F6F1E4" />
          <Rect x={x + 38} y={128 + (i % 2) * 8} width={14} height={18} fill="#F6F1E4" />
        </G>
      ))}
      <Rect x={150} y={60} width={26} height={60} fill="#B8433A" />
      <Path d="M144 62 L163 42 L182 62 Z" fill="#8E2F28" />
      <Circle cx={163} cy={78} r={7} fill="#F6F1E4" />
      <Path d="M-20 186 C 60 180, 140 192, 220 186 S 340 180, 380 186 L380 210 L-20 210Z" fill="#3D93BF" />
    </G>
  ),
  highlands: () => (
    <G>
      {sun(290, 40, '#FFF1C2')}
      <Path d="M-20 120 C 50 70, 120 80, 180 110 S 300 60, 380 100 L380 210 L-20 210Z" fill="#9CCB98" />
      <Path d="M-20 150 C 70 110, 160 120, 230 140 S 340 120, 380 140 L380 210 L-20 210Z" fill="#5FA56A" />
      <Path d="M-20 180 C 90 150, 200 160, 380 170 L380 210 L-20 210Z" fill="#3B7F4A" />
      {[0, 1, 2, 3].map((r) => (
        <Path
          key={r}
          d={`M-20 ${162 + r * 12} C 90 ${140 + r * 12}, 220 ${150 + r * 12}, 380 ${158 + r * 12}`}
          stroke="#7FC08A"
          strokeWidth={3}
          fill="none"
          opacity={0.7}
        />
      ))}
    </G>
  ),
};
