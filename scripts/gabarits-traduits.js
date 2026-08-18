/* ═══════════════════════════════════════════════════════════════
   GÉNÉRATION DES GABARITS TRADUITS

   Les emails existent en trois langues. Plutôt que d'entretenir trois
   maquettes HTML en parallèle — où une correction de mise en page se
   perd dans deux fichiers sur trois — on garde le français comme source
   et on en dérive l'anglais et le suédois par une table de traduction.

   Conséquence à assumer : une retouche du HTML se fait dans le fichier
   français, puis on relance ce script.

   Le contrôle final refuse de se taire : tout texte resté français après
   traduction est signalé et le script sort en erreur. Un email
   mi-anglais mi-français ne doit pas pouvoir partir sans qu'on le sache.

   node scripts/gabarits-traduits.js
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'src', 'emails', 'templates');

/* Les gabarits utilisent l'apostrophe droite : les clés aussi, sinon
   rien ne correspond. Clés contenant une apostrophe = guillemets
   doubles. */
const TRAD = {
  // ── Communs ────────────────────────────────────────────────
  'Une question ? Répondez simplement à cet email.':
    { en: 'A question? Just reply to this email.', sv: 'En fråga? Svara bara på det här mejlet.' },
  'Vous recevez cet email parce que vous avez passé commande sur notre boutique.':
    { en: 'You are receiving this email because you placed an order with our shop.',
      sv: 'Du får det här mejlet eftersom du har lagt en beställning hos oss.' },
  "TVA non applicable, art. 293 B du CGI. Pas d'escompte pour paiement anticipé. Pénalités de retard : 3 fois le taux d'intérêt légal ; indemnité forfaitaire pour frais de recouvrement : 40 €. Document conservé 10 ans conformément à la réglementation comptable.":
    { en: 'VAT not applicable, art. 293 B of the French tax code. No discount for early payment. Late payment penalties: three times the legal interest rate; fixed recovery fee: €40. Document kept for 10 years in accordance with accounting rules.',
      sv: 'Moms ej tillämplig, art. 293 B i franska skattelagen. Ingen rabatt vid förtidsbetalning. Dröjsmålsränta: tre gånger den lagstadgade räntan; fast indrivningsavgift: 40 €. Handlingen bevaras i 10 år enligt bokföringsreglerna.' },
  'TVA non applicable, art. 293 B du CGI':
    { en: 'VAT not applicable, art. 293 B of the French tax code',
      sv: 'Moms ej tillämplig, art. 293 B i franska skattelagen' },
  'Conditions de vente': { en: 'Terms of sale', sv: 'Försäljningsvillkor' },
  "Préférences d'email": { en: 'Email preferences', sv: 'E-postinställningar' },
  'Toutes mes factures': { en: 'All my invoices', sv: 'Alla mina fakturor' },
  'Livraison &amp; retours': { en: 'Delivery &amp; returns', sv: 'Leverans &amp; retur' },
  'Smaklig måltid — bonne dégustation !': { en: 'Smaklig måltid — enjoy!', sv: 'Smaklig måltid!' },
  'Tack så mycket — merci de votre confiance.':
    { en: 'Tack så mycket — thank you for your trust.', sv: 'Tack så mycket för ditt förtroende.' },
  'Sous-total': { en: 'Subtotal', sv: 'Delsumma' },

  // ── Confirmation de commande ───────────────────────────────
  'Votre commande est confirmée — Swedish Cravings':
    { en: 'Your order is confirmed — Swedish Cravings', sv: 'Din order är bekräftad — Swedish Cravings' },
  'COMMANDE CONFIRMÉE': { en: 'ORDER CONFIRMED', sv: 'ORDER BEKRÄFTAD' },
  "est bien enregistrée. Nous la préparons à la main dans notre atelier de Marcq-en-Barœul et vous prévenons dès qu'elle prend la route.":
    { en: 'is registered. We pack it by hand in our workshop in Marcq-en-Barœul and will let you know as soon as it is on its way.',
      sv: 'är registrerad. Vi packar den för hand i vår verkstad i Marcq-en-Barœul och hör av oss så snart den är på väg.' },
  'VOTRE COMMANDE': { en: 'YOUR ORDER', sv: 'DIN ORDER' },
  'Votre commande': { en: 'Your order', sv: 'Din order' },
  'TOTAL RÉGLÉ': { en: 'TOTAL PAID', sv: 'TOTALT BETALT' },
  'CE QUI SE PASSE ENSUITE': { en: 'WHAT HAPPENS NEXT', sv: 'VAD HÄNDER NU' },
  '>Préparation<': { en: '>Packing<', sv: '>Packning<' },
  'Nous rassemblons vos produits et emballons le colis avec soin.':
    { en: 'We gather your items and pack the parcel with care.',
      sv: 'Vi samlar ihop dina varor och packar paketet omsorgsfullt.' },
  '>Expédition<': { en: '>Dispatch<', sv: '>Avsändning<' },
  'Vous recevez un email avec votre numéro de suivi Mondial Relay.':
    { en: 'You will receive an email with your Mondial Relay tracking number.',
      sv: 'Du får ett mejl med ditt spårningsnummer från Mondial Relay.' },
  '>Retrait<': { en: '>Collection<', sv: '>Uthämtning<' },
  'Mondial Relay vous prévient dès que le colis est arrivé en point relais.':
    { en: 'Mondial Relay will notify you as soon as the parcel reaches the pickup point.',
      sv: 'Mondial Relay meddelar dig så snart paketet nått ombudet.' },
  'SUIVRE MA COMMANDE': { en: 'TRACK MY ORDER', sv: 'SPÅRA MIN ORDER' },

  // ── Expédition ─────────────────────────────────────────────
  'Votre colis est en route — Swedish Cravings':
    { en: 'Your parcel is on its way — Swedish Cravings', sv: 'Ditt paket är på väg — Swedish Cravings' },
  'Votre colis est en route': { en: 'Your parcel is on its way', sv: 'Ditt paket är på väg' },
  'SUIVRE MON COLIS': { en: 'TRACK MY PARCEL', sv: 'SPÅRA MITT PAKET' },
  'SUIVI DE VOTRE COMMANDE': { en: 'ORDER TRACKING', sv: 'SPÅRNING AV DIN ORDER' },
  'Commande confirmée': { en: 'Order confirmed', sv: 'Order bekräftad' },
  'Colis préparé': { en: 'Parcel packed', sv: 'Paket packat' },
  'Disponible en point relais': { en: 'Available at the pickup point', sv: 'Klart att hämtas hos ombudet' },
  'POINT RELAIS DE RETRAIT': { en: 'COLLECTION POINT', sv: 'UTLÄMNINGSSTÄLLE' },
  "Munissez-vous d'une pièce d'identité et de votre numéro de suivi pour le retrait. Une erreur de point relais ? Répondez à cet email au plus vite, nous pouvons encore intervenir.":
    { en: 'Bring photo ID and your tracking number to collect the parcel. Wrong pickup point? Reply to this email quickly — we may still be able to change it.',
      sv: 'Ta med legitimation och ditt spårningsnummer vid uthämtning. Fel ombud? Svara på mejlet snarast — vi kan ofta ändra.' },
  "Au retrait, vérifiez l'état du colis devant le commerçant. En cas d'avarie, formulez des réserves précises sur le bordereau et prévenez-nous : nous remplaçons ou remboursons sans discuter.":
    { en: 'When collecting, check the parcel in front of the shopkeeper. If it is damaged, write precise reservations on the slip and tell us: we replace or refund, no argument.',
      sv: 'Kontrollera paketet hos ombudet när du hämtar det. Vid skada, notera exakt vad som är fel på kvittensen och hör av dig: vi ersätter eller återbetalar utan diskussion.' },
  'Encore un peu de patience — ça arrive !':
    { en: 'Just a little longer — it is on its way!', sv: 'Bara lite till — det är på väg!' },

  // ── Colis disponible ───────────────────────────────────────
  'Votre colis vous attend — Swedish Cravings':
    { en: 'Your parcel is waiting — Swedish Cravings', sv: 'Ditt paket väntar — Swedish Cravings' },
  'Votre colis vous attend': { en: 'Your parcel is waiting', sv: 'Ditt paket väntar' },
  'Ouvert du mardi au samedi, 8 h – 19 h 30':
    { en: 'Open Tuesday to Saturday, 8 am – 7.30 pm', sv: 'Öppet tisdag till lördag, 8–19.30' },
  'NUMÉRO DE SUIVI': { en: 'TRACKING NUMBER', sv: 'SPÅRNINGSNUMMER' },
  'POUR RETIRER VOTRE COLIS': { en: 'TO COLLECT YOUR PARCEL', sv: 'FÖR ATT HÄMTA DITT PAKET' },
  "Une pièce d'identité": { en: 'Photo ID', sv: 'Legitimation' },
  'Au nom du destinataire, obligatoire au point relais.':
    { en: 'In the name of the recipient — required at the pickup point.',
      sv: 'I mottagarens namn — krävs hos ombudet.' },
  'Votre numéro de suivi': { en: 'Your tracking number', sv: 'Ditt spårningsnummer' },
  'Celui indiqué ci-dessus, ou cet email sur votre téléphone.':
    { en: 'The one shown above, or this email on your phone.',
      sv: 'Det som visas ovan, eller det här mejlet i mobilen.' },
  "Un coup d'œil au colis": { en: 'A look at the parcel', sv: 'En titt på paketet' },
  'Vérifiez son état devant le commerçant et signalez toute avarie sur le bordereau.':
    { en: 'Check its condition in front of the shopkeeper and note any damage on the slip.',
      sv: 'Kontrollera skicket hos ombudet och notera eventuella skador på kvittensen.' },
  'VOIR LE POINT RELAIS': { en: 'VIEW THE PICKUP POINT', sv: 'VISA OMBUDET' },
  "Un empêchement ? Une autre personne peut retirer le colis avec votre numéro de suivi et sa propre pièce d'identité.":
    { en: 'Cannot make it? Someone else can collect the parcel with your tracking number and their own ID.',
      sv: 'Förhindrad? Någon annan kan hämta paketet med ditt spårningsnummer och sin egen legitimation.' },
  'POINT RELAIS': { en: 'PICKUP POINT', sv: 'OMBUD' },

  // ── Facture ────────────────────────────────────────────────
  'Votre facture est prête': { en: 'Your invoice is ready', sv: 'Din faktura är klar' },
  '>NUMÉRO<': { en: '>NUMBER<', sv: '>NUMMER<' },
  "DATE D'ÉMISSION": { en: 'ISSUE DATE', sv: 'FAKTURADATUM' },
  'TÉLÉCHARGER LE PDF': { en: 'DOWNLOAD THE PDF', sv: 'LADDA NER PDF:EN' },
  'La facture est également jointe à cet email au format PDF.':
    { en: 'The invoice is also attached to this email as a PDF.',
      sv: 'Fakturan bifogas även detta mejl som PDF.' },

  // ── Avoir ──────────────────────────────────────────────────
  'Votre remboursement — Swedish Cravings':
    { en: 'Your refund — Swedish Cravings', sv: 'Din återbetalning — Swedish Cravings' },
  'Votre remboursement est parti': { en: 'Your refund is on its way', sv: 'Din återbetalning är på väg' },
  '>AVOIR<': { en: '>CREDIT NOTE<', sv: '>KREDITNOTA<' },
  "FACTURE D'ORIGINE": { en: 'ORIGINAL INVOICE', sv: 'URSPRUNGLIG FAKTURA' },
  '>MOTIF<': { en: '>REASON<', sv: '>ORSAK<' },
  '>REMBOURSEMENT<': { en: '>REFUND<', sv: '>ÅTERBETALNING<' },
  'ARTICLES REMBOURSÉS': { en: 'REFUNDED ITEMS', sv: 'ÅTERBETALDA ARTIKLAR' },
  'MONTANT REMBOURSÉ': { en: 'AMOUNT REFUNDED', sv: 'ÅTERBETALT BELOPP' },
  "Les articles n'ont pas à être renvoyés. Le crédit apparaît sur votre relevé sous quelques jours ouvrés selon votre banque.":
    { en: 'The items do not need to be returned. The credit will appear on your statement within a few working days, depending on your bank.',
      sv: 'Artiklarna behöver inte returneras. Krediten syns på ditt kontoutdrag inom några arbetsdagar, beroende på din bank.' },
  "TÉLÉCHARGER L'AVOIR": { en: 'DOWNLOAD THE CREDIT NOTE', sv: 'LADDA NER KREDITNOTAN' },
  "L'avoir est également joint à cet email au format PDF.":
    { en: 'The credit note is also attached to this email as a PDF.',
      sv: 'Kreditnotan bifogas även detta mejl som PDF.' },
  'ET LA PROCHAINE FOIS ?': { en: 'AND NEXT TIME?', sv: 'OCH NÄSTA GÅNG?' },
  'Nous avons revu le calage des bouteilles en verre dans nos colis. Si vous souhaitez recommander ces articles, répondez à cet email : nous ajoutons une protection renforcée sans supplément.':
    { en: 'We have reviewed how glass bottles are packed. If you would like to order these items again, reply to this email: we will add reinforced protection at no extra cost.',
      sv: 'Vi har sett över hur glasflaskor packas. Vill du beställa varorna igen, svara på mejlet: vi lägger till förstärkt skydd utan extra kostnad.' },
  'Désolée pour ce désagrément — nous restons à votre écoute.':
    { en: 'Sorry for the inconvenience — we remain at your disposal.',
      sv: 'Ledsen för besväret — hör gärna av dig.' },
  'Email comptable lié à votre commande n°':
    { en: 'Accounting email related to your order no.', sv: 'Bokföringsmejl kopplat till din order nr' },

  // ── Message libre / rupture ────────────────────────────────
  'Un article de votre commande est en rupture — Swedish Cravings':
    { en: 'An item in your order is out of stock — Swedish Cravings',
      sv: 'En vara i din order är slutsåld — Swedish Cravings' },
  'CE QUE JE PEUX METTRE À LA PLACE':
    { en: 'WHAT I CAN OFFER INSTEAD', sv: 'VAD JAG KAN ERBJUDA I STÄLLET' },
  '— le reste de votre commande suit son cours.':
    { en: '— the rest of your order carries on as planned.',
      sv: '— resten av din order fortsätter som planerat.' },
  'Attendre le réassort': { en: 'Wait for the restock', sv: 'Vänta på påfyllning' },
  "— j'expédie tout ensemble dès l'arrivée du camion, et je vous préviens de la date exacte.":
    { en: '— I ship everything together as soon as the delivery arrives, and I will tell you the exact date.',
      sv: '— jag skickar allt tillsammans så snart leveransen kommer, och meddelar dig exakt datum.' },
  "Un simple clic suffit, et si rien ne vous convient répondez à cet email : je m'en occupe personnellement. Votre colis reste en attente jusqu'à votre réponse.":
    { en: 'One click is enough, and if nothing suits you just reply to this email: I will handle it personally. Your parcel stays on hold until you answer.',
      sv: 'Ett klick räcker, och passar inget svarar du bara på mejlet: jag tar hand om det personligen. Ditt paket väntar tills du svarat.' },
  '— une de chaque si vous préférez, vous choisissez la répartition.':
    { en: '— one of each if you prefer, you choose how to split it.',
      sv: '— en av varje om du vill, du bestämmer fördelningen.' },
  'Merci de votre patience — et désolée pour ce contretemps.':
    { en: 'Thank you for your patience — and sorry for the hiccup.',
      sv: 'Tack för ditt tålamod — och ursäkta krånglet.' },
};

