/* =============================================================================
   DOCUMENT FORMAT — the house style, as data.

   ONE OBJECT DEFINES THE DOCUMENT. It is what the writer emits and what the
   conformance checker measures a returned document against, so the two can
   never disagree about what "correct" means. Change a value here and both
   sides move together.

   WHERE THE VALUES CAME FROM. Read out of the amendment template's own
   styles.xml, numbering.xml and sectPr — not invented. The template is a
   placeholder until legal issues a spec; every value below is one line to
   change and docs/document-format.md records what each one was.

   WHAT WAS NORMALISED, AND WHY. The template has already drifted, which is the
   whole reason this file exists. It contains:

     - docDefaults at 12pt while Normal says 11pt
     - body text at 11pt and numbered paragraphs at 12pt
     - character scaling at 100%, 105% and 107% in different styles
     - direct character spacing of -2, +9 and +40 twips
     - eight paragraphs double-spaced in an otherwise single-spaced document

   Those are the fingerprints of a document round-tripped through a converter
   and then hand-edited. Encoding them literally would make the checker enforce
   the damage, and a conformance spec that contradicts itself cannot be checked
   at all. So the sizes are unified, scaling is 100%, character spacing is
   removed, and line spacing is stated once. Everything normalised is listed in
   docs/document-format.md with its original value.

   UNITS. Twips throughout for lengths (1440 per inch, 20 per point). Font size
   is HALF-POINTS, which is what OOXML wants: 22 is 11pt.
   ============================================================================= */

const DOCX_FORMAT = {
  meta: {
    name: 'Amendment house style',
    basedOn: 'Lease Amendment Proposal Template.docx',
    status: 'placeholder — to be replaced by legal'
  },

  page: {
    /* Letter. Margins are the template's, to the twip. They are not round
       numbers and that is deliberate: they are what the document actually
       uses, and rounding them would silently reflow every page. */
    widthTw: 12240, heightTw: 15840,
    marginTw: {top: 1820, right: 1100, bottom: 1500, left: 1380, header: 432, footer: 432}
  },

  /* The single body font and size. The template disagreed with itself here —
     11pt in Normal, 12pt in ListParagraph — so numbered sections and the
     paragraphs between them rendered at different sizes. Unified at 11pt,
     which is what Normal (the style that governs most of the document) said. */
  body: {
    font: 'Times New Roman',
    sizeHalfPt: 22,                 // 11pt
    jc: 'both',                     // justified, from pPrDefault
    firstLineTw: 720,               // 0.5", from pPrDefault
    lineRule: 'auto', lineTw: 240,  // single. The template's stray double-spaced
                                    // paragraphs are not reproduced.
    spaceBeforeTw: 0, spaceAfterTw: 120,
    widowControl: true              // never specified in the template, so it was
                                    // relying on Word's default. Stated here.
  },

  heading: {
    font: 'Times New Roman',
    sizeHalfPt: 22,
    bold: true,
    jc: 'center',
    allCaps: true,
    spaceBeforeTw: 0, spaceAfterTw: 240,
    keepNext: true,                 // a heading must not sit alone at a page foot
    keepLines: true
  },

  /* Auto-numbering, per the decision to use real list definitions rather than
     typed numbers. lvlText follows the template: "%1." at the top level and
     "%2." below it — NOT "%1.%2.", so sub-parts restart rather than reading
     3.1, 3.2. That is what the template does and it is a real drafting choice,
     so it is preserved rather than "corrected". */
  numbering: {
    levels: [
      {fmt: 'decimal', text: '%1.', leftTw: 216,  hangingTw: 360},
      {fmt: 'decimal', text: '%2.', leftTw: 936,  hangingTw: 360},
      {fmt: 'bullet',  text: '•', leftTw: 1656, hangingTw: 360}
    ]
  },

  /* Continuation paragraphs inside a numbered section: no number of their own,
     indented to the text edge of the number above so the block reads as one
     section. Derived from the numbering indents rather than restated, because
     restating them is how the two drift apart. */
  continuationIndentTw: 216,

  signature: {spaceBeforeTw: 480, keepLines: true}
};

/* ---- XML helpers ---------------------------------------------------------- */
function dxEsc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const DX_XMLNS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const DX_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

