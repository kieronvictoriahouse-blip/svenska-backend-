import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Tableau de bord administration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
