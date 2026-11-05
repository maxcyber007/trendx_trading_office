// line icons matching the EA dashboard
const S = ({ size = 20, children }: { size?: number; children: React.ReactNode }) => (
  <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const Logo = () => <S size={34}><path d="M4 20h16" /><path d="M6 17v-3M11 17v-6M16 17v-9" strokeWidth="3" /><path d="M4 11l6-5 3 3 7-6M16 3h4v4" /></S>;
export const Power = () => <S size={30}><circle cx="12" cy="12" r="10" /><path d="M12 7v5M8.6 8.8a5 5 0 1 0 6.8 0" /></S>;
export const Coins = () => <S><ellipse cx="12" cy="6" rx="7" ry="3" fill="currentColor" /><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></S>;
export const ChartUp = () => <S><path d="M4 20V14M10 20V10M16 20V7" strokeWidth="3" /><path d="M4 9l6-4 3 2 7-4" /></S>;
export const Trophy = () => <S><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" fill="currentColor" /><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 20h8" /></S>;
export const Signal = () => <S><path d="M4 20v-4M9 20v-8M14 20V8M19 20V4" strokeWidth="3.5" /></S>;
export const Neural = () => <S><circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><circle cx="12" cy="12" r="2.5" /><path d="M7 7l3 3M7 17l3-3M17 7l-3 3M17 17l-3-3" /></S>;
export const Shield = () => <S><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z" /><path d="M9 12l2 2 4-4" /></S>;
export const Clock = () => <S><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>;
export const Calendar = () => <S><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></S>;
export const Pulse = () => <S><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M6 12h3l2-4 3 8 2-4h2" /></S>;
export const AiChip = ({ size = 22 }: { size?: number }) => <S size={size}><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /><text x="12" y="15" textAnchor="middle" fontSize="7" stroke="none" fill="currentColor" fontWeight="700">AI</text></S>;
export const Person = () => <S size={34}><circle cx="12" cy="8" r="4" fill="currentColor" /><path d="M4 21c1-5 4-7 8-7s7 2 8 7Z" fill="currentColor" /></S>;
