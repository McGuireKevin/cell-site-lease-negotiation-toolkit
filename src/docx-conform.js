/* =============================================================================
   FORMATTING CONFORMANCE — where the returned document drifted.

   The redline comparison reads what the words SAY. This reads what the
   formatting DID, and the two fail differently: a substantive change is
   visible to anyone who reads the clause, while formatting drift is invisible
   until it has accumulated across six rounds and the document reads as though
   nobody owned it.

   ONE OF THESE HAS TEETH AND THE REST ARE HYGIENE. Broken numbering is not
   cosmetic: if section numbers renumber or duplicate, every cross-reference in
   the document points at the wrong clause, and the document is then wrong in a
   way that reads as clean. It is checked first and scored highest.

   THE MEASUREMENT ONLY WORKS BECAUSE OF WHAT THE WRITER DOES. src/docx-writer.js
   emits pStyle and numPr and nothing else, so direct formatting found here was
   added by a person. The moment the writer starts emitting direct formatting,
   this check stops meaning anything — which is why that invariant has its own
   test.

   Loaded after docx-style.js (for DOCX_FORMAT) and docx-read.js.
   ============================================================================= */

const DXC_KNOWN_STYLES = ['Normal', 'BodyText', 'AmendmentSection',
                          'AmendmentContinuation', 'Heading1', 'SignatureBlock'];

function dxcFinding(o){
  return Object.assign({kind: 'formatting', risk: 'low', paragraphs: []}, o);
}

/* Human-readable name for a direct-formatting property, because "pPr/jc" tells
   a reviewer nothing and "alignment" tells them where to look. */
const DXC_PROP_NAMES = {
  'pPr/jc': 'alignment', 'pPr/ind': 'indent', 'pPr/spacing': 'line or paragraph spacing',
  'pPr/keepNext': 'keep-with-next', 'pPr/keepLines': 'keep-lines-together',
  'pPr/widowControl': 'widow/orphan control', 'pPr/pageBreakBefore': 'page break before',
  'pPr/shd': 'shading', 'pPr/pBdr': 'borders', 'pPr/tabs': 'tab stops',
  'pPr/contextualSpacing': 'contextual spacing', 'pPr/outlineLvl': 'outline level',
  'rPr/b': 'bold', 'rPr/i': 'italic', 'rPr/u': 'underline', 'rPr/color': 'text colour',
  'rPr/highlight': 'highlighting', 'rPr/strike': 'strikethrough', 'rPr/caps': 'all caps',
  'rPr/spacing': 'character spacing', 'rPr/w': 'character scaling', 'rPr/position': 'raised/lowered text'
};
const dxcName = p => DXC_PROP_NAMES[p] || p;

