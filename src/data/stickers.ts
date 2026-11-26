export interface HealingSticker {
  id: string;
  zh: string;
  en: string;
  accent: string;
  svg: string;
}

export const HEALING_STICKERS: HealingSticker[] = [
  {
    id: 'north-star',
    zh: '北极星',
    en: 'North Star',
    accent: '#FFD984',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="24" fill="#FFD984" fill-opacity="0.16"/><path d="M32 8L36.5 27.5L56 32L36.5 36.5L32 56L27.5 36.5L8 32L27.5 27.5L32 8Z" fill="#FFE29A" stroke="#FFF4D1" stroke-width="1.5"/></svg>`,
  },
  {
    id: 'sky-lantern',
    zh: '孔明灯',
    en: 'Sky Lantern',
    accent: '#FF9E57',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 18C20 12 44 12 44 18L48 38C48 44 41 48 32 48C23 48 16 44 16 38L20 18Z" fill="#FF9E57" fill-opacity="0.85" stroke="#FFE2B3" stroke-width="2"/><ellipse cx="32" cy="46" rx="8" ry="3" fill="#FFD984"/><circle cx="32" cy="36" r="5" fill="#FFF4C2"/></svg>`,
  },
  {
    id: 'hot-cocoa',
    zh: '热可可',
    en: 'Hot Cocoa',
    accent: '#F5B889',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16 26H44V42C44 48 39 52 30 52C21 52 16 48 16 42V26Z" fill="#D98A5C" stroke="#FFE8D4" stroke-width="2"/><path d="M44 30H49C52 30 53 33 53 35.5C53 38 51 41 48 41H44" stroke="#FFE8D4" stroke-width="2.5" stroke-linecap="round"/><path d="M24 20C24 16 27 16 27 12M31 19C31 15 34 15 34 11M38 20C38 16 41 16 41 12" stroke="#FFE8D4" stroke-width="2" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'crescent-moon',
    zh: '弯月亮',
    en: 'Crescent',
    accent: '#C9DCFF',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M41 44C29.4 44 20 34.6 20 23C20 18.6 21.4 14.5 23.8 11.1C16.2 14.2 11 21.7 11 30.4C11 41.9 20.3 51.2 31.8 51.2C40.5 51.2 48 45.9 51.1 38.4C47.9 41.9 44.6 44 41 44Z" fill="#FFE6A8" stroke="#FFF6DB" stroke-width="1.8"/><circle cx="44" cy="20" r="2.2" fill="#DCE9FF"/><circle cx="49" cy="27" r="1.4" fill="#DCE9FF"/></svg>`,
  },
  {
    id: 'snow-pine',
    zh: '雪松树',
    en: 'Snow Pine',
    accent: '#9CD4B6',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M32 10L45 27H38L48 40H40L50 51H14L24 40H16L26 27H19L32 10Z" fill="#5D9B84" stroke="#DFF5EA" stroke-width="1.8" stroke-linejoin="round"/><rect x="29" y="51" width="6" height="6" rx="1.5" fill="#B57B52"/><circle cx="32" cy="10" r="3" fill="#FFD984"/></svg>`,
  },
  {
    id: 'paper-plane',
    zh: '纸飞机',
    en: 'Paper Plane',
    accent: '#A9CBFF',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 31L54 14L41 50L29 37L10 31Z" fill="#CFE2FF" stroke="#FFFFFF" stroke-width="1.8" stroke-linejoin="round"/><path d="M54 14L29 37V48L36 41" stroke="#6E95D6" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'snowman',
    zh: '小雪人',
    en: 'Snowman',
    accent: '#E2EEFF',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="43" r="12" fill="#EDF4FF" stroke="#BCD3FA" stroke-width="1.8"/><circle cx="32" cy="24" r="8.5" fill="#F5F9FF" stroke="#BCD3FA" stroke-width="1.8"/><path d="M24 31C28 33.5 36 33.5 40 31" stroke="#FF8A65" stroke-width="3.2" stroke-linecap="round"/><circle cx="29" cy="22.5" r="1.2" fill="#233359"/><circle cx="35" cy="22.5" r="1.2" fill="#233359"/><path d="M32 24.5L36.5 26" stroke="#FF9E57" stroke-width="2" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'warm-cat',
    zh: '暖橘猫',
    en: 'Cozy Cat',
    accent: '#FFB574',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 28L21 15L30 22H34L43 15L46 28C49 32 49 44 42 48C37 51 27 51 22 48C15 44 15 32 18 28Z" fill="#F7B277" stroke="#FFE7CE" stroke-width="1.8" stroke-linejoin="round"/><circle cx="26" cy="33" r="1.8" fill="#3B2518"/><circle cx="38" cy="33" r="1.8" fill="#3B2518"/><path d="M29 38C31 40 33 40 35 38" stroke="#3B2518" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'wish-jar',
    zh: '星光瓶',
    en: 'Star Jar',
    accent: '#FFE08A',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="11" width="16" height="6" rx="2" fill="#C99A6B"/><path d="M22 20H42L45 27V48C45 51.5 42 54 38.5 54H25.5C22 54 19 51.5 19 48V27L22 20Z" fill="#9BC3FF" fill-opacity="0.22" stroke="#D7E7FF" stroke-width="1.8"/><circle cx="31" cy="37" r="4" fill="#FFE08A"/><circle cx="37" cy="43" r="2.2" fill="#FFF3C4"/><circle cx="27" cy="44" r="1.8" fill="#FFF3C4"/></svg>`,
  },
  {
    id: 'snowflake',
    zh: '冬雪结',
    en: 'Snowflake',
    accent: '#BCE0FF',
    svg: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M32 10V54M13 21L51 43M51 21L13 43" stroke="#D6ECFF" stroke-width="2.4" stroke-linecap="round"/><circle cx="32" cy="32" r="5" fill="#93C5FD" stroke="#FFFFFF" stroke-width="1.8"/></svg>`,
  },
];

export function getStickerById(id: string | null | undefined): HealingSticker | undefined {
  if (!id) return undefined;
  return HEALING_STICKERS.find((s) => s.id === id);
}
