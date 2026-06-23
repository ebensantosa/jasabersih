import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JasaBersih Admin',
  description: 'Internal admin dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
