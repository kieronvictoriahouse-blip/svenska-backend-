import { NextRequest, NextResponse } from 'next/server';

/* ═══════════════════════════════════════════════════════════════
   SUSPENSION RÉVERSIBLE — le disjoncteur contractuel de Shopflow

   Quand un abonnement n'est plus payé, le control plane pose
   SHOPFLOW_SUSPENDED=1 sur l'instance et redéploie. À partir de là :

     — la vente est COUPÉE : toute écriture API (checkout en tête)
       répond 402 en français ;
     — l'admin reste en LECTURE : le commerçant voit ses données,
       rien ne lui est confisqué ;
     — AUCUNE donnée n'est touchée. Retirer la variable et redéployer
       remet tout en marche à l'identique. C'est la promesse.

   Restent ouverts sous suspension : la connexion admin (sinon le
   commerçant ne voit même plus l'écran qui lui explique), et
   /api/public-config qui porte le drapeau `suspendu` à la vitrine.
   ═══════════════════════════════════════════════════════════════ */

const suspendu = () => process.env.SHOPFLOW_SUSPENDED === '1';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (suspendu() && pathname.startsWith('/api')) {
    const lecture = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    const toujoursOuvert =
      pathname.startsWith('/api/auth') ||
      pathname === '/api/public-config' ||
      /* Un paiement engagé AVANT la suspension doit atterrir : les
         webhooks Stripe (signés) restent ouverts, sinon l'argent est
         pris et la commande jamais soldée. */
      pathname.startsWith('/api/webhook');

    if (!toujoursOuvert && (!lecture || pathname.startsWith('/api/checkout'))) {
      return NextResponse.json(
        {
          error: 'Boutique suspendue : l’abonnement Shopflow doit être régularisé. ' +
                 'Les données sont intactes et la boutique sera réactivée dès régularisation.',
          suspendu: true,
        },
        { status: 402, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } }
      );
    }
  }

  // Protège toutes les routes /admin sauf le login
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const token = req.cookies.get('sd_admin_token')?.value;
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};
