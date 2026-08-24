/* =============================================================================
   CLAUSE ASSEMBLER — resolve a clause selection against a deal file.

   Separate from the UI so it can be tested. tests.html exercises it directly.

   THE CENTRAL RULE: a document must not be PRODUCIBLE with an unresolved
   placeholder in it. In the process this replaces, "Section XX" reached
   executed amendments because filling it in was a review-checklist item. A
   checklist catches it most of the time; a hard failure catches it every time.

   Loaded as a classic script after lease-engine.js.
   ============================================================================= */

/* ---- number to words -------------------------------------------------------
   Legal drafting states figures twice — "two thousand two hundred fifty dollars
   ($2,250.00)" — because the words control if the two disagree. So the words
   are not decoration, and generating them wrongly is worse than leaving them
   blank: a document whose words and figures disagree says something nobody
   intended.                                                                  */
const ONES = ['','one','two','three','four','five','six','seven','eight','nine','ten','eleven',
  'twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];

function under1000(n){
  let s = '';
  if(n >= 100){ s += ONES[Math.floor(n/100)] + ' hundred'; n %= 100; if(n) s += ' '; }
  if(n >= 20){ s += TENS[Math.floor(n/10)]; n %= 10; if(n) s += '-' + ONES[n]; }
  else if(n > 0){ s += ONES[n]; }
  return s;
}

function numberToWords(n){
  n = Math.floor(Math.abs(Number(n)||0));
  if(n === 0) return 'zero';
  const scales = [[1e9,'billion'],[1e6,'million'],[1e3,'thousand']];
  let s = '';
  for(const [v,name] of scales){
    if(n >= v){ s += (s?' ':'') + under1000(Math.floor(n/v)) + ' ' + name; n %= v; }
  }
  if(n > 0) s += (s?' ':'') + under1000(n);
  return s;
}

/* "two thousand two hundred fifty dollars" / "... and 50/100 dollars" */
function moneyToWords(amount){
  const a = Number(amount);
  if(isNaN(a)) return '';
  const whole = Math.floor(Math.abs(a));
  const cents = Math.round((Math.abs(a) - whole) * 100);
  const w = numberToWords(whole) + ' dollars';
  return cents ? numberToWords(whole) + ' and ' + String(cents).padStart(2,'0') + '/100 dollars' : w;
}

/* "ten percent" / "two and one-half percent" is beyond what this needs — a
   fractional rate is written as "three and twenty-five hundredths percent",
   which nobody drafts. Where the rate is not whole, return '' so the caller
   surfaces it rather than emitting something odd. */
function percentToWords(pct){
  const p = Number(pct);
  if(isNaN(p)) return '';
  if(p !== Math.floor(p)) return '';
  return numberToWords(p) + ' percent';
}

/* ---- date formatting -------------------------------------------------------
   Amendments spell dates out. Uses the engine's UTC parser so a date never
   shifts by a day against the figures the comparator produced from the same
   string.                                                                    */
const MONTHS = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'];
function dateToWords(iso){
  const d = pd(iso);
  if(!d) return '';
  return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}

/* ---- ordinals, for naming the amendment ---------------------------------- */
const ORDINALS = ['','First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth',
                  'Ninth','Tenth','Eleventh','Twelfth'];
function ordinalName(n){
  n = Number(n)||0;
  return ORDINALS[n] || (n + 'th');
}

/* =============================================================================
   RESOLUTION

   Builds the map of placeholder -> value from a deal file, and reports what it
   could NOT resolve. The caller must treat a non-empty `unresolved` as fatal.
   ============================================================================= */
function buildResolutionMap(deal, proposalId){
  const map = {}, why = {};
  const put = (k,v,src)=>{ if(v!=null && String(v)!==''){ map[k]=String(v); why[k]=src; } };

  const dt = deal.definedTerms || {};
  ['RentName','TermName','ExtensionName','AreaName','PropertyName','EquipmentName',
   'LandlordTitle','TenantTitle','DocumentType','LeaseDocument'].forEach(k=>{
    put(k, dt[k] && dt[k].value, 'definedTerms.'+k);
  });

  const site = deal.site || {};
  put('SiteName', site.siteName, 'site.siteName');
  put('FAN', site.fan, 'site.fan');
  put('Landlord_Name', site.landlord && site.landlord.name, 'site.landlord.name');
  put('Landlord_Address', site.landlord && site.landlord.address, 'site.landlord.address');
  put('Tenant_Notice_Entity', site.tenant, 'site.tenant');
  put('Tenant_Notice_Address', site.tenantNoticeAddress, 'site.tenantNoticeAddress');

  /* Governing law follows the site, which is the usual rule for a lease of
     land — and it was the one placeholder in the library that nothing
     supplied, so boilerplate.governing-law could never be assembled at all.
     Found by selecting every boilerplate clause at once, which is exactly what
     the drafter's "select recommended" does. */
  put('Governing_Jurisdiction', site.address && site.address.state, 'site.address.state');

  /* Negotiated drafting values. Five clauses referenced placeholders that
     nothing supplied, so each of them blocked the drafter every time, for
     every deal, from the day it was written. */
  const at = deal.amendmentTerms || {};
  put('Rent_Guarantee_End_Date', dateToWords(at.rentGuaranteeEndDate), 'amendmentTerms.rentGuaranteeEndDate');
  put('Insurance_CGL_Limit', at.insuranceCglLimit, 'amendmentTerms.insuranceCglLimit');
  put('Colocation_Share_Pct', at.colocationSharePct, 'amendmentTerms.colocationSharePct');
  put('ROFR_Notice_Days', at.rofrNoticeDays, 'amendmentTerms.rofrNoticeDays');
  put('RAD_Center_Feet', at.radCenterFeet, 'amendmentTerms.radCenterFeet');

  const term = deal.term || {};
  put('Lease_Commencement_Date', dateToWords(term.commencementDate), 'term.commencementDate');
  put('Current_Term_End_Date',   dateToWords(term.currentTermEnd),   'term.currentTermEnd');
  put('Extension_Term_Start_Date', dateToWords(term.extensionTermStart), 'term.extensionTermStart');

  /* The amendment names itself by its position in the chain. Derived rather
     than typed, because the stated title and the chronological position
     disagree often enough that typing it is how the wrong one gets used. */
  const chain = deal.documentChain || [];
  const amendments = chain.filter(d => (d.chronologicalOrdinal||0) > 0);
  put('Proposed_Amendment', ordinalName(amendments.length + 1) + ' Amendment',
      'derived from documentChain (' + amendments.length + ' existing amendments)');

  /* Commercial terms come from the CHOSEN proposal — the one that was agreed,
     not the opening position. */
  const prop = (deal.proposals||[]).find(p => p.id === proposalId) || (deal.proposals||[])[0];
  if(prop){
    if(prop.rentMode === 'absolute' && prop.rentValue !== '' && prop.rentValue != null){
      const monthly = prop.rentBasis === 'annual' ? Number(prop.rentValue)/12 : Number(prop.rentValue);
      put('RentProposal', monthly.toFixed(2), 'proposal ' + (prop.label||prop.id));
      put('RentProposal_Words', moneyToWords(monthly), 'derived from the proposal rent');
    }
    const esc = (prop.escalators||[]).find(e => e.type === 'fixed_pct');
    if(esc && esc.ratePct !== '' && esc.ratePct != null){
      put('EscalatorProposal', Number(esc.ratePct).toFixed(2), 'proposal escalator');
      put('EscalatorProposal_Words', percentToWords(esc.ratePct), 'derived from the proposal escalator');
    }
  }

  (Object.entries(deal.sectionMap || {})).forEach(([k,v])=>{
    put('sectionMap.' + k, v, 'sectionMap.' + k);
  });

  return {map, why, proposal: prop};
}

/* The documented form for a placeholder, from clauses/placeholders.json via the
   generated bundle. Returns null where the bundle is not loaded — the tests and
   any caller that only needs assembly should not have to carry the data. */
function placeholderSample(name){
  const lib = (typeof CLAUSE_PLACEHOLDERS !== 'undefined') ? CLAUSE_PLACEHOLDERS
            : (typeof window !== 'undefined' ? window.CLAUSE_PLACEHOLDERS : null);
  if(!lib || !lib.placeholders) return null;
  const base = String(name).replace(/_Words$/, '');
  return lib.placeholders.find(p => p.name === name) ||
         lib.placeholders.find(p => p.name === base) || null;
}

/* Every {{Placeholder}} used by the chosen clauses. */
function placeholdersIn(text){
  return [...new Set([...text.matchAll(/\{\{([A-Za-z0-9_\.]+)\}\}/g)].map(m=>m[1]))];
}

function resolveText(text, map){
  return text.replace(/\{\{([A-Za-z0-9_\.]+)\}\}/g, (m,k) => (k in map) ? map[k] : m);
}

/* =============================================================================
   READINESS — the gate

   Returns blocking problems and non-blocking warnings. A caller that produces a
   document while `blocking` is non-empty has defeated the point of this file.
   ============================================================================= */
function assess(deal, selectedIds, library, texts, proposalId){
  const blocking = [], warnings = [];
  const byId = {};
  library.clauses.forEach(c => byId[c.id] = c);

  const chosen = selectedIds.map(id => byId[id]).filter(Boolean);
  if(!chosen.length) blocking.push('No clauses selected.');

  /* --- mutually exclusive clauses --- */
  const sel = new Set(selectedIds);
  const seenPair = new Set();
  chosen.forEach(c => (c.conflictsWith||[]).forEach(x => {
    if(sel.has(x)){
      const key = [c.id,x].sort().join('|');
      if(seenPair.has(key)) return;
      seenPair.add(key);
      blocking.push('"'+c.title+'" and "'+(byId[x]?byId[x].title:x)+'" are mutually exclusive. '+
        'Both would amend the same thing, and the document would contradict itself.');
    }
  }));

  /* --- unmet requirements --- */
  const dt = deal.definedTerms || {};
  const audit = (deal.audit && deal.audit.terms) || {};
  chosen.forEach(c => (c.requires||[]).forEach(r => {
    if(r.startsWith('clause:')){
      const need = r.slice(7);
      if(!sel.has(need)) blocking.push('"'+c.title+'" requires "'+(byId[need]?byId[need].title:need)+
        '", which is not selected. Its cross-reference would dangle.');
    } else if(r.startsWith('definedTerm:')){
      const t = r.slice(12);
      const entry = dt[t] || {};
      if(!entry.value){
        blocking.push('"'+c.title+'" uses the defined term '+t+', which this lease does not define. '+
          'Adopt the term the lease actually uses, or define it in the amendment — the clause refers to nothing as drafted.');
      } else if(!entry.definedIn && !entry.redefinedHere){
        /* A value with no source is a term the amendment would INTRODUCE. That
           is legitimate when deliberate and marked, and a defect when not: the
           clause reads as though the term were already established, and nothing
           in the document establishes it. Capitalized-terms boilerplate does not
           help — it points at the Agreement, and the Agreement is silent. */
        blocking.push('"'+c.title+'" uses '+t+' = "'+entry.value+'", but no document in the chain '+
          'defines it. The clause would read as though the term were already established. '+
          'Either adopt the term the lease actually uses, or set redefinedHere so the amendment '+
          'defines it deliberately.');
      } else if(entry.redefinedHere && entry.definedIn){
        warnings.push('"'+c.title+'" uses '+t+', which is defined in '+entry.definedIn+
          ' AND redefined by this amendment. Redefining a term the lease already defines is the '+
          'drafting trap most likely to be argued later — confirm it is intended.');
      }
    } else if(r.startsWith('sectionMap:')){
      const k = r.slice(11);
      if(!(deal.sectionMap && deal.sectionMap[k])) blocking.push('"'+c.title+'" replaces a section, but '+
        'sectionMap.'+k+' is not recorded. An unfilled section number in an executed amendment is a real problem.');
    }
  }));

  /* --- placeholders --- */
  const {map, why} = buildResolutionMap(deal, proposalId);
  const needed = new Set();
  chosen.forEach(c => placeholdersIn(texts[c.id]||'').forEach(p => needed.add(p)));
  const unresolved = [...needed].filter(p => !(p in map)).sort();
  /* Quote the expected FORM back, not just the name. "Insurance_CGL_Limit has
     no value" tells you nothing about whether to write 3000000 or "Three
     Million Dollars ($3,000,000.00)" — and the first of those loads, validates
     and reads as "limits of not less than 3000000" in an executed document. */
  unresolved.forEach(p => {
    const s = placeholderSample(p);
    blocking.push('{{'+p+'}} has no value in the deal file. '+
      'A document must not be producible with an unresolved placeholder in it.' +
      (s ? ' Expected form: ' + s.sample + (s.source ? ' — from ' + s.source : '') + '.' : ''));
  });

  /* --- warnings: real, but not reasons to refuse --- */
  chosen.forEach(c => {
    if(c.provenance === 'researched')
      warnings.push('"'+c.title+'" is researched drafting, never used and not reviewed by counsel. '+
        'The risk is not that it is wrong in the abstract — it is that it may not fit this lease.');
    if(c.status === 'review')
      warnings.push('"'+c.title+'" is marked for review: '+(c.notes||'see the library'));
  });

  /* A clause whose subject the audit recorded as absent or ambiguous is a
     different problem from a missing defined term — the clause resolves, but it
     may be amending something that is not there. */
  chosen.forEach(c => {
    const t = audit[c.category] || audit[c.id];
    if(t && (t.status === 'absent' || t.status === 'ambiguous'))
      warnings.push('"'+c.title+'": the audit recorded this subject as '+t.status+
        '. Check the clause amends something that exists.');
  });

  const net = chosen.reduce((a,c)=>a + (Number(c.tenantBenefit)||0), 0);
  return {blocking, warnings, chosen, map, why, unresolved, netBenefit: net};
}

/* Assemble. Refuses rather than producing a defective document. */
function assemble(deal, selectedIds, library, texts, proposalId){
  const a = assess(deal, selectedIds, library, texts, proposalId);
  if(a.blocking.length) return {ok:false, assessment:a};
  const parts = a.chosen.map(c => ({
    id: c.id, title: c.title, category: c.category,
    text: resolveText(texts[c.id]||'', a.map)
  }));
  return {ok:true, assessment:a, parts};
}

/* =============================================================================
   RELATED TERMS — what a change drags in with it

   The audit finds problems ONE TERM AT A TIME. A draft trades ACROSS terms.
   The audit may flag the term length and record nothing against termination,
   and a first draft proposing a longer term should still put termination on
   the table in the same round — because a longer term without an exit is worse
   than the shorter one it replaced. No audit finding would ever surface that,
   because there was no finding to surface.

   Nothing here blocks. It is a prompt, and the reason attached to it is the
   product: a list of clause ids tells a drafter nothing they could act on.
   ============================================================================= */
function relatedClauses(selectedIds, library, impacts){
  const map = (impacts && impacts.byCategory) || {};
  const byId = {};
  library.clauses.forEach(c => byId[c.id] = c);
  const sel = new Set(selectedIds);

  /* Categories already in the draft. A category is "covered" as soon as one of
     its clauses is selected — the prompt is to consider the SUBJECT, and once
     the subject is in the document it has been considered. */
  const chosen = selectedIds.map(id => byId[id]).filter(Boolean);
  const covered = new Set(chosen.map(c => c.category));

  const out = [];
  const seen = new Set();
  chosen.forEach(c => {
    (map[c.category] || []).forEach(imp => {
      if(covered.has(imp.category)) return;         // already in the draft
      if(seen.has(imp.category)) return;            // one prompt per subject
      seen.add(imp.category);
      const options = library.clauses.filter(x => x.category === imp.category && !sel.has(x.id));
      if(!options.length) return;                   // nothing in the library to offer
      out.push({
        category: imp.category,
        because: imp.because,
        triggeredBy: c.id,
        triggeredByTitle: c.title,
        triggeredByCategory: c.category,
        /* Best first, so the prompt leads with the clause most worth having.
           Ties break on id to keep the order stable between renders. */
        options: options.slice().sort((a, b) =>
          ((Number(b.tenantBenefit)||0) - (Number(a.tenantBenefit)||0)) || (a.id < b.id ? -1 : 1))
      });
    });
  });
  return out;
}

/* Clause ids the audit put on the table, best case first.

   `do-not-raise` findings are excluded here as everywhere: some gaps are
   better left closed, and raising them invites the landlord to reopen
   something already settled. They stay browsable in the full list — the point
   is that they are not RECOMMENDED, not that they are hidden. */
function auditFlagged(deal, library){
  const byId = {};
  library.clauses.forEach(c => byId[c.id] = c);
  const rank = {'must-have':0, 'should-have':1, 'nice-to-have':2};
  return (((deal.audit||{}).termsAnalysis||{}).findings || [])
    .filter(f => byId[f.clauseId] && f.priority !== 'do-not-raise' &&
                 (f.state === 'absent' || f.state === 'present-weaker' || f.state === 'unclear'))
    .slice()
    .sort((a, b) => ((rank[a.priority] != null ? rank[a.priority] : 3) -
                     (rank[b.priority] != null ? rank[b.priority] : 3)) ||
                    ((Number(b.gap)||0) - (Number(a.gap)||0)))
    .map(f => ({clauseId: f.clauseId, priority: f.priority, gap: f.gap,
                summary: f.summary, note: f.note, state: f.state}));
}
