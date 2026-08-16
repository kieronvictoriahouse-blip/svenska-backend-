import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Tableau de bord administration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* Les polices sont demandées dès le HTML, pas depuis une balise
            <style> injectée par React : par @import dans le shell, la
            requête ne partait qu'après l'hydratation.

            `display=block` sur les icônes est le point important. Sans
            lui, le navigateur affiche le texte de la ligature en police
            de repli le temps du chargement — le back-office s'ouvrait
            sur « space_dashboard », « print », « edit » écrits en toutes
            lettres à la place des icônes. Avec, la place est réservée et
            reste vide jusqu'à ce que la police arrive. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,200..600,0..1,0&display=block"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
