-- Migration 013 : textes CMS homepage alignés sur l'histoire Swedish Cravings

INSERT INTO cms_home (key, label, type, value_fr, value_sv, value_en) VALUES
  ('editorial_eyebrow',     'Section éditoriale – Eyebrow',        'text', 'Notre sélection',                                                                                            'Vårt urval',                                                                                         'Our selection'),
  ('editorial_title',       'Section éditoriale – Titre (HTML ok)', 'text', 'L''épicerie suédoise<br>que vous <em>cherchiez</em>',                                                         'Den svenska delikatessen<br>du alltid <em>sökte</em>',                                               'The Swedish pantry<br>you were <em>looking for</em>'),
  ('editorial_cta',         'Section éditoriale – Texte CTA',       'text', 'Lire notre histoire →',                                                                                      'Läs vår historia →',                                                                                 'Read our story →'),
  ('editorial_badge_num',   'Section éditoriale – Badge chiffre',   'text', '20+',                                                                                                        '20+',                                                                                                '20+'),
  ('editorial_badge_label', 'Section éditoriale – Badge libellé',   'text', 'Produits<br>sélectionnés',                                                                                   'Utvalda<br>produkter',                                                                               'Selected<br>products'),
  ('about_eyebrow',         'Section histoire – Eyebrow',           'text', 'Notre histoire',                                                                                              'Vår historia',                                                                                       'Our story'),
  ('about_stat1_num',       'Section histoire – Stat 1 (chiffre)',  'text', '20+',                                                                                                        '20+',                                                                                                '20+'),
  ('about_stat1_label',     'Section histoire – Stat 1 (libellé)',  'text', 'produits sélectionnés',                                                                                      'utvalda produkter',                                                                                  'selected products'),
  ('about_stat2_num',       'Section histoire – Stat 2 (chiffre)',  'text', '100%',                                                                                                       '100%',                                                                                               '100%'),
  ('about_stat2_label',     'Section histoire – Stat 2 (libellé)',  'text', 'origine certifiée',                                                                                          'certifierat ursprung',                                                                               'certified origin'),
  ('about_stat3_num',       'Section histoire – Stat 3 (chiffre)',  'text', 'France',                                                                                                     'Frankrike',                                                                                          'France'),
  ('about_stat3_label',     'Section histoire – Stat 3 (libellé)',  'text', 'livraison disponible',                                                                                       'leverans tillgänglig',                                                                               'delivery available'),
  ('about_cta',             'Section histoire – Texte CTA',         'text', 'Lire notre histoire →',                                                                                      'Läs vår historia →',                                                                                 'Read our story →'),
  ('promise_1_title',       'Promesse 1 – Titre',                   'text', 'Livraison offerte',                                                                                          'Fri frakt',                                                                                          'Free delivery'),
  ('promise_1_desc',        'Promesse 1 – Description',             'text', 'Dès 50€ en France',                                                                                         'Från 50€ i Frankrike',                                                                               'From €50 in France'),
  ('promise_2_title',       'Promesse 2 – Titre',                   'text', 'Saveurs authentiques',                                                                                       'Äkta smaker',                                                                                        'Authentic flavours'),
  ('promise_2_desc',        'Promesse 2 – Description',             'text', 'Directement de Suède',                                                                                       'Direkt från Sverige',                                                                                'Direct from Sweden'),
  ('promise_3_title',       'Promesse 3 – Titre',                   'text', 'Paiement sécurisé',                                                                                          'Säker betalning',                                                                                    'Secure payment'),
  ('promise_3_desc',        'Promesse 3 – Description',             'text', 'Visa, Mastercard',                                                                                           'Visa, Mastercard',                                                                                   'Visa, Mastercard'),
  ('promise_4_title',       'Promesse 4 – Titre',                   'text', 'Emballage soigné',                                                                                           'Omsorgsfullt förpackat',                                                                             'Carefully packaged'),
  ('promise_4_desc',        'Promesse 4 – Description',             'text', 'Préparé avec soin',                                                                                          'Förberett med omsorg',                                                                               'Prepared with care'),
  ('ticker_1',              'Ticker – Message 1',                   'text', 'Livraison offerte dès 50€',                                                                                  'Fri frakt från 50€',                                                                                 'Free delivery from €50'),
  ('ticker_2',              'Ticker – Message 2',                   'text', 'Saveurs suédoises authentiques',                                                                             'Äkta svenska smaker',                                                                                'Authentic Swedish flavours'),
  ('ticker_3',              'Ticker – Message 3',                   'text', 'Sans conservateurs',                                                                                         'Utan konserveringsmedel',                                                                            'No preservatives'),
  ('ticker_4',              'Ticker – Message 4',                   'text', 'Fondée par une Suédoise en France',                                                                          'Grundad av en Svensk i Frankrike',                                                                   'Founded by a Swede in France'),
  ('ticker_5',              'Ticker – Message 5',                   'text', 'Paiement sécurisé',                                                                                          'Säker betalning',                                                                                    'Secure payment'),
  ('nl_title',              'Newsletter – Titre (HTML ok)',          'text', 'Recevez nos <em>nouveautés</em>',                                                                            'Få våra <em>nyheter</em>',                                                                           'Get our <em>news</em>'),
  ('nl_subtitle',           'Newsletter – Sous-titre',              'text', 'Recettes suédoises, nouveaux produits, offres exclusives — directement dans votre boîte mail.',              'Svenska recept, nya produkter, exklusiva erbjudanden — direkt i din inkorg.',                        'Swedish recipes, new products, exclusive offers — directly in your inbox.'),
  ('nl_btn',                'Newsletter – Texte bouton',            'text', 'S''inscrire',                                                                                                 'Prenumerera',                                                                                        'Subscribe')