/* Run properties, in schema order. Word is strict about the order of children
   inside rPr and pPr; out of order, it repairs the file on open, which is
   both alarming to the recipient and destroys whatever it could not parse. */
/* `plain` emits font and size only.

   USE IT FOR EVERY RUN IN THE BODY. Bold, caps and alignment belong to the
   STYLE; repeating them on the run is belt-and-braces that costs the one thing
   the drift check depends on. The conformance reader treats anything beyond
   font and size as direct formatting — correctly — so a heading whose run
   restates the bold its own style already declares makes our own document fail
   our own check. It did, and that is how this was found. */
function dxRunProps(f, o){
  o = o || {};
  let s = '<w:rPr>';
  s += '<w:rFonts w:ascii="' + dxEsc(f.font) + '" w:hAnsi="' + dxEsc(f.font) +
       '" w:cs="' + dxEsc(f.font) + '"/>';
  if(!o.plain){
    if(o.bold || f.bold) s += '<w:b/><w:bCs/>';
    if(o.italic) s += '<w:i/><w:iCs/>';
    if(f.allCaps && o.caps !== false) s += '<w:caps/>';
  }
  s += '<w:sz w:val="' + f.sizeHalfPt + '"/><w:szCs w:val="' + f.sizeHalfPt + '"/>';
  s += '</w:rPr>';
  return s;
}

function dxParaProps(fmt, kind, o){
  o = o || {};
  const b = fmt.body, h = fmt.heading;
  const isH = kind === 'heading';
  const f = isH ? h : b;
  let s = '<w:pPr>';
  if(o.style) s += '<w:pStyle w:val="' + dxEsc(o.style) + '"/>';
  if(isH && h.keepNext) s += '<w:keepNext/>';
  if((isH && h.keepLines) || o.keepLines) s += '<w:keepLines/>';
  if(b.widowControl) s += '<w:widowControl/>';
  if(o.numId != null)
    s += '<w:numPr><w:ilvl w:val="' + (o.ilvl || 0) + '"/><w:numId w:val="' + o.numId + '"/></w:numPr>';
  s += '<w:spacing w:before="' + (o.spaceBeforeTw != null ? o.spaceBeforeTw : f.spaceBeforeTw) +
       '" w:after="' + (o.spaceAfterTw != null ? o.spaceAfterTw : f.spaceAfterTw) +
       '" w:line="' + b.lineTw + '" w:lineRule="' + b.lineRule + '"/>';
  if(o.indLeftTw != null || o.firstLineTw != null || o.hangingTw != null){
    s += '<w:ind';
    if(o.indLeftTw != null) s += ' w:left="' + o.indLeftTw + '"';
    if(o.hangingTw != null) s += ' w:hanging="' + o.hangingTw + '"';
    else if(o.firstLineTw != null) s += ' w:firstLine="' + o.firstLineTw + '"';
    s += '/>';
  }
  s += '<w:jc w:val="' + (o.jc || f.jc) + '"/>';
  if(isH) s += '<w:outlineLvl w:val="0"/>';
  s += '</w:pPr>';
  return s;
}

