/* =============================================================================
   DOCX WRITER — a real Word document, with no dependency and no build step.

   A .docx is a zip of XML parts. Both halves of that are writable here:

     THE ZIP is written with STORE (no compression). Word accepts uncompressed
     entries, which removes the only part that would have needed a library.
     The cost is file size — an amendment runs tens of kilobytes either way, so
     it does not matter. What it buys is that the whole writer is about a
     hundred lines of arithmetic anyone can audit, rather than a vendored
     deflate implementation nobody will read.

     THE XML is written against the format spec in src/docx-style.js. Nothing
     here decides what a document looks like; it decides how the spec becomes
     bytes.

   WHY THIS EXISTS AT ALL. Word-openable HTML was what the drafter produced
   before, and Word does open it — but it arrives with no styles, no real
   numbering and no page setup, so the first thing anyone does is reformat it
   by hand. That hand-formatting is the drift, on round one, before the
   landlord has seen it.

   EVERY PARAGRAPH CARRIES A NAMED STYLE AND NOTHING ELSE. No direct
   formatting anywhere. That is what makes drift detectable later: direct
   formatting in a returned document is, by construction, something someone
   added.

   Loaded as a classic script after docx-style.js.
   ============================================================================= */

/* ---- CRC32, table-built on first use ------------------------------------- */
let DX_CRC_TABLE = null;
function dxCrcTable(){
  if(DX_CRC_TABLE) return DX_CRC_TABLE;
  const t = new Uint32Array(256);
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return (DX_CRC_TABLE = t);
}
function dxCrc32(bytes){
  const t = dxCrcTable();
  let c = 0xFFFFFFFF;
  for(let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ---- STORE zip ------------------------------------------------------------
   Entries are written in order, then a central directory, then the end record.
   Everything little-endian.                                                  */
function dxZipStore(files){
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;

  /* MS-DOS date/time. Fixed rather than "now" so that the same document
     produces the same bytes twice — a document that differs from itself on
     every export cannot be diffed, and diffing exports is how a formatting
     regression gets caught. */
  const dosTime = 0, dosDate = ((2020 - 1980) << 9) | (1 << 5) | 1;

  files.forEach(f => {
    const nameBytes = enc.encode(f.name);
    const data = (f.data instanceof Uint8Array) ? f.data : enc.encode(f.data);
    const crc = dxCrc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034B50, true);   // local file header signature
    lv.setUint16(4, 20, true);           // version needed
    lv.setUint16(6, 0, true);            // flags
    lv.setUint16(8, 0, true);            // method 0 = store
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); // compressed size
    lv.setUint32(22, data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);           // extra length
    local.set(nameBytes, 30);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014B50, true);   // central directory signature
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);           // extra
    cv.setUint16(32, 0, true);           // comment
    cv.setUint16(34, 0, true);           // disk number
    cv.setUint16(36, 0, true);           // internal attrs
    cv.setUint32(38, 0, true);           // external attrs
    cv.setUint32(42, offset, true);      // offset of local header
    cd.set(nameBytes, 46);

    parts.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
  });

  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054B50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const all = parts.concat(central, [eocd]);
  const total = all.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  all.forEach(p => { out.set(p, at); at += p.length; });
  return out;
}

/* ---- paragraphs ----------------------------------------------------------- */
/* A run. `w:t` needs xml:space="preserve" or Word eats leading and trailing
   spaces, which silently closes up the gap after a numbered lead-in. */
function dxRun(text, fmt, o){
  return '<w:r>' + dxRunProps(fmt, o || {}) +
         '<w:t xml:space="preserve">' + dxEsc(text) + '</w:t></w:r>';
}

function dxPara(style, runsXml, propsXml){
  return '<w:p>' + (propsXml || '<w:pPr><w:pStyle w:val="' + dxEsc(style) + '"/></w:pPr>') +
         (runsXml || '') + '</w:p>';
}