function conformDocx(doc, fmt){
  fmt = fmt || DOCX_FORMAT;
  const findings = [];
  const paras = doc.paragraphs.filter(p => p.text);

  /* ---- 1. numbering — the one that matters ---------------------------- */
  const sections = paras.filter(p => p.style === 'AmendmentSection');

  const lostNumber = sections.filter(p => !p.numId);
  if(lostNumber.length){
    findings.push(dxcFinding({
      signal: 'numbering-lost', risk: 'high',
      label: lostNumber.length + ' numbered section' + (lostNumber.length === 1 ? '' : 's') +
             ' lost list membership',
      detail: lostNumber.slice(0, 3).map(p => '¶' + (p.index + 1) + ' ' + p.text.slice(0, 60)).join(' · '),
      why: 'The paragraph still carries the section style but is no longer in the list, so it will ' +
           'not number itself. Everything after it renumbers, and every cross-reference to a later ' +
           'section now points at the wrong clause.',
      paragraphs: lostNumber.map(p => p.index)
    }));
  }

  const doubleNumbered = paras.filter(p => p.numId && p.literalNumber);
  if(doubleNumbered.length){
    findings.push(dxcFinding({
      signal: 'numbering-doubled', risk: 'high',
      label: doubleNumbered.length + ' paragraph' + (doubleNumbered.length === 1 ? '' : 's') +
             ' numbered twice',
      detail: doubleNumbered.slice(0, 3).map(p => '¶' + (p.index + 1) + ' typed "' + p.literalNumber + '"').join(' · '),
      why: 'A number was typed into a paragraph that Word is already numbering. It reads as ' +
           '"3. 4. Termination" — and it usually means someone fixed a renumbering they did not ' +
           'realise was automatic, which will drift again on the next edit.',
      paragraphs: doubleNumbered.map(p => p.index)
    }));
  }

  /* Sections split across list definitions. Copy-paste between documents merges
     or forks list definitions, and a forked list restarts at 1. */
  const numIds = [...new Set(sections.map(p => p.numId).filter(Boolean))];
  if(numIds.length > 1){
    findings.push(dxcFinding({
      signal: 'numbering-split', risk: 'high',
      label: 'The sections belong to ' + numIds.length + ' different lists',
      detail: 'numId ' + numIds.join(', '),
      why: 'One document, one list. Two means the sections were pasted in from somewhere, and a ' +
           'second list restarts its own numbering — so the document counts 1, 2, 3, 1, 2 and ' +
           'looks correct only until someone reads the numbers.',
      paragraphs: sections.filter(p => p.numId !== numIds[0]).map(p => p.index)
    }));
  }

  /* ---- 2. direct formatting — the invariant --------------------------- */
  const withDirect = paras.filter(p => p.direct.length);
  if(withDirect.length){
    const props = {};
    withDirect.forEach(p => p.direct.forEach(d => { props[d] = (props[d] || 0) + 1; }));
    const listed = Object.keys(props).sort((a, b) => props[b] - props[a])
                     .map(k => dxcName(k) + ' ×' + props[k]);
    findings.push(dxcFinding({
      signal: 'direct-formatting', risk: withDirect.length > paras.length / 4 ? 'medium' : 'low',
      label: withDirect.length + ' of ' + paras.length + ' paragraphs carry direct formatting',
      detail: listed.slice(0, 6).join(' · '),
      why: 'The document we sent carried named styles and nothing else, so every one of these was ' +
           'added by hand. Individually harmless; across six rounds it is how a document stops ' +
           'having a style at all and starts having a history.',
      paragraphs: withDirect.map(p => p.index)
    }));
  }

  /* ---- 3. font and size ------------------------------------------------ */
  const wrongFont = paras.filter(p => p.overrides.font && p.overrides.font !== fmt.body.font);
  if(wrongFont.length){
    const fonts = [...new Set(wrongFont.map(p => p.overrides.font))];
    findings.push(dxcFinding({
      signal: 'font-changed', risk: 'medium',
      label: 'Font overridden on ' + wrongFont.length + ' paragraph' + (wrongFont.length === 1 ? '' : 's'),
      detail: fonts.join(', ') + ' where the house style is ' + fmt.body.font,
      why: 'Usually arrives with pasted text, carrying whatever the other document used. It is the ' +
           'most visible kind of drift and the one a counterparty notices first.',
      paragraphs: wrongFont.map(p => p.index)
    }));
  }

  const wrongSize = paras.filter(p => p.overrides.sizeHalfPt && p.overrides.sizeHalfPt !== fmt.body.sizeHalfPt);
  if(wrongSize.length){
    const sizes = [...new Set(wrongSize.map(p => (p.overrides.sizeHalfPt / 2) + 'pt'))];
    findings.push(dxcFinding({
      signal: 'size-changed', risk: 'medium',
      label: 'Font size overridden on ' + wrongSize.length + ' paragraph' + (wrongSize.length === 1 ? '' : 's'),
      detail: sizes.join(', ') + ' where the house style is ' + (fmt.body.sizeHalfPt / 2) + 'pt',
      why: 'The template this style came from had exactly this problem — body text at one size and ' +
           'numbered paragraphs at another. It is invisible on screen and obvious in print.',
      paragraphs: wrongSize.map(p => p.index)
    }));
  }

  /* ---- 4. foreign styles ---------------------------------------------- */
  const foreign = paras.filter(p => p.style && DXC_KNOWN_STYLES.indexOf(p.style) < 0);
  if(foreign.length){
    const names = [...new Set(foreign.map(p => p.style))];
    findings.push(dxcFinding({
      signal: 'foreign-style', risk: 'medium',
      label: names.length + ' style' + (names.length === 1 ? '' : 's') + ' that we did not send',
      detail: names.slice(0, 6).join(', '),
      why: 'A style the document did not start with came in with pasted content, and brought that ' +
           'document\'s formatting with it. Where a section carries one, it is no longer governed ' +
           'by the house style at all.',
      paragraphs: foreign.map(p => p.index)
    }));
  }

  /* ---- 5. page setup --------------------------------------------------- */
  if(doc.sectPr){
    const s = doc.sectPr, m = s.marginTw || {}, want = fmt.page.marginTw;
    const off = [];
    if(s.widthTw && s.widthTw !== fmt.page.widthTw) off.push('page width');
    if(s.heightTw && s.heightTw !== fmt.page.heightTw) off.push('page height');
    ['top', 'right', 'bottom', 'left'].forEach(k => {
      if(m[k] != null && m[k] !== want[k])
        off.push(k + ' margin ' + (m[k] / 1440).toFixed(2) + '" vs ' + (want[k] / 1440).toFixed(2) + '"');
    });
    if(off.length){
      findings.push(dxcFinding({
        signal: 'page-setup-changed', risk: 'low',
        label: 'Page setup changed',
        detail: off.join(', '),
        why: 'Reflows every page against the version already in circulation, so page and line ' +
             'references in correspondence stop matching the document.',
        paragraphs: []
      }));
    }
  }

  const rank = {high: 0, medium: 1, low: 2};
  findings.sort((a, b) => rank[a.risk] - rank[b.risk]);

  return {
    findings: findings,
    summary: {
      paragraphs: paras.length,
      high: findings.filter(f => f.risk === 'high').length,
      medium: findings.filter(f => f.risk === 'medium').length,
      low: findings.filter(f => f.risk === 'low').length,
      numberingIntact: !findings.some(f => f.signal.indexOf('numbering') === 0),
      directFormattingCount: withDirect.length
    }
  };
}

/* Formatting findings become deviations like any other, so they go through the
   same accept/reject discipline and reach the final report the same way. They
   carry kind:'formatting' so the report can group them — a reviewer deciding
   about a font is doing something different from a reviewer deciding about a
   termination right, even though both must be decided. */
function conformToDeviations(conform, opts){
  const o = opts || {};
  return conform.findings.map(f => ({
    key: 'fmt:r' + (o.round == null ? 1 : o.round) + ':' + f.signal,
    round: o.round == null ? 1 : o.round,
    date: o.date || '',
    kind: 'formatting',
    summary: f.label + ' — ' + f.detail,
    origin: o.origin || 'landlord-redline',
    risk: f.risk,
    raisedBy: 'docx-conform',
    rationale: f.why
  }));
}