/* ---- the package parts ---------------------------------------------------- */
function docxStylesXml(fmt){
  const b = fmt.body, h = fmt.heading;
  let s = DX_DECL + '<w:styles ' + DX_XMLNS + '>';

  /* docDefaults states the body font once. The template set a size here that
     its own Normal style then contradicted; there is one size now. */
  s += '<w:docDefaults><w:rPrDefault><w:rPr>' +
       '<w:rFonts w:ascii="' + dxEsc(b.font) + '" w:hAnsi="' + dxEsc(b.font) +
       '" w:cs="' + dxEsc(b.font) + '"/>' +
       '<w:sz w:val="' + b.sizeHalfPt + '"/><w:szCs w:val="' + b.sizeHalfPt + '"/>' +
       '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>' +
       '<w:widowControl/>' +
       '<w:spacing w:before="' + b.spaceBeforeTw + '" w:after="' + b.spaceAfterTw +
       '" w:line="' + b.lineTw + '" w:lineRule="' + b.lineRule + '"/>' +
       '<w:jc w:val="' + b.jc + '"/>' +
       '</w:pPr></w:pPrDefault></w:docDefaults>';

  s += '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
       '<w:name w:val="Normal"/><w:qFormat/>' +
       dxParaProps(fmt, 'body', {firstLineTw: b.firstLineTw}) +
       dxRunProps(b, {caps: false}) + '</w:style>';

  s += '<w:style w:type="paragraph" w:styleId="BodyText">' +
       '<w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
       '</w:style>';

  /* Numbered sections. The number itself comes from numbering.xml; the indents
     here match it so the text edge lines up. */
  s += '<w:style w:type="paragraph" w:styleId="AmendmentSection">' +
       '<w:name w:val="Amendment Section"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
       dxParaProps(fmt, 'body', {indLeftTw: fmt.numbering.levels[0].leftTw,
                                 hangingTw: fmt.numbering.levels[0].hangingTw}) +
       '</w:style>';

  s += '<w:style w:type="paragraph" w:styleId="AmendmentContinuation">' +
       '<w:name w:val="Amendment Continuation"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
       dxParaProps(fmt, 'body', {indLeftTw: fmt.continuationIndentTw, firstLineTw: b.firstLineTw}) +
       '</w:style>';

  s += '<w:style w:type="paragraph" w:styleId="Heading1">' +
       '<w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="BodyText"/><w:qFormat/>' +
       dxParaProps(fmt, 'heading', {}) + dxRunProps(h, {}) + '</w:style>';

  s += '<w:style w:type="paragraph" w:styleId="SignatureBlock">' +
       '<w:name w:val="Signature Block"/><w:basedOn w:val="Normal"/><w:qFormat/>' +
       dxParaProps(fmt, 'body', {spaceBeforeTw: fmt.signature.spaceBeforeTw,
                                 keepLines: true, jc: 'left'}) + '</w:style>';

  s += '</w:styles>';
  return s;
}

function docxNumberingXml(fmt){
  let s = DX_DECL + '<w:numbering ' + DX_XMLNS + '>';
  s += '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>';
  fmt.numbering.levels.forEach((lv, i) => {
    s += '<w:lvl w:ilvl="' + i + '">' +
         (lv.fmt === 'bullet' ? '' : '<w:start w:val="1"/>') +
         '<w:numFmt w:val="' + lv.fmt + '"/>' +
         '<w:lvlText w:val="' + dxEsc(lv.text) + '"/>' +
         '<w:lvlJc w:val="left"/>' +
         '<w:pPr><w:ind w:left="' + lv.leftTw + '" w:hanging="' + lv.hangingTw + '"/></w:pPr>' +
         /* The number renders in the body font at the body size, and at 100%
            scaling. The template ran its numbers at 107%, so the digits were
            fractionally wider than the text they introduced. */
         '<w:rPr><w:rFonts w:ascii="' + dxEsc(fmt.body.font) + '" w:hAnsi="' + dxEsc(fmt.body.font) +
         '" w:cs="' + dxEsc(fmt.body.font) + '"/><w:b w:val="0"/>' +
         '<w:sz w:val="' + fmt.body.sizeHalfPt + '"/></w:rPr>' +
         '</w:lvl>';
  });
  s += '</w:abstractNum>';
  s += '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
  s += '</w:numbering>';
  return s;
}

function docxSettingsXml(){
  /* Deliberately small. Two settings earn their place: even-odd headers off,
     and tracked-changes display left alone. Everything else Word supplies. */
  return DX_DECL + '<w:settings ' + DX_XMLNS + '>' +
         '<w:defaultTabStop w:val="720"/>' +
         '<w:characterSpacingControl w:val="doNotCompress"/>' +
         '</w:settings>';
}

function docxContentTypesXml(){
  return DX_DECL +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
}

function docxRootRelsXml(){
  return DX_DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';
}

function docxDocumentRelsXml(){
  return DX_DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
    '</Relationships>';
}

function docxCorePropsXml(o){
  o = o || {};
  const now = (o.date || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z';
  return DX_DECL +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + dxEsc(o.title || '') + '</dc:title>' +
    '<dc:creator>' + dxEsc(o.author || '') + '</dc:creator>' +
    '<cp:lastModifiedBy>' + dxEsc(o.author || '') + '</cp:lastModifiedBy>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
    '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
    '</cp:coreProperties>';
}

function docxAppPropsXml(){
  return DX_DECL +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>Lease negotiation toolkit</Application>' +
    '</Properties>';
}