/* A clause becomes one NUMBERED paragraph plus unnumbered continuations.
   Splitting on blank lines matters: giving every paragraph of a clause its own
   number is the most common way an assembled amendment comes out reading as
   twelve sections when it has four. */
function dxClauseParas(text, fmt){
  const blocks = String(text || '').split(/\n\s*\n+/).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if(!blocks.length) return '';
  let s = '';
  blocks.forEach((b, i) => {
    if(i === 0){
      /* pStyle and numPr, nothing else. Everything visual comes from the style,
         so a returned document carrying anything more on this paragraph is
         carrying something a person added. numPr sits on the paragraph rather
         than in the style because list membership survives copy-paste between
         documents that way, and copy-paste between documents is what a redline
         cycle mostly is. */
      s += '<w:p>' +
           '<w:pPr><w:pStyle w:val="AmendmentSection"/>' +
           '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' +
           dxRun(b, fmt.body, {plain: true}) + '</w:p>';
    } else {
      s += dxPara('AmendmentContinuation', dxRun(b, fmt.body, {plain: true}));
    }
  });
  return s;
}

/* ---- the document --------------------------------------------------------- */
function docxDocumentXml(doc, fmt){
  const b = fmt.body;
  let s = DX_DECL + '<w:document ' + DX_XMLNS + '><w:body>';

  /* `plain` throughout the body: bold, caps and alignment come from the styles,
     never from the runs. The heading used to restate its own style's bold and
     caps on the run, which made our own document report direct formatting to
     our own conformance check. */
  if(doc.title) s += dxPara('Heading1', dxRun(doc.title, fmt.heading, {plain: true}));

  (doc.preamble || []).forEach(p => { s += dxPara('BodyText', dxRun(p, b, {plain: true})); });

  (doc.clauses || []).forEach(c => { s += dxClauseParas(c.text, fmt); });

  (doc.closing || []).forEach(p => { s += dxPara('BodyText', dxRun(p, b, {plain: true})); });

  (doc.signature || []).forEach(p => { s += dxPara('SignatureBlock', dxRun(p, b, {plain: true})); });

  /* The body must end with sectPr, and page setup lives in it. */
  const m = fmt.page.marginTw;
  s += '<w:sectPr>' +
       '<w:pgSz w:w="' + fmt.page.widthTw + '" w:h="' + fmt.page.heightTw + '"/>' +
       '<w:pgMar w:top="' + m.top + '" w:right="' + m.right + '" w:bottom="' + m.bottom +
       '" w:left="' + m.left + '" w:header="' + m.header + '" w:footer="' + m.footer + '" w:gutter="0"/>' +
       '<w:cols w:space="720"/>' +
       '</w:sectPr>';

  s += '</w:body></w:document>';
  return s;
}

/* Assemble the package. Returns a Blob ready to download.

   [Content_Types].xml must be first in the archive — the spec does not require
   it, but enough consumers assume it that putting it anywhere else is asking
   for a file that opens in Word and fails somewhere else. */
function buildDocx(doc, opts){
  const fmt = (opts && opts.format) || DOCX_FORMAT;
  const files = [
    {name: '[Content_Types].xml',        data: docxContentTypesXml()},
    {name: '_rels/.rels',                data: docxRootRelsXml()},
    {name: 'docProps/core.xml',          data: docxCorePropsXml({title: doc.title,
                                                                 author: (opts && opts.author) || '',
                                                                 date: (opts && opts.date) || null})},
    {name: 'docProps/app.xml',           data: docxAppPropsXml()},
    {name: 'word/document.xml',          data: docxDocumentXml(doc, fmt)},
    {name: 'word/_rels/document.xml.rels', data: docxDocumentRelsXml()},
    {name: 'word/styles.xml',            data: docxStylesXml(fmt)},
    {name: 'word/numbering.xml',         data: docxNumberingXml(fmt)},
    {name: 'word/settings.xml',          data: docxSettingsXml()}
  ];
  const bytes = dxZipStore(files);
  return new Blob([bytes],
    {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