ON CONFLICT (key) DO UPDATE SET
  value_fr   = EXCLUDED.value_fr,
  value_sv   = EXCLUDED.value_sv,
  value_en   = EXCLUDED.value_en,
  updated_at = NOW();

-- Mise à jour des clés existantes
UPDATE cms_home SET
  value_fr   = 'Mélanges pour dips, épices, marinades et spécialités sèches — le meilleur de l''épicerie suédoise, soigneusement sélectionné.',
  value_sv   = 'Dipmixer, kryddor, marinader och torra specialiteter — det bästa ur det svenska köket, omsorgsfullt utvalt.',
  value_en   = 'Dip mixes, spices, marinades and dry specialities — the best of Swedish groceries, carefully selected.',
  updated_at = NOW()
WHERE key = 'editorial_body1';

UPDATE cms_home SET
  value_fr   = 'Des saveurs authentiques, directement de Suède, livrées en France.',
  value_sv   = 'Äkta smaker, direkt från Sverige, levererade till Frankrike.',
  value_en   = 'Authentic flavours, direct from Sweden, delivered to France.',
  updated_at = NOW()
WHERE key = 'editorial_body2';

UPDATE cms_home SET
  value_fr   = 'Suédoise installée en France, portée par l''amour des saveurs suédoises — l''épicerie qu''elle cherchait et ne trouvait nulle part.',
  value_sv   = 'Svensk kvinna bosatt i Frankrike, driven av kärleken till svenska smaker — affären hon sökte men aldrig hittade.',
  value_en   = 'A Swede living in France, driven by a love of Swedish flavours — the shop she was looking for but could never find.',
  updated_at = NOW()
WHERE key = 'about_body1';

UPDATE cms_home SET
  value_fr   = '"Elle a décidé de la créer elle-même."',
  value_sv   = '"Så bestämde hon sig för att skapa den själv."',
  value_en   = '"So she decided to create it herself."',
  updated_at = NOW()
WHERE key = 'about_quote';

UPDATE cms_home SET
  value_fr   = 'Elle sélectionne chaque produit directement auprès de producteurs soigneusement choisis — pour l''authenticité et la qualité de chaque référence.',
  value_sv   = 'Hon väljer varje produkt direkt från noggrant utvalda producenter — för äkthet och kvalitet i varje referens.',
  value_en   = 'She selects every product directly from carefully chosen producers — for authenticity and quality in every item.',
  updated_at = NOW()
WHERE key = 'about_body2';
