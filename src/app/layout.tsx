import type { Metadata, Viewport } from 'next';
import { I18nProvider } from '@/lib/i18n';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://idnenz.cn';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: '星屿祈光 · Starlight Isle — 给未说出口的话与新年愿望的一座光屿',
  description:
    '在冬夜的蓝色星光浮岛上，放飞一盏孔明灯，写下未能说出口的话或新年愿望，与世界温柔问好，共候每晚本地 0 点升空的烟花。A quiet winter night island for unspoken words, new year wishes, and warm greetings.',
  openGraph: {
    title: '星屿祈光 · Starlight Isle',
    description:
      '给未说出口的话，和新年愿望的一座光屿 · A quiet island for unspoken words & new year wishes.',
    url: siteUrl,
    siteName: '星屿祈光 · Starlight Isle',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#07122b',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="starlight-backdrop overflow-x-hidden antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