const LANGUES = ['en', 'sv'];
const SOURCES = fs.readdirSync(DIR).filter(f => /^email-[a-z-]+\.html$/.test(f));

/* L'adresse postale de l'entreprise reste en français : c'est une
   adresse, pas une phrase. */
const TOLERE = /14 rue de la Gare|Marcq-en-Bar/;

let ecrits = 0;
const jamaisUtilisees = new Set(Object.keys(TRAD));
const restantes = {};

for (const src of SOURCES) {
  const fr = fs.readFileSync(path.join(DIR, src), 'utf8');
  for (const lang of LANGUES) {
    let out = fr;
    // Du plus long au plus court : une phrase avant les mots qu'elle contient.
    for (const cle of Object.keys(TRAD).sort((a, b) => b.length - a.length)) {
      if (!out.includes(cle)) continue;
      jamaisUtilisees.delete(cle);
      out = out.split(cle).join(TRAD[cle][lang]);
    }
    out = out.replace(/<html([^>]*)lang="fr"/i, `<html$1lang="${lang}"`);
    fs.writeFileSync(path.join(DIR, src.replace(/\.html$/, `.${lang}.html`)), out, 'utf8');
    ecrits++;

    const oublis = [...out.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ]{4,}[^<>{}]*)</g)]
      .map(m => m[1].replace(/\s+/g, ' ').trim())
      .filter(t => t && !TOLERE.test(t)
        && /\b(votre|vous|nous|une|des|est|avec|pour|sur|cet|dans|qui|par)\b/i.test(t));
    if (oublis.length) restantes[`${src} → ${lang}`] = [...new Set(oublis)];
  }
}

console.log(`${ecrits} gabarits traduits écrits (${SOURCES.length} sources × ${LANGUES.length} langues)`);

if (jamaisUtilisees.size) {
  console.log('\nEntrées jamais utilisées (le texte source a-t-il changé ?) :');
  for (const c of jamaisUtilisees) console.log('   ', c.slice(0, 72));
}

if (Object.keys(restantes).length) {
  console.log('\nTexte encore français après traduction :');
  for (const [k, v] of Object.entries(restantes)) {
    console.log(`  ${k}`);
    for (const t of v.slice(0, 6)) console.log('     ', t.slice(0, 90));
  }
  process.exitCode = 1;
} else {
  console.log('Aucun texte français résiduel.');
}
