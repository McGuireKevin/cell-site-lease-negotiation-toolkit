/* =============================================================================
   REDLINE COMPARE — stage 7.

   Takes the version we sent and the version that came back, and reports every
   place they differ, with a reading of what each difference DOES.

   THE PRINCIPLE, and it is the opposite of the drafter's:

     The drafter REFUSES. This one never refuses — it only refuses to let a
     change pass UNSEEN.

   A redline is not a defect list. The landlord is entitled to ask for things,
   and most of what comes back is fine. What must not happen is a change
   arriving in round 2, nobody noticing, and it being three exchanges old by
   the time anyone reads it closely — at which point taking it back costs
   goodwill that the point was never worth.

   So every difference becomes an entry that a human has to disposition. The
   tool ranks and explains; it does not decide.

   WHAT THIS IS NOT: it is not a legal review. A clean run means no pattern it
   knows about fired. It cannot read a sentence and tell you the obligation now
   runs the wrong way. Treat a quiet result as "nothing mechanical found",
   never as "this is safe to sign".

   No dependencies. Loaded as a classic script; safe to load standalone.
   ============================================================================= */

/* ---- tokenising ------------------------------------------------------------
   Numbers stay whole. "$2,250.00" must be ONE token or a diff reports that
   "250" became "100" inside a number that changed by $150, which is true and
   useless. Same for "3.5%" and for hyphenated words.                         */
