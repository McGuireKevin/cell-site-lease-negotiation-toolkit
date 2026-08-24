/* =============================================================================
   DOCX READER — open what came back.

   The mirror of src/docx-writer.js. That one writes a zip with STORE because
   Word accepts uncompressed entries; this one has to read what WORD wrote, and
   Word compresses. So it needs DEFLATE.

   No dependency for that either: DecompressionStream('deflate-raw') is native
   in Firefox 113+, Edge and Chrome, and works over file://. The whole reader is
   zip arithmetic plus DOMParser.

   WHAT IT PULLS OUT, and why each matters in a redline:

     text            what the document says now, for the substantive comparison
     tracked changes THE LANDLORD'S ACTUAL EDITS, where they used Track Changes.
                     Better than any diff: a diff infers what changed, this is
                     what they did, attributed and dated.
     comments        usually where the reason lives, and the reason is what
                     tells you whether an edit is negotiable
     formatting      per paragraph, for the conformance check — which is the
                     half a PDF can never answer, because a PDF has no styles

   Everything here is async, because DecompressionStream is.
   ============================================================================= */

const DXR_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/* ---- zip ------------------------------------------------------------------ */
async function dxrInflateRaw(bytes){
  if(typeof DecompressionStream === 'undefined')
    throw new Error('This browser has no DecompressionStream. Firefox 113+, Edge or Chrome will read it.');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* Reads the central directory rather than scanning for local headers. Local
   headers can carry a data descriptor with zero sizes in them, which is what
   makes naive scanners return empty parts from documents that open fine. */
async function dxrReadZip(buf){
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer);

  let eocd = -1;
  for(let i = u8.length - 22; i >= 0 && i > u8.length - 66000; i--){
    if(dv.getUint32(i, true) === 0x06054B50){ eocd = i; break; }
  }
  if(eocd < 0) throw new Error('Not a zip archive — a .docx is a zip, and this file has no end record.');

  const count = dv.getUint16(eocd + 10, true);
  let at = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = new Map();

  for(let n = 0; n < count; n++){
    if(dv.getUint32(at, true) !== 0x02014B50) throw new Error('Corrupt central directory at entry ' + n);
    const method   = dv.getUint16(at + 10, true);
    const compSize = dv.getUint32(at + 20, true);
    const nameLen  = dv.getUint16(at + 28, true);
    const extraLen = dv.getUint16(at + 30, true);
    const cmtLen   = dv.getUint16(at + 32, true);
    const local    = dv.getUint32(at + 42, true);
    const name     = dec.decode(u8.subarray(at + 46, at + 46 + nameLen));

    /* The LOCAL header's extra field length is frequently different from the
       central one. Using the central value here is the classic way to land a
       few bytes into the data and get inflate errors on a valid file. */
    const lNameLen  = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = u8.subarray(start, start + compSize);

    out.set(name, method === 0 ? raw : await dxrInflateRaw(raw));
    at += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

function dxrText(bytes){ return new TextDecoder('utf-8').decode(bytes); }

function dxrParseXml(str, what){
  const doc = new DOMParser().parseFromString(str, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if(err) throw new Error((what||'part') + ' is not valid XML: ' + err.textContent.slice(0, 120));
  return doc;
}

/* ---- paragraphs ----------------------------------------------------------- */
const dxrEl = (p, name) => p.getElementsByTagNameNS(DXR_W, name);
const dxrFirst = (p, name) => dxrEl(p, name)[0] || null;
const dxrVal = (p, name) => { const e = dxrFirst(p, name); return e ? e.getAttributeNS(DXR_W, 'val') : null; };

/* Is this node inside an element of the given name? Used to tell a run that was
   tracked-inserted from an ordinary one. */
function dxrWithin(node, name){
  for(let n = node.parentNode; n; n = n.parentNode){
    if(n.namespaceURI === DXR_W && n.localName === name) return n;
  }
  return null;
}

/* Direct formatting on a paragraph: anything in pPr beyond the style reference
   and list membership.

   THIS IS THE MEASUREMENT THE WHOLE DRIFT ARGUMENT RESTS ON. Our writer emits
   pStyle and numPr and nothing else, so anything else found here was added by a
   person — a font, a size, an indent nudged by a drag of the ruler. */
const DXR_ALLOWED_PPR = ['pStyle', 'numPr', 'rPr', 'sectPr'];
const DXR_ALLOWED_RPR = ['rFonts', 'sz', 'szCs', 'lang', 'noProof'];

function dxrDirectFormatting(p){
  const found = [];
  const pPr = dxrFirst(p, 'pPr');
  if(pPr){
    for(const child of Array.from(pPr.childNodes)){
      if(child.nodeType !== 1 || child.namespaceURI !== DXR_W) continue;
      if(DXR_ALLOWED_PPR.indexOf(child.localName) < 0) found.push('pPr/' + child.localName);
    }
  }
  /* Run-level. rFonts and sz are reported separately with their values, because
     "someone changed the font" is a different conversation from "someone
     justified one paragraph". */
  const overrides = {};
  for(const r of Array.from(dxrEl(p, 'r'))){
    const rPr = dxrFirst(r, 'rPr');
    if(!rPr) continue;
    for(const child of Array.from(rPr.childNodes)){
      if(child.nodeType !== 1 || child.namespaceURI !== DXR_W) continue;
      if(child.localName === 'rFonts'){
        const f = child.getAttributeNS(DXR_W, 'ascii');
        if(f) overrides.font = f;
      } else if(child.localName === 'sz'){
        overrides.sizeHalfPt = Number(child.getAttributeNS(DXR_W, 'val'));
      } else if(DXR_ALLOWED_RPR.indexOf(child.localName) < 0){
        if(found.indexOf('rPr/' + child.localName) < 0) found.push('rPr/' + child.localName);
      }
    }
  }
  return {props: found, overrides: overrides};
}

/* Runs of text, split by whether they were tracked-inserted, tracked-deleted,
   or ordinary. */
function dxrRuns(p){
  const parts = [];
  const walk = (node) => {
    for(const child of Array.from(node.childNodes)){
      if(child.nodeType !== 1) continue;
      if(child.namespaceURI === DXR_W && (child.localName === 't' || child.localName === 'delText')){
        const del = !!dxrWithin(child, 'del');
        const ins = !!dxrWithin(child, 'ins');
        parts.push({text: child.textContent, ins: ins, del: del});
      } else if(child.namespaceURI === DXR_W && child.localName === 'tab'){
        parts.push({text: '\t', ins: false, del: false});
      } else if(child.namespaceURI === DXR_W && child.localName === 'br'){
        parts.push({text: '\n', ins: false, del: false});
      } else walk(child);
    }
  };
  walk(p);
  return parts;
}

/* A literal number typed at the start of a paragraph — "3." or "(a)" as
   characters rather than as list membership. On its own it is fine; on a
   paragraph that ALSO carries numPr it means the document now numbers itself
   twice, which is the most common way an exchanged document ends up reading
   "3. 4. Termination". */
const DXR_LITERAL_NUM = /^\s*(\(?\d{1,2}[.)]|\(?[a-z][.)]|\(?[ivx]{1,4}[.)])\s+/i;

function dxrParagraphs(doc){
  const out = [];
  const ps = doc.getElementsByTagNameNS(DXR_W, 'p');
  for(let i = 0; i < ps.length; i++){
    const p = ps[i];
    const runs = dxrRuns(p);
    const shown = runs.filter(r => !r.del).map(r => r.text).join('');
    const before = runs.filter(r => !r.ins).map(r => r.text).join('');
    const numPr = dxrFirst(p, 'numPr');
    const fmt = dxrDirectFormatting(p);
    out.push({
      index: i,
      style: dxrVal(p, 'pStyle'),
      text: shown.replace(/\s+/g, ' ').trim(),
      textBefore: before.replace(/\s+/g, ' ').trim(),
      inserted: runs.filter(r => r.ins).map(r => r.text).join('').trim(),
      deleted:  runs.filter(r => r.del).map(r => r.text).join('').trim(),
      numId: numPr ? dxrVal(numPr, 'numId') : null,
      ilvl:  numPr ? dxrVal(numPr, 'ilvl') : null,
      literalNumber: DXR_LITERAL_NUM.test(shown) ? (shown.match(DXR_LITERAL_NUM) || [''])[0].trim() : null,
      direct: fmt.props,
      overrides: fmt.overrides
    });
  }
  return out;
}

function dxrComments(xml){
  if(!xml) return [];
  const doc = dxrParseXml(xml, 'comments.xml');
  const out = [];
  const cs = doc.getElementsByTagNameNS(DXR_W, 'comment');
  for(let i = 0; i < cs.length; i++){
    const c = cs[i];
    out.push({
      id: c.getAttributeNS(DXR_W, 'id'),
      author: c.getAttributeNS(DXR_W, 'author') || '',
      date: c.getAttributeNS(DXR_W, 'date') || '',
      text: Array.from(dxrEl(c, 't')).map(t => t.textContent).join('').replace(/\s+/g, ' ').trim()
    });
  }
  return out;
}

/* Section properties, so page setup can be compared. */
function dxrSectPr(doc){
  const s = doc.getElementsByTagNameNS(DXR_W, 'sectPr')[0];
  if(!s) return null;
  const pgSz = dxrFirst(s, 'pgSz'), pgMar = dxrFirst(s, 'pgMar');
  const n = (el, a) => el ? Number(el.getAttributeNS(DXR_W, a)) : null;
  return {
    widthTw: n(pgSz, 'w'), heightTw: n(pgSz, 'h'),
    marginTw: pgMar ? {top: n(pgMar, 'top'), right: n(pgMar, 'right'),
                       bottom: n(pgMar, 'bottom'), left: n(pgMar, 'left'),
                       header: n(pgMar, 'header'), footer: n(pgMar, 'footer')} : null
  };
}

/* Style definitions, so a paragraph's effective font can be resolved when the
   paragraph itself carries no override. */
function dxrStyles(xml){
  if(!xml) return {};
  const doc = dxrParseXml(xml, 'styles.xml');
  const out = {};
  const ss = doc.getElementsByTagNameNS(DXR_W, 'style');
  for(let i = 0; i < ss.length; i++){
    const s = ss[i];
    const rPr = dxrFirst(s, 'rPr');
    const fonts = rPr ? dxrFirst(rPr, 'rFonts') : null;
    const sz = rPr ? dxrFirst(rPr, 'sz') : null;
    out[s.getAttributeNS(DXR_W, 'styleId')] = {
      name: dxrVal(s, 'name'),
      basedOn: dxrVal(s, 'basedOn'),
      font: fonts ? fonts.getAttributeNS(DXR_W, 'ascii') : null,
      sizeHalfPt: sz ? Number(sz.getAttributeNS(DXR_W, 'val')) : null
    };
  }
  return out;
}

/* ---- the whole document --------------------------------------------------- */
async function readDocx(arrayBuffer){
  const zip = await dxrReadZip(arrayBuffer);
  const docPart = zip.get('word/document.xml');
  if(!docPart) throw new Error('No word/document.xml — this is a zip, but not a Word document.');

  const doc = dxrParseXml(dxrText(docPart), 'document.xml');
  const paragraphs = dxrParagraphs(doc);
  const tracked = paragraphs.some(p => p.inserted || p.deleted);

  return {
    paragraphs: paragraphs,
    hasTrackedChanges: tracked,
    comments: dxrComments(zip.has('word/comments.xml') ? dxrText(zip.get('word/comments.xml')) : null),
    styles: dxrStyles(zip.has('word/styles.xml') ? dxrText(zip.get('word/styles.xml')) : null),
    sectPr: dxrSectPr(doc),
    parts: Array.from(zip.keys()),
    /* The two views. `text` is the document as it now reads — accepted view,
       what the substantive comparison runs against. `textBefore` is what it
       said before their tracked edits, which is only meaningful where Track
       Changes was actually used. */
    text: paragraphs.map(p => p.text).filter(Boolean).join('\n\n'),
    textBefore: paragraphs.map(p => p.textBefore).filter(Boolean).join('\n\n')
  };
}

/* ---- PDF -----------------------------------------------------------------
   Deliberately triage rather than extraction. See docs/ingestion.md: a PDF
   carries no styles, so it can never answer the formatting question, and a
   half-reliable text extractor would feed garbled text into the redline
   comparison and produce a page of false findings. Refusing with a route that
   works beats guessing.                                                      */
function inspectPdf(arrayBuffer){
  const u8 = new Uint8Array(arrayBuffer);
  const head = new TextDecoder('latin1').decode(u8.subarray(0, 1024));
  if(!/^%PDF-/.test(head)) throw new Error('Not a PDF.');
  const version = (head.match(/^%PDF-(\d+\.\d+)/) || [])[1] || '?';

  const body = new TextDecoder('latin1').decode(u8);
  const pages = (body.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const fonts = /\/Font\b/.test(body);
  const toUnicode = /\/ToUnicode\b/.test(body);
  const images = (body.match(/\/Subtype\s*\/Image/g) || []).length;

  /* A page with images and no fonts is a scan. That is the common case for a
     municipal record and there is no text in it to extract at all. */
  const likelyScanned = !fonts && images > 0;

  return {
    version: version, pages: pages, hasFonts: fonts, hasToUnicode: toUnicode,
    imageCount: images, likelyScanned: likelyScanned,
    verdict: likelyScanned ? 'scanned'
           : !fonts        ? 'no-text'
           : !toUnicode    ? 'text-without-unicode-map'
           : 'text-layer'
  };
}
