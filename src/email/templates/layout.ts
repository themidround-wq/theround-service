/**
 * Shared layout for every email, extracted from the landing page's original
 * waitlist template.
 *
 * Hand-written table layout with inline styles on every element: Gmail,
 * Outlook.com and Yahoo strip <style> blocks, so the <style> tag below is
 * progressive enhancement only (mobile breakpoints) and never load-bearing.
 *
 * Preview every template in a browser with `npm run email:preview`.
 */

export const INK = '#14271a';
export const MUTED = '#5b6358';
export const RULE = '#d8d6c9';

export const SANS = "'Segoe UI', Arial, sans-serif";
export const DISPLAY = "'Poppins', 'Segoe UI', Arial, sans-serif";

export const SOCIALS = [
  { label: 'Instagram', href: 'https://instagram.com/theround' },
  { label: 'TikTok', href: 'https://tiktok.com/@theround' },
  { label: 'LinkedIn', href: 'https://linkedin.com/company/theround' },
  { label: 'X', href: 'https://x.com/theround' },
];

/** Values from config that every template needs. */
export type EmailContext = {
  /**
   * Absolute origin for email assets and the masthead link. Images in email
   * must be publicly reachable over HTTPS - relative paths and data: URIs do
   * not render - so this cannot point at localhost.
   */
  siteUrl: string;
  /** Where in-app CTAs point (the web app, not the landing page). */
  appUrl: string;
  unsubscribeUrl: string;
  companyAddress?: string;
};

/** A rendered email, ready to hand to Resend. */
export type RenderedEmail = { subject: string; html: string; text: string };

/** Escapes user-supplied values (names, emails) before they go into HTML. */
export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NON_HUMAN_NAMES = new Set([
  'the',
  'admin',
  'administrator',
  'team',
  'support',
  'info',
  'test',
  'testing',
  'user',
  'member',
  'noreply',
  'no-reply',
  'theround',
  'round',
]);

/**
 * Extracts a clean first name from a user's full name,
 * returning null if unresolved (e.g. null, empty, whitespace, raw email, or system/org prefix).
 */
