export const metadata = { title: 'Shopflow', description: 'Votre boutique en ligne complète, en dix minutes.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, background: '#F6F1E9' }}>{children}</body>
    </html>
  );
}
