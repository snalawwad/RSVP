// Figma 01 Welcome (50:13939) "Bird carrying an invitation through an open door", exported from Sama's file as SVG
// (node 50:13940) and drawn here path for path. Colours follow the theme (plum lines, soft pink, cream paper).
import Svg, { Path } from 'react-native-svg';
import { useApp } from '../providers/AppProvider';

export function WelcomeArt({ width = 350 }: { width?: number }) {
  const { c, theme } = useApp();
  const ink = c.plum, soft = c.accentSoft, rose = theme === 'dark' ? '#B98A90' : '#C58E95', paper = theme === 'dark' ? '#2A2422' : '#FFF8EA', wing = theme === 'dark' ? '#7E5258' : '#D4A1A7';
  const S = { stroke: ink, strokeLinejoin: 'round' as const };
  return (
    <Svg width={width} height={(width * 310) / 350} viewBox="0 0 350 310" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* doorway */}
      <Path d="M165 262V101C165 65 193 37 228 37C263 37 291 65 291 101V262H273V102C273 76 253 56 228 56C203 56 183 76 183 102V262H165Z" fill={soft} {...S} strokeWidth={2.5} />
      <Path d="M183 262H273" stroke={ink} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M273 102C273 76 286 73 301 91C314 106 322 123 322 143V281L273 262V102Z" fill={soft} {...S} strokeWidth={2.5} />
      <Path d="M284 113C284 97 289 96 298 108C307 120 312 132 312 147V264L284 253V113Z" stroke={rose} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M309 194V202" stroke={ink} strokeWidth={2.5} strokeLinecap="round" />
      {/* flight trail */}
      <Path d="M26 181C45 188 62 188 77 182" stroke={rose} strokeWidth={1.7} strokeLinecap="round" strokeDasharray="5 7" />
      <Path d="M39 216C62 217 79 210 91 201" stroke={rose} strokeWidth={1.7} strokeLinecap="round" strokeDasharray="5 7" />
      {/* bird */}
      <Path d="M147 184C151 204 171 218 194 220C183 205 181 190 178 177L147 184Z" fill={wing} {...S} strokeWidth={2} />
      <Path d="M132 177C111 177 87 166 62 149L76 177L57 179C78 193 101 200 126 197C146 213 175 210 192 194C202 185 205 176 216 174C226 171 231 163 228 154C225 143 214 140 204 144C194 148 191 158 182 162C165 169 150 167 132 177Z" fill={paper} {...S} strokeWidth={2.5} />
      <Path d="M132 184C113 163 108 138 111 114C113 97 111 85 104 72C129 80 145 97 153 119C161 140 171 155 188 165C174 181 154 190 132 184Z" fill={paper} {...S} strokeWidth={2.5} />
      <Path d="M119 95C130 124 128 149 151 168M119 126C123 151 132 168 146 176M120 151C124 164 130 174 137 179" stroke={ink} strokeWidth={2} strokeLinecap="round" />
      <Path d="M78 164C91 178 106 184 122 187" stroke={ink} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M228 154L240 158L227 163L228 154Z" fill={ink} {...S} strokeWidth={1.5} />
      <Path d="M217 155.2C218.215 155.2 219.2 154.215 219.2 153C219.2 151.785 218.215 150.8 217 150.8C215.785 150.8 214.8 151.785 214.8 153C214.8 154.215 215.785 155.2 217 155.2Z" fill={ink} />
      <Path d="M204 168C208 170 212 170 215 168" stroke={rose} strokeWidth={1.5} strokeLinecap="round" />
      {/* invitation */}
      <Path d="M236 158L284 165L279 201L231 194L236 158Z" fill={paper} {...S} strokeWidth={2} />
      <Path d="M232 193L254 176L279 200" stroke={rose} strokeWidth={1.4} strokeLinejoin="round" />
      <Path d="M236 158L257 182L284 165L236 158Z" fill={paper} {...S} strokeWidth={1.7} />
      <Path d="M261 180C263 183 261 187 258 187C255 189 251 186 252 183C251 180 254 177 257 178C259 177 261 178 261 180Z" fill={ink} stroke={ink} />
      <Path d="M255 181C254 183 255 185 257 185" stroke={rose} strokeLinecap="round" />
    </Svg>
  );
}
