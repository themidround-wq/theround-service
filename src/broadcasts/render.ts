import sanitizeHtml from 'sanitize-html';
import {
  button,
  DISPLAY,
  EmailContext,
  escapeHtml,
  heading,
  INK,
  layoutHtml,
  layoutText,
  MUTED,
  RenderedEmail,
  RULE,
  SANS,
} from '../email/templates/layout';
import type { BroadcastKind } from './broadcast.entities';

export const KIND_LABEL: Record<BroadcastKind, string> = {
  newsletter: 'Newsletter',
  feature_update: 'New in The Round',
  announcement: 'Announcement',
  maintenance: 'Service notice',
};

const P = `margin:0 0 20px; font-family:${SANS}; font-size:18px; line-height:1.6; color:${INK};`;

/** Inline styles per tag: email clients ignore <style>, so every element carries its own. */
const STYLES: Record<string, string> = {
  p: P,
  h2: `margin:32px 0 12px; font-family:${DISPLAY}; font-weight:700; font-size:26px; line-height:1.25; color:${INK};`,
  h3: `margin:28px 0 10px; font-family:${DISPLAY}; font-weight:700; font-size:20px; line-height:1.3; color:${INK};`,
  a: `color:${INK}; text-decoration:underline;`,
  ul: `margin:0 0 20px; padding-left:24px; font-family:${SANS}; font-size:18px; line-height:1.6; color:${INK};`,
  ol: `margin:0 0 20px; padding-left:24px; font-family:${SANS}; font-size:18px; line-height:1.6; color:${INK};`,
  li: 'margin:0 0 8px;',
  blockquote: `margin:0 0 20px; padding:4px 0 4px 18px; border-left:3px solid ${RULE}; font-family:Georgia, 'Times New Roman', serif; font-style:italic; color:${INK};`,
  hr: `border:0; border-top:1px solid ${RULE}; margin:28px 0;`,
  img: 'display:block; max-width:100%; height:auto; border:0; border-radius:12px; margin:0 0 20px;',
};

const withStyle =
  (tag: string) =>
  (_: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag => ({
    tagName: tag,
    attribs: { ...attribs, style: STYLES[tag] },
  });

/**
 * Keeps only what the editor produces and what email clients render.
 * Scripts, styles, event handlers, iframes and unknown tags are dropped.
 */
export function sanitizeBody(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      'p',
      'br',
      'h2',
      'h3',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'a',
      'ul',
      'ol',
      'li',
      'blockquote',
      'hr',
      'img',
    ],
    allowedAttributes: { a: ['href'], img: ['src', 'alt'] },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['https'] },
    // h1 is the email's own title; demote any pasted ones.
    transformTags: { h1: 'h2', h4: 'h3', h5: 'h3', h6: 'h3' },
    // An image whose src was rejected (e.g. http://) would render as a broken box.
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
  }).trim();
}

/** Adds the inline styles. Run on already-sanitised HTML. */
function styleBody(html: string) {
  const transformTags = Object.fromEntries(
    Object.keys(STYLES).map((t) => [t, withStyle(t)]),
  );
  const styled = sanitizeHtml(html, {
    allowedTags: false,
    allowedAttributes: false,
    transformTags: {
      ...transformTags,
      a: (_: string, attribs: sanitizeHtml.Attributes) => ({
        tagName: 'a',
        attribs: { href: attribs.href, target: '_blank', style: STYLES.a },
      }),
    },
  });
  // The editor wraps list items in <p>; drop their paragraph margin.
  return styled.replace(
    /<li style="([^"]*)"><p style="[^"]*">/g,
    `<li style="$1"><p style="margin:0; font-family:${SANS}; font-size:18px; line-height:1.6; color:${INK};">`,
  );
}

/** Roughly what a reader sees, for the plain-text part. */
export function htmlToText(html: string) {
  return sanitizeHtml(
    html
      .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<hr[^>]*>/gi, '\n---\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|h2|h3|blockquote|ul|ol)>/gi, '\n\n'),
    { allowedTags: [], allowedAttributes: {} },
  )
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type BroadcastContent = {
  kind: BroadcastKind;
  subject: string;
  preheader: string;
  headline: string;
  bodyHtml: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

/** `{{name}}` becomes the reader's first name, or "there". */
const personalise = (s: string, name: string | null, html: boolean) => {
  const value = name?.trim().split(/\s+/)[0] || 'there';
  return s.replace(/\{\{\s*name\s*\}\}/gi, html ? escapeHtml(value) : value);
};

function kindLabel(kind: BroadcastKind) {
  return `
          <tr>
            <td class="px-mobile" style="padding-bottom:16px;">
              <span style="display:inline-block; padding:6px 12px; border:1px solid ${RULE}; border-radius:999px; font-family:${SANS}; font-weight:600; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:${MUTED};">${KIND_LABEL[kind]}</span>
            </td>
          </tr>`;
}

function richText(html: string) {
  return `
          <tr>
            <td class="px-mobile" style="padding-bottom:28px;">
              ${html}
            </td>
          </tr>`;
}

/**
 * Renders one recipient's copy. `ctx.unsubscribeUrl` should already be that
 * recipient's personal link.
 */
export function renderBroadcast(
  ctx: EmailContext,
  b: BroadcastContent,
  recipient: { name: string | null },
): RenderedEmail {
  const subject = personalise(b.subject, recipient.name, false);
  const title = escapeHtml(
    personalise(b.headline || b.subject, recipient.name, false),
  );
  const body = personalise(
    styleBody(sanitizeBody(b.bodyHtml)),
    recipient.name,
    true,
  );
  const cta =
    b.ctaLabel && b.ctaUrl ? { label: b.ctaLabel, url: b.ctaUrl } : null;

  const html = layoutHtml({
    ctx,
    title: escapeHtml(subject),
    preheader: escapeHtml(personalise(b.preheader, recipient.name, false)),
    body: [
      kindLabel(b.kind),
      heading(title),
      richText(body),
      cta ? button(escapeHtml(cta.url), escapeHtml(cta.label)) : '',
    ].join(''),
  });

  const text = layoutText(ctx, [
    personalise(b.headline || b.subject, recipient.name, false),
    '',
    personalise(htmlToText(sanitizeBody(b.bodyHtml)), recipient.name, false),
    ...(cta ? ['', `${cta.label}: ${cta.url}`] : []),
  ]);

  return { subject, html, text };
}