function rlTokenize(s){
  return String(s == null ? '' : s)
    .match(/\$\s?[\d,]+(?:\.\d+)?|[\d,]*\d(?:\.\d+)?\s?%|\d[\d,]*(?:\.\d+)?|[A-Za-z][A-Za-z'’\-]*|[^\sA-Za-z0-9]/g) || [];
}

/* Case and trailing punctuation do not change meaning; a diff that reports
   "Premises" -> "Premises," is noise that buries the one that matters. */
function rlNorm(t){ return String(t).toLowerCase().replace(/[’']/g, "'"); }

/* ---- diff ------------------------------------------------------------------
   LCS over tokens. Common prefix and suffix are trimmed first, which is what
   keeps the table small on the usual case: a long clause with one changed
   number.                                                                    */
function rlCoalesce(ops){
  const out = [];
  ops.forEach(o => {
    if(!o.tokens.length) return;
    const last = out[out.length-1];
    if(last && last.op === o.op) last.tokens = last.tokens.concat(o.tokens);
    else out.push({op:o.op, tokens:o.tokens.slice()});
  });
  return out;
}

function rlDiff(a, b){
  a = a.slice(); b = b.slice();
  const A = a.map(rlNorm), B = b.map(rlNorm);
  let s = 0;
  while(s < a.length && s < b.length && A[s] === B[s]) s++;
  let e = 0;
  while(e < a.length - s && e < b.length - s && A[a.length-1-e] === B[b.length-1-e]) e++;

  const head = a.slice(0, s), tail = a.slice(a.length - e);
  const ax = a.slice(s, a.length - e), bx = b.slice(s, b.length - e);
  const ops = [];
  if(head.length) ops.push({op:'eq', tokens:head});

  /* A quadratic table on two long unrelated blocks is the one way this gets
     slow. Past the cap, report the block as replaced wholesale — which is what
     it is, and the finding is the same either way. */
  if(ax.length * bx.length > 1500000){
    if(ax.length) ops.push({op:'del', tokens:ax});
    if(bx.length) ops.push({op:'ins', tokens:bx});
  } else if(ax.length && bx.length){
    const n = ax.length, m = bx.length, W = m + 1;
    const AX = ax.map(rlNorm), BX = bx.map(rlNorm);
    const L = new Uint32Array((n+1) * W);
    for(let i = n-1; i >= 0; i--)
      for(let j = m-1; j >= 0; j--)
        L[i*W+j] = AX[i] === BX[j] ? L[(i+1)*W+j+1] + 1
                                   : Math.max(L[(i+1)*W+j], L[i*W+j+1]);
    let i = 0, j = 0;
    while(i < n && j < m){
      if(AX[i] === BX[j]){ ops.push({op:'eq', tokens:[ax[i]]}); i++; j++; }
      else if(L[(i+1)*W+j] >= L[i*W+j+1]){ ops.push({op:'del', tokens:[ax[i]]}); i++; }
      else { ops.push({op:'ins', tokens:[bx[j]]}); j++; }
    }
    if(i < n) ops.push({op:'del', tokens:ax.slice(i)});
    if(j < m) ops.push({op:'ins', tokens:bx.slice(j)});
  } else {
    if(ax.length) ops.push({op:'del', tokens:ax});
    if(bx.length) ops.push({op:'ins', tokens:bx});
  }

  if(tail.length) ops.push({op:'eq', tokens:tail});
  return rlCoalesce(ops);
}

/* Re-joining tokens for display. Not the original spacing — punctuation is
   pulled back onto the preceding word so a quote reads as a sentence. */
function rlJoin(tokens){
  let s = '';
  tokens.forEach((t, i) => {
    if(i && !/^[,.;:)\]%]$/.test(t) && !/^[(\[]$/.test(tokens[i-1])) s += ' ';
    s += t;
  });
  return s;
}

/* ---- paragraph alignment ---------------------------------------------------
   Diffing two whole documents as one token stream produces a mess when a
   paragraph moves. Aligning paragraphs first, in order, keeps each finding
   attached to the clause it belongs to.                                      */
function rlParagraphs(text){
  return String(text == null ? '' : text)
    .split(/\n\s*\n+/).map(p => p.replace(/\s+/g,' ').trim()).filter(Boolean);
}

/* Token-bag overlap. Enough to tell "the same clause, edited" from "a
   different clause", which is all the alignment needs. */
function rlSimilarity(a, b){
  const A = rlTokenize(a).map(rlNorm), B = rlTokenize(b).map(rlNorm);
  if(!A.length && !B.length) return 1;
  if(!A.length || !B.length) return 0;
  const bag = new Map();
  A.forEach(t => bag.set(t, (bag.get(t)||0) + 1));
  let hit = 0;
  B.forEach(t => { const n = bag.get(t)||0; if(n){ bag.set(t, n-1); hit++; } });
  return (2 * hit) / (A.length + B.length);
}

/* Order-preserving alignment. A paragraph is only a candidate match above the
   threshold; below it, treating them as a pair would diff two unrelated
   clauses and report every word. */
function rlAlign(ourParas, theirParas, threshold){
  const th = threshold == null ? 0.4 : threshold;
  const n = ourParas.length, m = theirParas.length, W = m + 1;
  const sim = new Float64Array(n * m);
  for(let i = 0; i < n; i++)
    for(let j = 0; j < m; j++){
      const v = rlSimilarity(ourParas[i], theirParas[j]);
      sim[i*m+j] = v >= th ? v : 0;
    }
  const S = new Float64Array((n+1) * W);
  for(let i = n-1; i >= 0; i--)
    for(let j = m-1; j >= 0; j--){
      const pair = sim[i*m+j] ? sim[i*m+j] + S[(i+1)*W+j+1] : -Infinity;
      S[i*W+j] = Math.max(pair, S[(i+1)*W+j], S[i*W+j+1]);
    }
  const out = [];
  let i = 0, j = 0;
  while(i < n && j < m){
    const pair = sim[i*m+j] ? sim[i*m+j] + S[(i+1)*W+j+1] : -Infinity;
    if(pair >= S[(i+1)*W+j] && pair >= S[i*W+j+1]){
      out.push({kind:'matched', ourIndex:i, theirIndex:j, ours:ourParas[i], theirs:theirParas[j],
                similarity:sim[i*m+j]});
      i++; j++;
    } else if(S[(i+1)*W+j] >= S[i*W+j+1]){
      out.push({kind:'removed', ourIndex:i, theirIndex:-1, ours:ourParas[i], theirs:''}); i++;
    } else {
      out.push({kind:'added', ourIndex:-1, theirIndex:j, ours:'', theirs:theirParas[j]}); j++;
    }
  }
  while(i < n){ out.push({kind:'removed', ourIndex:i, theirIndex:-1, ours:ourParas[i], theirs:''}); i++; }
  while(j < m){ out.push({kind:'added', ourIndex:-1, theirIndex:j, ours:'', theirs:theirParas[j]}); j++; }
  return out;
}

/* ---- numbers ---------------------------------------------------------------
   Legal drafting states a figure twice — "one hundred eighty (180) days" —
   because THE WORDS CONTROL if the two disagree. So an edit that changes the
   digits and leaves the words does not create an ambiguity; it creates a term
   that says the opposite of what whoever made the edit intended. It is also
   invisible to a reader checking the numbers, because the number they check is
   the one in parentheses.

   This is the single most valuable thing in this file and it needs no diff at
   all — it is a defect in their document, standalone.                        */
const RL_ONES = {zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,
  nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};

function rlWordsToNumber(phrase){
  const words = String(phrase||'').toLowerCase().replace(/-/g,' ').split(/\s+/).filter(Boolean);
  if(!words.length) return null;
  let total = 0, run = 0, saw = false;
  for(const w of words){
    if(w === 'and') continue;
    if(w in RL_ONES){ run += RL_ONES[w]; saw = true; }
    else if(w === 'hundred'){ run = (run||1) * 100; saw = true; }
    else if(w === 'thousand'){ total += (run||1) * 1000; run = 0; saw = true; }
    else if(w === 'million'){ total += (run||1) * 1e6; run = 0; saw = true; }
    else return null;
  }
  return saw ? total + run : null;
}

const RL_WORDNUM = '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|' +
  'fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|' +
  'eighty|ninety|hundred|thousand|million|and)';

/* "one hundred eighty (180)" / "Three Percent (3%)" / "Two Thousand ... ($2,250.00)"

   The \b guards are load-bearing. Without them the alternation matches inside
   ordinary words — "phone (5)" finds "one", decides the words say 1 and the
   figure says 5, and reports a mismatch in a sentence that has no number in it
   at all. A checker that cries wolf on prose is worse than no checker. */
function rlWordFigureMismatches(text){
  const W = '\\b' + RL_WORDNUM + '\\b';
  const re = new RegExp('(' + W + '(?:[\\s\\-]+' + RL_WORDNUM + '\\b)*)\\s*\\(\\s*\\$?\\s*([\\d,]+(?:\\.\\d+)?)\\s*%?\\s*\\)', 'gi');
  const out = [];
  let m;
  while((m = re.exec(String(text||''))) !== null){
    const words = rlWordsToNumber(m[1]);
    const figure = Number(String(m[2]).replace(/,/g,''));
    if(words == null || !isFinite(figure)) continue;
    if(Math.abs(words - figure) > 0.005) out.push({phrase:m[0].trim(), words:words, figure:figure});
  }
  return out;
}

function rlMoney(text){
  return (String(text||'').match(/\$\s?[\d,]+(?:\.\d+)?/g) || [])
    .map(s => Number(s.replace(/[$,\s]/g,'')));
}
function rlPercents(text){
  return (String(text||'').match(/[\d,]*\d(?:\.\d+)?\s?%/g) || [])
    .map(s => Number(s.replace(/[%,\s]/g,'')));
}
function rlDurations(text){
  const out = [];
  const re = /(\d[\d,]*)\s+(day|month|year|business day|calendar day)s?\b/gi;
  let m;
  while((m = re.exec(String(text||''))) !== null)
    out.push({n:Number(m[1].replace(/,/g,'')), unit:m[2].toLowerCase()});
  return out;
}

/* ---- signals ---------------------------------------------------------------
   Each is a pattern over what was INSERTED or DELETED, with the reason it
   matters written out. The reason is the product: a flag saying
   "consent-added" is a grep, and a sentence saying what a consent requirement
   costs is a review.

   `on` is which side of a change the pattern reads. `risk` is a starting
   point — rlRisk() raises it where the clause category makes it worse.      */
const RL_SIGNALS = [
  { id:'consent-added', on:'ins', risk:'high',
    re:/\b(prior\s+)?(written\s+)?consent\b|\bconsent\s+of\s+(the\s+)?landlord\b|\blandlord'?s?\s+(prior\s+)?(written\s+)?approval\b/i,
    label:'A consent or approval requirement was added',
    why:'A right that needs permission is not the same right. Ask what happens when the landlord simply does not answer — if the clause has no deemed-approval or time limit, silence is a veto.' },

  { id:'consent-standard-removed', on:'del', risk:'high',
    re:/\bnot\s+(to\s+be\s+)?unreasonably\s+(withheld|conditioned|delayed)/i,
    label:'The reasonableness standard on a consent was removed',
    why:'Deleting "not to be unreasonably withheld" converts a consent that can be challenged into one that cannot. It is a small edit that removes the entire remedy, and it reads as tidying.' },

  { id:'right-removed', on:'del', risk:'high',
    re:/\bshall\s+have\s+the\s+right\b|\bsole\s+discretion\b|\bwithout\s+(the\s+)?(prior\s+)?(written\s+)?consent\b|\bat\s+any\s+time\b|\bfor\s+any\s+reason\b|\bwithout\s+cause\b|\bfor\s+convenience\b/i,
    label:'Language granting a right or discretion was removed',
    why:'Check whether the right survives elsewhere in the document. If it does not, this is the change that matters most in the round.' },

  { id:'discretion-shifted', on:'ins', risk:'high',
    re:/\blandlord'?s?\s+sole\s+(and\s+absolute\s+)?discretion\b|\bin\s+landlord'?s?\s+discretion\b|\bas\s+determined\s+by\s+landlord\b/i,
    label:'A decision was moved to the landlord’s discretion',
    why:'Sole discretion is effectively unreviewable. Where it governs something operational, the site can be constrained without any breach having occurred.' },

  { id:'cap-removed', on:'del', risk:'high',
    re:/\bnot\s+to\s+exceed\b|\bin\s+no\s+event\s+(shall|will)\b|\bmaximum\s+of\b|\bcapped\s+at\b|\bno\s+more\s+than\b/i,
    label:'A cap or ceiling was removed',
    why:'An uncapped obligation is unbudgetable. This is the change most likely to be described as a simplification.' },

  { id:'floor-added', on:'ins', risk:'medium',
    re:/\bat\s+least\b|\bno\s+less\s+than\b|\bminimum\s+(of|annual)\b|\bgreater\s+of\b/i,
    label:'A floor or minimum was added',
    why:'A "greater of" on an escalator turns a CPI cap into a ratchet. If this sits near rent, re-price it before agreeing.' },

  { id:'indemnity-added', on:'ins', risk:'high',
    re:/\bindemnif(y|ies|ication)\b|\bdefend\s+and\s+hold\s+harmless\b|\bhold\s+harmless\b/i,
    label:'An indemnity was added or widened',
    why:'Indemnities survive termination and are usually outside the insurance the site carries. Route this to legal rather than dispositioning it here.' },

  { id:'liability-shifted', on:'ins', risk:'high',
    re:/\bsolely\s+responsible\b|\bat\s+(tenant|licensee)'?s?\s+sole\s+(cost|expense|risk)\b|\bwaives?\s+any\s+claim\b|\bno\s+liability\b/i,
    label:'Cost or risk was shifted to the tenant',
    why:'Read this together with any casualty, condemnation and interference language. Sole-cost wording is where a maintenance obligation quietly becomes a capital one.' },

  { id:'termination-added', on:'ins', risk:'high',
    re:/\blandlord\s+may\s+terminate\b|\bright\s+to\s+terminate\b|\bterminate\s+this\s+(lease|agreement|amendment)\b/i,
    label:'A termination right was added',
    why:'A landlord termination right on a cell site is close to a total loss: the equipment is fixed, the search ring is not, and relocation runs to six figures.' },

  { id:'automatic-renewal-removed', on:'del', risk:'high',
    re:/\bautomatic(ally)?\b|\bshall\s+(automatically\s+)?(renew|extend)\b|\bunless\s+(tenant|either\s+party)\s+(gives|provides)\b/i,
    label:'Automatic renewal language was removed',
    why:'An option that must be affirmatively exercised is an option that gets missed. This converts a calendar entry into a deadline with a total loss behind it.' },

  { id:'assignment-restricted', on:'ins', risk:'high',
    re:/\bmay\s+not\s+(assign|sublet|sublease|transfer)\b|\bprohibited\s+from\s+(assigning|subletting)\b|\bno\s+(assignment|sublease)\b/i,
    label:'Assignment or sublease was restricted',
    why:'This governs colocation revenue and any corporate reorganisation. A restriction with no affiliate carve-out breaks on a transaction nobody is thinking about today.' },

  { id:'time-of-essence-added', on:'ins', risk:'medium',
    re:/\btime\s+is\s+of\s+the\s+essence\b/i,
    label:'"Time is of the essence" was added',
    why:'It makes every date a hard date. Combined with a short cure period it turns an administrative slip into a default.' },

  { id:'cure-shortened', on:'either', risk:'high',
    re:/\bcure\b|\bdefault\b|\bfail(s|ure)?\s+to\s+(pay|perform)\b/i, needsNumber:true,
    label:'A cure or default period changed',
    why:'A cure period is the margin for an ordinary administrative error. Shortening it is cheap to agree to and expensive exactly once.' },

  { id:'notice-changed', on:'either', risk:'medium',
    re:/\bnotice\b|\bnotify\b|\bwritten\s+notice\b/i, needsNumber:true,
    label:'A notice period changed',
    why:'Direction depends on who owes the notice. Longer is worse where we must give it, better where they must. Confirm which this is before accepting.' },

  { id:'governing-law-changed', on:'either', risk:'medium',
    re:/\bgovern(ed|ing)\s+by\b|\bjurisdiction\b|\bvenue\b|\blaws\s+of\s+the\s+state\b/i,
    label:'Governing law or venue changed',
    why:'Venue decides what a dispute costs to run. It is also the clause most often changed without comment.' },

  { id:'estoppel-snda-weakened', on:'del', risk:'high',
    re:/\bnon-?disturbance\b|\bsubordination\b|\bsnda\b|\battornment\b/i,
    label:'Subordination or non-disturbance language was removed',
    why:'Without non-disturbance, a foreclosure can extinguish the lease and the site with it. This is not a boilerplate change even though it sits in the boilerplate.' },

  { id:'interference-weakened', on:'del', risk:'high',
    re:/\binterfere(nce)?\b|\bradio\s+frequency\b|\bharmful\s+interference\b/i,
    label:'Interference protection was removed or narrowed',
    why:'Interference protection is the only clause that governs what the landlord may let a later tenant do to this site. It cannot be recovered after another carrier is on the roof.' },

  /* No bare "twenty-four". It is the standard cure period on interference and
     utility notice too, so a redline shortening an INTERFERENCE cure reported
     itself as an access change — a true finding under a label that sends the
     reviewer to the wrong clause, which is its own kind of wrong. `access` and
     `24/7` still catch a real access edit. */
  { id:'access-narrowed', on:'either', risk:'high',
    re:/\b24\s?\/\s?7\b|\baccess\b|\bingress\b|\begress\b|\bescort\b|\bbusiness\s+hours\b/i,
    label:'Access terms changed',
    why:'Access governs outage response. An escort requirement or business-hours limit is a restoration-time change with an SLA behind it.' }
];

/* Where a change lands changes what it costs. The same consent requirement is
   an irritation in a notices clause and a real problem in termination. */
const RL_HOT_CATEGORIES = ['termination','rent','term','assignment','sublease','interference','access'];

function rlBump(risk){ return risk === 'high' ? 'high' : risk === 'medium' ? 'high' : 'medium'; }

/* ---- detection -------------------------------------------------------------
   Runs over one aligned paragraph pair.                                      */
function rlDetect(pair, ctx){
  const found = [];
  const ctxo = ctx || {};
  const add = f => found.push(f);

  /* Three views of the same edits, and each is needed for a different reason.

     insRuns/delRuns — the bare edits, used for the QUOTE. Joining every
     insertion in a paragraph produced evidence like “$11,400.00 Nine $950.00
     the greater of 3% or CPI”, four unrelated edits in a row reading as
     gibberish, and a reviewer shown that cannot tell a true finding from a
     false one.

     insText/delText — each edit padded with a few unchanged words either side,
     for DETECTION. A phrase routinely straddles the boundary: changing
     "twenty-four hours per day" to "normal business hours" leaves "hours"
     unchanged, so the inserted text is "during normal business" and a pattern
     looking for "business hours" finds nothing. The padding is local to the
     edit, so it does not reintroduce matches against untouched sentences.

     The runs are joined with a separator rather than a space, so a phrase
     cannot be formed accidentally across two unrelated edits. */
  const insRuns = pair.ops.filter(o=>o.op==='ins').map(o=>rlJoin(o.tokens));
  const delRuns = pair.ops.filter(o=>o.op==='del').map(o=>rlJoin(o.tokens));
  const insText = rlRunsWithContext(pair.ops, 'ins', 6).join(' … ');
  const delText = rlRunsWithContext(pair.ops, 'del', 6).join(' … ');
  const whole   = pair.theirs || '';
  const hot     = RL_HOT_CATEGORIES.indexOf(ctxo.category) >= 0;

  /* --- numeric movement, checked as a pair -------------------------------
     Money and percentages that move are the changes that make the priced
     scenario stale. Reported even when no worded signal fires, because a
     number can change inside otherwise identical text.                     */
  const numKinds = [
    {kind:'money',   ours:rlMoney(pair.ours),    theirs:rlMoney(pair.theirs),    fmt:v=>'$'+v.toFixed(2)},
    {kind:'percent', ours:rlPercents(pair.ours), theirs:rlPercents(pair.theirs), fmt:v=>v+'%'}
  ];
  numKinds.forEach(k => {
    const a = k.ours.join('|'), b = k.theirs.join('|');
    if(a === b) return;
    add({ signal:k.kind+'-changed', risk:'high', affectsPricing:true,
      label:(k.kind === 'money' ? 'A dollar figure changed' : 'A percentage changed'),
      detail:'Ours: ' + (k.ours.map(k.fmt).join(', ') || '(none)') +
             '  →  Theirs: ' + (k.theirs.map(k.fmt).join(', ') || '(none)'),
      why:'The comparator priced the figure on the left. Until the scenario is re-run, the financial case on file describes a deal that is no longer on the table.' });
  });

  const dOurs = rlDurations(pair.ours), dTheirs = rlDurations(pair.theirs);
  const durMoved = dOurs.map(d=>d.n+' '+d.unit).join('|') !== dTheirs.map(d=>d.n+' '+d.unit).join('|');

  /* --- worded signals ---------------------------------------------------- */
  const period = ds => ds.map(d => d.n + ' ' + d.unit + (d.n === 1 ? '' : 's')).join(', ') || '(none)';

  RL_SIGNALS.forEach(sig => {
    let detail = null;

    if(sig.needsNumber){
      /* Context signals — cure, notice. The pattern reads the SURROUNDING
         text, not the edit, so it only means anything if a period actually
         moved. Without that guard every notices clause with a comma changed
         reports a shortened cure period, and the reviewer stops reading. */
      if(!durMoved) return;
      if(!sig.re.test(whole) && !sig.re.test(pair.ours)) return;
      detail = period(dOurs) + '  →  ' + period(dTheirs);
    } else {
      let side = null, hit = null;
      if((sig.on === 'ins' || sig.on === 'either') && sig.re.test(insText)){
        hit = rlEvidence(insRuns, insText, sig.re); side = 'Added';
      } else if((sig.on === 'del' || sig.on === 'either') && sig.re.test(delText)){
        hit = rlEvidence(delRuns, delText, sig.re); side = 'Removed';
      }
      if(!hit) return;
      detail = side + ': “' + rlTrim(hit, 220) + '”';
    }

    add({ signal:sig.id, risk:(hot ? rlBump(sig.risk) : sig.risk),
      label:sig.label, detail:detail,
      why:sig.why + (hot ? ' It also sits in the ' + ctxo.category + ' terms, which is why it is scored up.' : '') });
  });

  /* --- defined-term drift ------------------------------------------------
     The audit exists to establish what this lease calls things. A redline
     that swaps Premises for Property reads as a synonym and is not one: the
     two describe different areas, and the substitution is silent because
     both words are ordinary English.                                       */
  const terms = ctxo.definedTerms || {};
  const values = Object.keys(terms).map(k => terms[k] && terms[k].value).filter(Boolean);
  values.forEach(v => {
    const re = new RegExp('\\b' + v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b', 'g');
    const inOurs   = (pair.ours   || '').match(re);
    const inTheirs = (pair.theirs || '').match(re);
    const nOurs = inOurs ? inOurs.length : 0, nTheirs = inTheirs ? inTheirs.length : 0;
    if(nOurs > nTheirs){
      add({ signal:'defined-term-dropped', risk:'high',
        label:'The defined term “' + v + '” was removed or replaced',
        detail:'Used ' + nOurs + '× in ours, ' + nTheirs + '× in theirs.',
        why:'Whatever replaced it is either an undefined word or a different defined term. Both read naturally and neither means what the lease established.' });
    }
  });

  /* --- words vs figures --------------------------------------------------- */
  rlWordFigureMismatches(pair.theirs).forEach(mm => {
    add({ signal:'words-figures-mismatch', risk:'high',
      label:'Spelled-out number disagrees with the figure beside it',
      detail:'“' + mm.phrase + '” — the words say ' + mm.words + ', the figure says ' + mm.figure + '.',
      why:'Where the two disagree the WORDS control. A reader checking the numbers reads the parenthetical, so this survives review and then means the opposite of what was agreed.' });
  });

  return found;
}

function rlTrim(s, n){
  s = String(s||'').trim();
  return s.length > n ? s.slice(0, n-1) + '…' : s;
}

/* The text to show as evidence for a match.

   Prefer the single edit that matched — that is the change the reviewer needs
   to look at. Fall back to a window around the match position in the joined
   text, for a phrase that straddles two edits. Never return the whole joined
   string: a paragraph with four separate edits produces a quote that reads as
   nonsense and makes a true finding look like a false one. */
/* Each edit of the given kind, padded with up to `pad` unchanged words on
   either side. Local context only — enough for a phrase that straddles the
   edit boundary, not enough to match a sentence nobody touched. */
function rlRunsWithContext(ops, op, pad){
  const out = [];
  for(let i = 0; i < ops.length; i++){
    if(ops[i].op !== op) continue;
    const before = (i > 0 && ops[i-1].op === 'eq') ? ops[i-1].tokens.slice(-pad) : [];
    const after  = (i+1 < ops.length && ops[i+1].op === 'eq') ? ops[i+1].tokens.slice(0, pad) : [];
    out.push(rlJoin(before.concat(ops[i].tokens, after)));
  }
  return out;
}

function rlEvidence(runs, joined, re){
  for(const r of runs) if(re.test(r)) return r;
  const m = re.exec(joined);
  if(m){
    const i = Math.max(0, m.index - 45);
    return (i ? '…' : '') + joined.slice(i, m.index + m[0].length + 45) +
           (m.index + m[0].length + 45 < joined.length ? '…' : '');
  }
  return joined;
}

/* ---- the run ---------------------------------------------------------------
   `ours` and `theirs` are plain text. `ours` is what we sent — the drafter's
   output for round 1, and the previous round's returned document after that,
   because a round-3 review compares against round 2, not against the original
   draft. Comparing every round to the first draft re-reports everything
   already dispositioned, which is how a reviewer learns to skim the list.   */
function analyzeRedline(ours, theirs, deal, opts){
  const o = opts || {};
  const round = o.round == null ? 1 : Number(o.round);
  const ourParas = rlParagraphs(ours), theirParas = rlParagraphs(theirs);
  const pairs = rlAlign(ourParas, theirParas, o.threshold);
  const findings = [];
  const dt = (deal && deal.definedTerms) || {};

  pairs.forEach(p => {
    p.category = o.categoryFor ? o.categoryFor(p) : rlGuessCategory(p.ours || p.theirs);
    if(p.kind === 'matched'){
      p.ops = rlDiff(rlTokenize(p.ours), rlTokenize(p.theirs));
      p.changed = p.ops.some(x => x.op !== 'eq');
      if(p.changed) rlDetect(p, {definedTerms:dt, category:p.category})
        .forEach(f => findings.push(Object.assign(f, {paragraph:p})));
    } else if(p.kind === 'removed'){
      p.ops = [{op:'del', tokens:rlTokenize(p.ours)}];
      p.changed = true;
      findings.push({ signal:'text-removed', risk:'high', paragraph:p,
        label:'A paragraph we sent is not in their version',
        detail:rlTrim(p.ours, 260),
        why:'A whole clause dropping out is the deviation least likely to be noticed on a read-through, because nothing on the page looks wrong. Confirm it was meant to go.' });
    } else {
      p.ops = [{op:'ins', tokens:rlTokenize(p.theirs)}];
      p.changed = true;
      /* New text is not inherently bad — but it did not come from the clause
         library, so nothing has vetted it. */
      const sub = rlDetect({ours:'', theirs:p.theirs, ops:p.ops},
                           {definedTerms:dt, category:p.category});
      findings.push({ signal:'text-added', risk:sub.some(f=>f.risk==='high') ? 'high' : 'medium',
        paragraph:p,
        label:'A paragraph was added that we did not send',
        detail:rlTrim(p.theirs, 260),
        why:'New language has not been through the clause library or any prior review. Read it in full rather than dispositioning it from the summary.' });
      sub.forEach(f => findings.push(Object.assign(f, {paragraph:p})));
    }
  });

  /* A stable key so re-running the same round updates rather than duplicates,
     and so a disposition made on round 2 survives a re-analysis. Built from
     what the finding IS, not from where it sits — a paragraph that moves is
     the same deviation. */
  findings.forEach(f => { f.key = rlKey(round, f); });

  /* Same signal firing twice in one paragraph is one finding. */
  const seen = new Set(), unique = [];
  findings.forEach(f => { if(!seen.has(f.key)){ seen.add(f.key); unique.push(f); } });

  const rank = {high:0, medium:1, low:2, none:3};
  unique.sort((a,b) => (rank[a.risk] - rank[b.risk]) ||
                       ((a.paragraph.ourIndex < 0 ? 1e6 : a.paragraph.ourIndex) -
                        (b.paragraph.ourIndex < 0 ? 1e6 : b.paragraph.ourIndex)));

  return {
    round: round,
    pairs: pairs,
    findings: unique,
    summary: {
      high:    unique.filter(f => f.risk === 'high').length,
      medium:  unique.filter(f => f.risk === 'medium').length,
      low:     unique.filter(f => f.risk === 'low').length,
      affectsPricing: unique.some(f => f.affectsPricing),
      paragraphsChanged: pairs.filter(p => p.changed).length,
      paragraphsTotal: pairs.length
    }
  };
}

function rlKey(round, f){
  const anchor = rlTokenize(f.paragraph ? (f.paragraph.ours || f.paragraph.theirs) : '')
                   .slice(0, 8).map(rlNorm).join('-');
  return 'r' + round + ':' + f.signal + ':' + anchor;
}

/* Crude, and deliberately so — it only decides whether a finding is scored up,
   never whether it is reported. A wrong guess costs a risk level, not a miss. */
const RL_CATEGORY_HINTS = [
  ['termination', /\bterminat/i], ['rent', /\brent\b|\bescalat|\bpayment\b/i],
  ['term', /\bterm\b|\bextension\b|\brenew/i], ['assignment', /\bassign/i],
  ['sublease', /\bsublease\b|\bsublet\b|\bcolocat/i], ['interference', /\binterfere/i],
  ['access', /\baccess\b|\bingress\b|\begress\b/i], ['insurance', /\binsur/i],
  ['indemnity', /\bindemnif/i], ['notices', /\bnotice\b/i], ['default', /\bdefault\b|\bcure\b/i]
];
function rlGuessCategory(text){
  for(const [name, re] of RL_CATEGORY_HINTS) if(re.test(text||'')) return name;
  return 'other';
}

/* ---- deal file -------------------------------------------------------------
   Findings become deviations[] entries. The merge is where the "reviewed as it
   arrives" rule is actually enforced: an entry already dispositioned keeps its
   disposition, and re-running an analysis never silently un-accepts something
   or duplicates a row someone has already worked through.                    */
function toDeviations(analysis, opts){
  const o = opts || {};
  return analysis.findings.map(f => {
    const d = {
      key: f.key,
      round: analysis.round,
      date: o.date || '',
      summary: f.label + ' — ' + rlTrim(f.detail, 200),
      origin: o.origin || 'landlord-redline',
      risk: f.risk,
      raisedBy: o.raisedBy || 'redline-compare',
      /* Machine rationale and human note are SEPARATE fields. They were one
         field first, and the merge then had no way to tell a reviewer's note
         from generated text, so it could not know which to keep. */
      rationale: f.why
    };
    if(f.affectsPricing) d.affectsPricing = true;
    if(o.clauseIdFor){ const c = o.clauseIdFor(f); if(c) d.clauseId = c; }
    return d;
  });
}

/* Fields only a person ever sets. Everything else belongs to the analysis and
   is refreshed wholesale on every run. */
const RL_HUMAN_FIELDS = ['accepted', 'acceptedBy', 'note'];

function mergeDeviations(existing, incoming){
  const out = (existing || []).map(d => Object.assign({}, d));
  const at = new Map();
  out.forEach((d, i) => { if(d.key) at.set(d.key, i); });
  let added = 0, updated = 0;
  (incoming || []).forEach(d => {
    if(d.key && at.has(d.key)){
      const i = at.get(d.key), prev = out[i];
      /* Machine fields are taken from the new analysis — starting from `d`
         rather than from `prev` so a finding that stopped applying does not
         leave a stale flag behind.

         Human fields resolve the other way, and the ORDER matters. An explicit
         incoming value wins, because that is the reviewer changing their mind
         and the UI is the thing that sends it. Only when the incoming record
         says nothing does the stored decision stand — which is the re-analysis
         case, since an analysis never sets a disposition.

         Getting this backwards is subtle and bad: a first version protected the
         stored value against everything, so a decision could be recorded once
         and never revised, and the UI silently discarded the change. */
      const merged = Object.assign({}, d);
      RL_HUMAN_FIELDS.forEach(k => {
        if(d[k] !== undefined) merged[k] = d[k];
        else if(prev[k] !== undefined) merged[k] = prev[k];
        else delete merged[k];
      });
      out[i] = merged;
      updated++;
    } else { out.push(d); if(d.key) at.set(d.key, out.length-1); added++; }
  });
  return {deviations:out, added:added, updated:updated};
}

/* Stage 8's gate. An open deviation is one nobody has decided on — not one
   that was rejected. The final report is allowed to carry known risk; it is
   not allowed to carry unread risk. */
function openDeviations(deal){
  return ((deal && deal.deviations) || []).filter(d => d.accepted !== true && d.accepted !== false);
}