export function extractFirstName(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes('@')) return null;
  const first = trimmed.split(/\s+/)[0].replace(/[^\p{L}\p{N}'-]/gu, '');
  if (!first || NON_HUMAN_NAMES.has(first.toLowerCase())) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/* ---------- Blocks: each returns one <tr> of the content table ---------- */

export function heading(text: string) {
  return `
          <tr>
            <td class="px-mobile heading" style="padding-bottom: 32px; font-family: ${DISPLAY}; font-weight: 700; color: ${INK};">
              <h1 style="margin:0; font-size:52px; line-height:1.1; font-family: ${DISPLAY}; font-weight: 700; color: ${INK};">${text}</h1>
            </td>
          </tr>`;
}

/** Body copy. Pass `last` on the final paragraph for the larger gap below. */
export function paragraph(html: string, { last = false } = {}) {
  return `
          <tr>
            <td class="px-mobile body-text" style="font-family: ${SANS}; font-weight: 400; font-size:20px; line-height:1.6; color: ${INK}; padding-bottom:${last ? 48 : 24}px;">
              ${html}
            </td>
          </tr>`;
}

/** Ticket number pill, mirroring the number shown in the landing SuccessModal. */
export function ticket(ticketNumber: number) {
  return `
          <tr>
            <td class="px-mobile" style="padding-bottom: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid ${RULE}; border-radius: 12px;">
                <tr>
                  <td style="padding: 14px 8px 14px 20px; font-family: ${SANS}; font-weight: 600; letter-spacing: 1.5px; color: ${MUTED}; font-size:11px; text-transform:uppercase;">
                    Ticket no.
                  </td>
                  <td style="padding: 14px 20px 14px 0; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size:22px; color: ${INK};">
                    #${ticketNumber}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

/**
 * Labelled figures in a bordered card, styled like the ticket pill: small
 * uppercase label on the left, italic serif value on the right.
 */
export function stats(rows: [label: string, value: string][]) {
  const cells = rows
    .map(
      ([label, value], i) => `
                <tr>
                  <td style="padding: 14px 8px 14px 20px; ${i ? `border-top: 1px solid ${RULE};` : ''} font-family: ${SANS}; font-weight: 600; letter-spacing: 1.5px; color: ${MUTED}; font-size:11px; text-transform:uppercase;">
                    ${label}
                  </td>
                  <td align="right" style="padding: 14px 20px 14px 8px; ${i ? `border-top: 1px solid ${RULE};` : ''} font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size:20px; color: ${INK};">
                    ${value}
                  </td>
                </tr>`,
    )
    .join('');

  return `
          <tr>
            <td class="px-mobile" style="padding-bottom: 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid ${RULE}; border-radius: 12px; border-collapse: separate;">${cells}
              </table>
            </td>
          </tr>`;
}

/** A quoted line (e.g. the question practised), set off by a left rule. */
export function quote(html: string, caption?: string) {
  return `
          <tr>
            <td class="px-mobile" style="padding-bottom: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-left: 3px solid ${RULE}; padding: 4px 0 4px 20px;">
                    ${caption ? `<div style="font-family: ${SANS}; font-weight: 600; letter-spacing: 1.5px; color: ${MUTED}; font-size:11px; text-transform:uppercase; padding-bottom: 8px;">${caption}</div>` : ''}
                    <div style="font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size:20px; line-height:1.5; color: ${INK};">${html}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

/** A single answer's length: 84 -> "1:24". */
export function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Accumulated time: 1260 -> "21 min", 3725 -> "1h 2m". */
export function formatTotal(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Bulletproof button: a padded table cell with a background colour, so it
 * still renders as a button in Outlook (which ignores padding on <a>).
 */
export function button(href: string, label: string) {
  return `
          <tr>
            <td class="px-mobile" style="padding-bottom: 48px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td bgcolor="${INK}" style="border-radius: 999px; background-color: ${INK};">
                    <a href="${href}" target="_blank" style="display:inline-block; padding: 16px 32px; font-family: ${SANS}; font-weight: 600; font-size:16px; line-height:1; color:#ffffff; text-decoration:none; border-radius: 999px;">${label}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

export function socials() {
  const cells = SOCIALS.map(
    (s, i) => `
                  <td style="font-family: ${SANS}; font-weight: 600; font-size:16px; ${
                    i < SOCIALS.length - 1 ? 'padding-right:24px;' : ''
                  }">
                    <a href="${s.href}" style="color:${INK}; text-decoration:underline;">${s.label}</a>
                  </td>`,
  ).join('');

  return `
          <tr>
            <td class="px-mobile" style="font-family: ${SANS}; font-weight: 400; font-size:16px; line-height:1.5; color: ${MUTED}; padding-bottom:16px;">
              In the meantime, follow along for updates.
            </td>
          </tr>
          <tr>
            <td class="px-mobile" style="padding-bottom: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>${cells}
                </tr>
              </table>
            </td>
          </tr>`;
}

/** Plain-text equivalent of `socials()`. */
export function socialsText() {
  return [
    'In the meantime, follow along for updates:',
    ...SOCIALS.map((s) => `  ${s.label}: ${s.href}`),
  ];
}

/* ---------------------------- Whole documents ---------------------------- */

type LayoutArgs = {
  ctx: EmailContext;
  /** <title>; normally the subject. */
  title: string;
  /** Inbox preview text shown after the subject. */
  preheader: string;
  /** Concatenated block rows (heading(), paragraph(), ...). */
  body: string;
};

export function layoutHtml({ ctx, title, preheader, body }: LayoutArgs) {
  const logo = {
    // Served by the landing page from public/Logo-on-whitebg.png. Source is
    // 480x136; displayed at 120 wide so it stays crisp on retina. Width and
    // height are attributes as well as inline styles so clients that block
    // images still reserve the right space.
    src: `${ctx.siteUrl}/Logo-on-whitebg.png`,
    width: 120,
    height: 34,
    alt: 'The Round',
  };

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${title}</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<style>
  table { border-collapse: collapse; }
  td, h1 { font-family: Arial, sans-serif; }
</style>
<![endif]-->
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
  body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; background-color: #ffffff; }

  /* Progressive enhancement only - every element also carries an inline
     fallback so clients that strip <style> (Gmail, Outlook.com, Yahoo)
     still render correctly. */
  @media screen and (max-width: 600px) {
    .container { width: 100% !important; }
    .px-mobile { padding-left: 24px !important; padding-right: 24px !important; }
    .heading { font-size: 40px !important; line-height: 1.15 !important; }
    .body-text { font-size: 18px !important; line-height: 1.5 !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#ffffff;">
  <!-- Spam-safe hidden preheader with non-breaking whitespace padding -->
  <div style="display:none; font-size:1px; color:#ffffff; line-height:1px; max-height:0px; max-width:0px; opacity:0; overflow:hidden; mso-hide:all;">
    ${preheader}
    &#847; &zwnj; &nbsp; &#847; &zwnj; &nbsp; &#847; &zwnj; &nbsp; &#847; &zwnj; &nbsp; &#847; &zwnj; &nbsp; &#847; &zwnj; &nbsp; &#847; &zwnj; &nbsp; &#847; &zwnj; &nbsp;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">
    <tr>
      <td align="center" style="padding: 48px 20px;">

        <!--[if mso]>
        <table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td>
        <![endif]-->
        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px; max-width:560px;">

          <!-- Logo. Linked to the site, as most readers expect of an email
               masthead. alt text carries the brand when images are blocked. -->
          <tr>
            <td class="px-mobile" style="padding-bottom: 40px; line-height:0; font-size:0;">
              <a href="${ctx.siteUrl}" style="text-decoration:none; border:0;"><img src="${logo.src}" alt="${logo.alt}" width="${logo.width}" height="${logo.height}" style="display:block; width:${logo.width}px; height:${logo.height}px; border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic;" /></a>
            </td>
          </tr>
${body}

          <!-- Divider -->
          <tr>
            <td class="px-mobile" style="padding-bottom: 24px;">
              <div style="border-top: 1px solid ${RULE}; font-size:1px; line-height:1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="px-mobile" style="padding-bottom: 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family: ${SANS}; font-weight: 600; letter-spacing: 1.5px; color: ${MUTED}; font-size:13px; text-transform:uppercase;">
                    The Round
                  </td>
                  <td align="right" style="font-family: ${SANS}; font-weight: 600; letter-spacing: 1.5px; color: ${MUTED}; font-size:13px; text-transform:uppercase;">
                    Practice with purpose.
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top: 16px; padding-bottom: 4px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        ${SOCIALS.map(
                          (s, i) => `
                        <td style="font-family: ${SANS}; font-weight: 600; font-size: 12px; ${
                          i < SOCIALS.length - 1 ? 'padding-right: 18px;' : ''
                        }">
                          <a href="${s.href}" target="_blank" style="color: ${INK}; text-decoration: none; border-bottom: 1px solid ${RULE};">${s.label}</a>
                        </td>`,
                        ).join('')}
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top: 12px; font-family: ${SANS}; font-size: 12px; line-height: 1.5; color: ${MUTED};">
                    ${ctx.companyAddress ? `${escapeHtml(ctx.companyAddress)}<br />` : ''}
                    Received this by mistake or want to opt out? <a href="${ctx.unsubscribeUrl}" style="color: ${MUTED}; text-decoration: underline;">Unsubscribe</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Plain-text alternative. Always sent alongside the HTML: it improves
 * deliverability and is the fallback for text-only clients.
 */
export function layoutText(ctx: EmailContext, lines: string[]) {
  const out = [
    ...lines,
    '',
    'The Round - Practice with purpose.',
    '',
    'Follow along:',
    ...SOCIALS.map((s) => `  ${s.label}: ${s.href}`),
  ];
  if (ctx.companyAddress) out.push('', ctx.companyAddress);
  out.push('', `To unsubscribe or manage preferences: ${ctx.unsubscribeUrl}`);
  return out.join('\n');
}
