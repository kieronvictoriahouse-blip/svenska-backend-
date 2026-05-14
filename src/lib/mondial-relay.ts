import { createHash } from 'crypto';

const MR_URL = 'https://api.mondialrelay.com/WebService.asmx';
const MR_NS = 'http://www.mondialrelay.com/webservice/';

export function mrHash(fields: string[], privateKey: string): string {
  const str = fields.join('') + privateKey;
  return createHash('md5').update(str).digest('hex').toUpperCase();
}

export function mrEscapeXml(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function mrParseXml(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : '';
}

function buildSoap(method: string, fields: Record<string, string>): string {
  const inner = Object.entries(fields)
    .map(([k, v]) => `      <${k}>${mrEscapeXml(v)}</${k}>`)
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${method} xmlns="${MR_NS}">
${inner}
    </${method}>
  </soap:Body>
</soap:Envelope>`;
}

export async function mrSoap(method: string, fields: Record<string, string>): Promise<string> {
  const res = await fetch(MR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': `"${MR_NS}${method}"`,
    },
    body: buildSoap(method, fields),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function formatMrPhone(p?: string): string {
  if (!p) return '';
  const clean = p.replace(/[\s\-\.\(\)]/g, '');
  if (clean.startsWith('+33')) return '0' + clean.slice(3);
  if (clean.startsWith('33') && clean.length === 11) return '0' + clean.slice(2);
  return clean.slice(0, 10);
}

export function trunc(s: string, n: number): string {
  return (s ?? '').slice(0, n);
}

export function parseAddressCpVille(address: string): { cp: string; ville: string; street: string } {
  const lines = address.split(/[\n,]+/).map(l => l.trim()).filter(Boolean);
  let cp = '';
  let ville = '';
  for (const line of lines) {
    const m = line.match(/^(\d{5})\s+(.+)$/);
    if (m) { cp = m[1]; ville = m[2]; break; }
  }
  return { cp, ville, street: lines[0] || '' };
}
