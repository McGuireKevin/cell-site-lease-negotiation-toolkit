/* =============================================================================
   PROJECT FILE VALIDATION

   A hand-edited project file is a supported workflow: Save Project produces a
   known-good exemplar, and editing values in it is far less error-prone than
   assembling the CSVs and keeping their `owner` foreign keys consistent.

   The failure modes differ, though. A JSON *syntax* error already fails loudly
   — JSON.parse throws with a position. A *semantic* one does not: writing
   "Advance" for "advance", or "fixed%" for "fixed_pct", loads silently, leaves
   the dropdown showing nothing, and lets the engine treat the field as unset.
   That is the worst kind of wrong, because the numbers still compute.

   Three classes of problem are caught:

     ENUM / DATE / TYPE   a value the engine cannot use          -> error
     UNKNOWN KEY          a field name nothing reads             -> error if it
                          looks like a typo of a real one, else warning
     OUT OF RANGE         parses fine, but almost certainly a
                          data-entry slip (650 for 6.5)          -> warning

   Errors block the load and nothing changes. Warnings load and are reported.
   That split matters: a file from a future version carrying extra fields
   should still open, while `prorationConvension` — which would silently fall
   back to a default and quietly change every prorated figure — must not.

   Problems are collected and reported together rather than one per attempt. A
   hand-edited file usually has several, and fixing them one reload at a time
   is miserable.

   Loaded as a classic script, after lease-engine.js — it uses pd() and fd().
   ============================================================================= */

const SCHEMA_VERSION = '1.0';

const ENUMS={
  stage:['audit','market-test','comparison','internal-review','negotiation',
         'drafting','redline','final-report','closed'],
  chargeBasis:['flat','antenna_only','antenna_and_microwave','full_manifest'],
  baselineMode:['continue','expire'],
  rentBasis:['monthly','annual'],
  paymentTiming:['advance','arrears'],
  prorationBasis:['prorated','full_period','prorated_start_only'],
  prorationConvention:['actual_month','actual_365','thirty_360'],
  paymentDayRule:['anchored','last_day','clamped'],
  rentMode:['absolute','pct_of_current','delta_from_current','unchanged'],
  escType:['fixed_pct','fixed_amount','cpi','none'],
  compounding:['on_prior','on_base'],
  direction:['to_landlord','to_tenant'],

  /* --- the audit block ---------------------------------------------------
     These are read by BRANCHING CODE that fails silently when they are wrong.
     clause-assembler tests `status==='absent'||status==='ambiguous'` before
     warning that a clause may be amending something that is not there;
     draft.html's selectRecommended() tests `state==='absent'`. A capitalised
     "Absent" or a plausible-but-wrong "favourable" loads clean, matches
     nothing, and the check it should have triggered simply never fires.

     That is the prorationConvension failure exactly, and until now the audit
     block — the largest hand-authored part of a real deal file — had none of
     it checked. Two invalid values in the first real audit run past silently. */
  termStatus:['found','absent','ambiguous'],
  confidence:['high','medium','low'],
  termSource:['audited','offered','negotiated','books'],
  derivation:['stated','computed'],
  scheduleReason:['commencement','escalation','amendment','option-exercise',
                  'equipment-modification','holdover','other'],
  paymentSource:['client-ledger','bank-record','invoice','landlord-statement','other'],
  findingState:['absent','present-weaker','present-equivalent','present-better','unclear'],
  findingPriority:['must-have','should-have','nice-to-have','do-not-raise'],
  triageFinancials:['above-market','at-market','below-market','unknown'],
  triageTerms:['problematic','acceptable','unknown'],
  recommendation:['pursue','monitor','no-action'],
  sourceKind:['original-lease','amendment','assignment','memorandum','snda','estoppel',
              'correspondence','database-record','other'],
  extraction:['text','ocr','manual','mixed','unavailable'],
  legibility:['clean','degraded','partly-illegible'],
  marketFlag:['above','in_band','below'],
  documentType:['Lease','Sublease','License','Sublicense'],
  deviationOrigin:['landlord-redline','later-proposal','drafting-error','our-concession','unknown'],
  risk:['none','low','medium','high'],
  redlineFrom:['landlord','us'],

  deviationKind:['substance','formatting'],
  pointStatus:['open','conceded','won','dropped','not-raised'],
  pushOutcome:['held','conceded','traded','deferred','unresolved']
};

/* Field names each object legitimately carries. Anything else is either a typo
   or a field from a newer version; KNOWN_KEYS is what tells those apart. */
const KNOWN_KEYS={
  root:   ['schemaVersion','confidential','stage','stageHistory','deviations','redline','playbook','finalReport',
           'glob','current','proposals','site','documentChain','definedTerms','sectionMap','term',
           'options','rent','history','equipment','marketBenchmark','audit','clauseSelection',
           'amendmentTerms'],
  glob:   ['projectName','windowStart','windowEnd','pvReferenceDate','discountRatePct',
           'assumedCpiPct','baselineMode'],
  lease:  ['termEnd','finalTermEnd','baseRent','rentBasis','cadenceMonths','firstPaymentDate',
           'paymentTiming','prorationBasis','prorationConvention','paymentDayRule','escalators',
           'oneTimePayments'],
  prop:   ['id','label','effectiveDate','rentMode','rentValue','rentBasis','termEnd','cadenceMonths',
           'firstPaymentDate','paymentTiming','prorationBasis','prorationConvention','paymentDayRule',
           'escalators','oneTimePayments'],
  esc:    ['appliesFrom','appliesTo','type','ratePct','cadenceMonths','firstAdjustment',
           'compounding','floorPctIn','capPctIn','rate','floorPct','capPct'],
  ot:     ['label','date','amount','direction'],

  site:      ['fan','siteName','siteType','sqft','address','landlord','tenant'],
  address:   ['line1','city','state','zip'],
  landlord:  ['name','address'],
  docChain:  ['id','statedTitle','chronologicalOrdinal','date','documentType','sourceFile'],
  defTerm:   ['value','definedIn','section','redefinedHere','note'],
  termBlock: ['commencementDate','currentTermEnd','extensionTermStart','finalTermEnd',
              'nnrNoticeDays','nnrDueDate'],
  option:    ['count','lengthMonths','noticeDays','exercised','automatic'],
  rentBlock: ['chargeBasis','figures','reconciled'],
  rentFigure:['amount','basis','source','asOf','note'],
  history:   ['rentSchedule','payments','reconciliation'],
  reconcile: ['asOf','method','variances','summary','note'],
  schedRow:  ['from','to','monthlyRent','setBy','setBySection','reason','derivation','note'],
  payment:   ['date','amount','covers','source','note'],
  equipment: ['item','count','note'],
  market:    ['metro','tier','tierMultiplier','indicatedMonthly','contractVsIndicated','flag','asOf'],
  audit:     ['auditedOn','auditedBy','reviewedBy','sources','triage','terms','termsAnalysis'],
  auditSrc:  ['kind','ref','extraction','pages','legibility','note'],
  triage:    ['financials','terms','recommendation','rationale'],
  auditTerm: ['value','status','source','documentRef','sectionRef','confidence','verbatim','notes'],
  analysis:  ['findings','summary'],
  finding:   ['clauseId','state','gap','priority','documentRef','sectionRef','summary','note'],
  deviation: ['key','round','date','kind','clauseId','summary','affectsPricing','origin','risk',
              'raisedBy','rationale','accepted','acceptedBy','note'],
  redline:   ['rounds'],
  redlineRnd:['round','date','from','comparedTo','documentRef','analyzedBy','note'],

  playbook:   ['preparedOn','preparedBy','round','basedOn','baselinePV','targetPV',
               'points','doNotRaise','concessionOrder','pushback'],
  pbBasedOn:  ['comparatorRunOn','windowStart','windowEnd','discountRatePct','proposalIds','marketTestedOn'],
  pbPoint:    ['rank','category','clauseId','ask','entitlement','worth','worthNote',
               'anticipated','ladder','tradeFor','priority','status','note'],
  pbAnticip:  ['landlord','counter','source'],
  pbLadder:   ['opening','target','walkAway'],
  pbDoNot:    ['category','because'],
  pbConcede:  ['give','toGet','note'],
  pbPushback: ['round','date','category','said','response','outcome','movedTo','newObjection']
};

/* Levenshtein, small and iterative. Only ever runs against a handful of short
   key names, so the naive version is the right one. */
function editDistance(a,b){
  a=String(a); b=String(b);
  const m=a.length,n=b.length;
  if(!m) return n; if(!n) return m;
  let prev=new Array(n+1); for(let j=0;j<=n;j++) prev[j]=j;
  for(let i=1;i<=m;i++){
    const cur=[i];
    for(let j=1;j<=n;j++){
      cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1));
    }
    prev=cur;
  }
  return prev[n];
}
/* A near miss is a typo; something unrecognisable is probably a field from a
   version this build does not know about. The threshold scales with name
   length so "esc"/"asc" is not treated the same as a 20-character slip. */
function nearestKey(key,known){
  let best=null,bestD=Infinity;
  known.forEach(k=>{ const d=editDistance(key.toLowerCase(),k.toLowerCase());
    if(d<bestD){ bestD=d; best=k; } });
  const limit=Math.max(2,Math.floor(key.length/4));
  return bestD<=limit ? {key:best,dist:bestD} : null;
}

function validateProject(o){
  const errors=[], warnings=[];
  const isBlank=v=>v===''||v===null||v===undefined;

  const enu=(where,field,val,key)=>{ if(isBlank(val)) return;
    if(!ENUMS[key].includes(val))
      errors.push(`${where}: ${field} is "${val}" — expected one of ${ENUMS[key].join(', ')}`); };

  /* Date.UTC silently rolls overflow over — month 13 becomes January of the next
     year, day 45 becomes mid-next-month — so pd() alone accepts "2027-13-45"
     and returns a real but wrong Date. Reformatting and comparing is what
     actually catches an impossible date. */
  const date=(where,field,val)=>{ if(isBlank(val)) return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(val))){
      errors.push(`${where}: ${field} is "${val}" — expected a date as yyyy-mm-dd`); return; }
    const d=pd(val);
    if(!d||fd(d)!==String(val)) errors.push(`${where}: ${field} "${val}" is not a real calendar date`); };

  const num=(where,field,val)=>{ if(isBlank(val)) return;
    if(isNaN(Number(val))) errors.push(`${where}: ${field} is "${val}" — expected a number`); };

  const arr=(where,field,val)=>{ if(val!==undefined&&!Array.isArray(val))
    errors.push(`${where}: ${field} must be a list`); };

  /* Range checks are WARNINGS, never errors: every value here parses, and an
     unusual lease is still a lease. They catch the decimal-point class of slip
     — 650 typed for 6.5 — which otherwise produces a confident wrong answer. */
  const range=(where,field,val,lo,hi,hint)=>{ if(isBlank(val)||isNaN(Number(val))) return;
    const n=Number(val);
    if(n<lo||n>hi) warnings.push(`${where}: ${field} is ${n}, outside the usual ${lo} to ${hi}. ${hint||''}`.trim()); };

  const keys=(where,obj,known)=>{
    if(typeof obj!=='object'||!obj) return;
    Object.keys(obj).forEach(k=>{
      if(known.includes(k)) return;
      const near=nearestKey(k,known);
      if(near) errors.push(`${where}: unknown field "${k}" — did you mean "${near.key}"? `+
                           `A misspelled field is ignored, so the value you set would be silently replaced by a default.`);
      else warnings.push(`${where}: unknown field "${k}" is ignored. `+
                         `Harmless if this file came from a newer version; a problem if you expected it to do something.`);
    });
  };

  /* ---- schema version ---- */
  if(isBlank(o.schemaVersion)){
    warnings.push(`No schemaVersion — treating this as a pre-1.0 file. It will load, and it will be saved as ${SCHEMA_VERSION}. `+
      `Check the "missing payment day" setting on each lease and proposal before trusting the totals.`);
  } else if(!/^\d+\.\d+$/.test(String(o.schemaVersion))){
    errors.push(`schemaVersion is "${o.schemaVersion}" — expected a version like "${SCHEMA_VERSION}"`);
  } else {
    const major=parseInt(String(o.schemaVersion).split('.')[0],10);
    const mine=parseInt(SCHEMA_VERSION.split('.')[0],10);
    if(major>mine) errors.push(`This file is schema version ${o.schemaVersion}, but this build understands ${SCHEMA_VERSION}. `+
      `Opening it could misread fields rather than fail cleanly, so it is refused. Use a newer build.`);
  }

  keys('Project file',o,KNOWN_KEYS.root);
  enu('Project file','stage',o.stage,'stage');

  /* ---- analysis settings ---- */
  if(typeof o.glob!=='object'||!o.glob) errors.push('glob (Analysis Settings) is missing');
  else{ const g=o.glob, w='Analysis Settings';
    keys(w,g,KNOWN_KEYS.glob);
    if(g.projectName!==undefined&&typeof g.projectName!=='string') errors.push(`${w}: projectName must be text`);
    ['windowStart','windowEnd','pvReferenceDate'].forEach(k=>date(w,k,g[k]));
    ['discountRatePct','assumedCpiPct'].forEach(k=>num(w,k,g[k]));
    range(w,'discountRatePct',g.discountRatePct,0,25,'A discount rate is a percent — 6.5, not 0.065 or 650.');
    range(w,'assumedCpiPct',g.assumedCpiPct,-5,20,'Assumed CPI is a percent per year.');
    enu(w,'baselineMode',g.baselineMode,'baselineMode'); }

  /* ---- a lease or a proposal ---- */
  const term=(t,w,isProp)=>{
    if(typeof t!=='object'||!t){ errors.push(`${w} is missing or not an object`); return; }
    keys(w,t,isProp?KNOWN_KEYS.prop:KNOWN_KEYS.lease);
    date(w,'termEnd',t.termEnd); date(w,'firstPaymentDate',t.firstPaymentDate);
    if(!isProp) date(w,'finalTermEnd',t.finalTermEnd);
    num(w,'cadenceMonths',t.cadenceMonths);
    if(!isBlank(t.cadenceMonths)&&!isNaN(Number(t.cadenceMonths))&&Number(t.cadenceMonths)<1)
      errors.push(`${w}: cadenceMonths is ${t.cadenceMonths} — payment cadence must be at least 1 month. `+
                  `(An escalator may use 0 for a one-time step; a payment cycle may not.)`);
    range(w,'cadenceMonths',t.cadenceMonths,1,12,'Usually 1, 3, 6 or 12.');
    enu(w,'rentBasis',t.rentBasis,'rentBasis');
    enu(w,'paymentTiming',t.paymentTiming,'paymentTiming');
    enu(w,'prorationBasis',t.prorationBasis,'prorationBasis');
    enu(w,'prorationConvention',t.prorationConvention,'prorationConvention');
    enu(w,'paymentDayRule',t.paymentDayRule,'paymentDayRule');
    if(isProp){
      date(w,'effectiveDate',t.effectiveDate); num(w,'rentValue',t.rentValue);
      enu(w,'rentMode',t.rentMode,'rentMode');
      if(t.rentMode==='pct_of_current') range(w,'rentValue',t.rentValue,1,300,'Under percentage pricing this is a percent of the then-current rent — 85 is a 15% cut.');
    } else {
      num(w,'baseRent',t.baseRent);
      if(!isBlank(t.baseRent)&&!isNaN(Number(t.baseRent))&&Number(t.baseRent)<0)
        errors.push(`${w}: baseRent is ${t.baseRent} — rent cannot be negative. An inducement belongs in one-time payments with direction "to_tenant".`);
    }
    arr(w,'escalators',t.escalators); arr(w,'oneTimePayments',t.oneTimePayments);

    (Array.isArray(t.escalators)?t.escalators:[]).forEach((e,j)=>{ const ew=`${w} · escalator ${j+1}`;
      if(typeof e!=='object'||!e){ errors.push(`${ew} is not an object`); return; }
      keys(ew,e,KNOWN_KEYS.esc);
      ['appliesFrom','appliesTo','firstAdjustment'].forEach(k=>date(ew,k,e[k]));
      ['ratePct','cadenceMonths','floorPctIn','capPctIn'].forEach(k=>num(ew,k,e[k]));
      enu(ew,'type',e.type,'escType'); enu(ew,'compounding',e.compounding,'compounding');
      if(!isBlank(e.cadenceMonths)&&!isNaN(Number(e.cadenceMonths))&&Number(e.cadenceMonths)<0)
        errors.push(`${ew}: cadenceMonths is ${e.cadenceMonths} — must be 0 (a one-time step) or a positive number of months.`);
      /* ratePct is a PERCENT for fixed_pct and DOLLARS for fixed_amount, so the
         range check only makes sense for the percentage case. */
      if(e.type==='fixed_pct') range(ew,'ratePct',e.ratePct,-10,25,'This is a percent per adjustment — 3 for 3%.');
      range(ew,'floorPctIn',e.floorPctIn,0,25,'CPI floor, as a percent.');
      range(ew,'capPctIn',e.capPctIn,0,25,'CPI cap, as a percent.');
    });

    (Array.isArray(t.oneTimePayments)?t.oneTimePayments:[]).forEach((p,j)=>{ const ow=`${w} · one-time payment ${j+1}`;
      if(typeof p!=='object'||!p){ errors.push(`${ow} is not an object`); return; }
      keys(ow,p,KNOWN_KEYS.ot);
      date(ow,'date',p.date); num(ow,'amount',p.amount);
      enu(ow,'direction',p.direction,'direction');
      if(!isBlank(p.amount)&&!isNaN(Number(p.amount))&&Number(p.amount)<0)
        warnings.push(`${ow}: amount is ${p.amount}. Amounts are entered positive — which way the money flows is set by Direction, so a negative here reverses it twice.`);
    });
  };

  /* ---- the audit block and everything the audit writes -------------------
     Optional throughout: a file that never went through stage 1 has none of
     it, and a legacy file has none of it either. Absence is silent; a WRONG
     value is not. */
  const obj=(v)=>typeof v==='object'&&v!==null&&!Array.isArray(v);
  const each=(list,w,fn)=>{ if(!Array.isArray(list)) return;
    list.forEach((it,i)=>{ if(!obj(it)){ errors.push(`${w} ${i+1} is not an object`); return; } fn(it,`${w} ${i+1}`); }); };

  if(o.site!==undefined){ if(!obj(o.site)) errors.push('site must be an object');
    else { keys('Site',o.site,KNOWN_KEYS.site); num('Site','sqft',o.site.sqft);
      if(obj(o.site.address))  keys('Site · address',o.site.address,KNOWN_KEYS.address);
      if(obj(o.site.landlord)) keys('Site · landlord',o.site.landlord,KNOWN_KEYS.landlord); } }

  arr('Project file','documentChain',o.documentChain);
  each(o.documentChain,'Document',(d,w)=>{
    keys(w,d,KNOWN_KEYS.docChain); date(w,'date',d.date);
    num(w,'chronologicalOrdinal',d.chronologicalOrdinal);
    enu(w,'documentType',d.documentType,'documentType'); });

  if(obj(o.definedTerms)) Object.keys(o.definedTerms).forEach(k=>{
    const t=o.definedTerms[k]; if(!obj(t)){ errors.push(`Defined term ${k} is not an object`); return; }
    keys(`Defined term ${k}`,t,KNOWN_KEYS.defTerm); });

  if(o.term!==undefined){ if(!obj(o.term)) errors.push('term must be an object');
    else { const w='Term'; keys(w,o.term,KNOWN_KEYS.termBlock);
      ['commencementDate','currentTermEnd','extensionTermStart','finalTermEnd','nnrDueDate']
        .forEach(k=>date(w,k,o.term[k]));
      num(w,'nnrNoticeDays',o.term.nnrNoticeDays);
      /* Both dates are optional, but if both are present one ordering is wrong
         in a way that quietly bounds the baseline short. */
      const ce=pd(o.term.currentTermEnd), fe=pd(o.term.finalTermEnd);
      if(ce&&fe&&fe<ce) errors.push(`${w}: finalTermEnd (${o.term.finalTermEnd}) is before currentTermEnd `+
        `(${o.term.currentTermEnd}). The final term end is the last day with every option exercised, so it cannot come first.`); } }

  arr('Project file','options',o.options);
  each(o.options,'Option',(x,w)=>{ keys(w,x,KNOWN_KEYS.option);
    ['count','lengthMonths','noticeDays'].forEach(k=>num(w,k,x[k])); });

  if(o.rent!==undefined){ if(!obj(o.rent)) errors.push('rent must be an object');
    else { keys('Rent',o.rent,KNOWN_KEYS.rentBlock);
      enu('Rent','chargeBasis',o.rent.chargeBasis,'chargeBasis');
      arr('Rent','figures',o.rent.figures);
      each(o.rent.figures,'Rent figure',(f,w)=>{ keys(w,f,KNOWN_KEYS.rentFigure);
        num(w,'amount',f.amount); date(w,'asOf',f.asOf);
        enu(w,'basis',f.basis,'rentBasis'); enu(w,'source',f.source,'termSource'); });
      if(obj(o.rent.reconciled)){ keys('Rent · reconciled',o.rent.reconciled,['amount','basis','note']);
        num('Rent · reconciled','amount',o.rent.reconciled.amount);
        enu('Rent · reconciled','basis',o.rent.reconciled.basis,'rentBasis'); } } }

  if(obj(o.history)){ keys('History',o.history,KNOWN_KEYS.history);
    arr('History','rentSchedule',o.history.rentSchedule);
    arr('History','payments',o.history.payments);
    each(o.history.rentSchedule,'Rent schedule row',(r,w)=>{
      keys(w,r,KNOWN_KEYS.schedRow); date(w,'from',r.from); date(w,'to',r.to);
      num(w,'monthlyRent',r.monthlyRent);
      enu(w,'reason',r.reason,'scheduleReason');
      /* The schema calls derivation the most important field in the block: a
         computed figure carries every assumption in its derivation, and a
         variance against one is a question rather than a finding. Mislabelled,
         it reads as though it came off the page. */
      enu(w,'derivation',r.derivation,'derivation'); });
    each(o.history.payments,'Payment',(p,w)=>{ keys(w,p,KNOWN_KEYS.payment);
      date(w,'date',p.date); num(w,'amount',p.amount);
      enu(w,'source',p.source,'paymentSource'); });
    if(obj(o.history.reconciliation)){ const rw='History · reconciliation';
      keys(rw,o.history.reconciliation,KNOWN_KEYS.reconcile);
      date(rw,'asOf',o.history.reconciliation.asOf);
      /* Not built yet, so the shape is all there is to check — and checking it
         now is what stops the unbuilt block drifting before anyone builds it. */ } }

  arr('Project file','equipment',o.equipment);
  each(o.equipment,'Equipment',(e,w)=>{ keys(w,e,KNOWN_KEYS.equipment); num(w,'count',e.count); });

  if(obj(o.marketBenchmark)){ const w='Market benchmark';
    keys(w,o.marketBenchmark,KNOWN_KEYS.market);
    ['tierMultiplier','indicatedMonthly','contractVsIndicated'].forEach(k=>num(w,k,o.marketBenchmark[k]));
    date(w,'asOf',o.marketBenchmark.asOf);
    enu(w,'flag',o.marketBenchmark.flag,'marketFlag'); }

  if(obj(o.audit)){ const w='Audit';
    keys(w,o.audit,KNOWN_KEYS.audit);
    date(w,'auditedOn',o.audit.auditedOn);
    arr(w,'sources',o.audit.sources);
    each(o.audit.sources,'Audit source',(s,sw)=>{ keys(sw,s,KNOWN_KEYS.auditSrc);
      num(sw,'pages',s.pages);
      enu(sw,'kind',s.kind,'sourceKind');
      enu(sw,'extraction',s.extraction,'extraction');
      enu(sw,'legibility',s.legibility,'legibility'); });

    if(obj(o.audit.triage)){ const tw='Audit · triage';
      keys(tw,o.audit.triage,KNOWN_KEYS.triage);
      enu(tw,'financials',o.audit.triage.financials,'triageFinancials');
      enu(tw,'terms',o.audit.triage.terms,'triageTerms');
      enu(tw,'recommendation',o.audit.triage.recommendation,'recommendation');
      if(o.audit.triage.recommendation&&isBlank(o.audit.triage.rationale))
        warnings.push(`${tw}: a recommendation with no rationale cannot be reviewed.`); }

    if(obj(o.audit.terms)) Object.keys(o.audit.terms).forEach(id=>{
      const t=o.audit.terms[id], tw=`Audit term "${id}"`;
      if(!obj(t)){ errors.push(`${tw} is not an object`); return; }
      keys(tw,t,KNOWN_KEYS.auditTerm);
      enu(tw,'status',t.status,'termStatus');
      enu(tw,'confidence',t.confidence,'confidence');
      enu(tw,'source',t.source,'termSource');
      if(isBlank(t.status)) errors.push(`${tw}: status is required — found, absent or ambiguous. `+
        `absent and ambiguous are findings in their own right, and a blank reads as neither.`); });

    if(obj(o.audit.termsAnalysis)){ const aw='Audit · terms analysis';
      keys(aw,o.audit.termsAnalysis,KNOWN_KEYS.analysis);
      arr(aw,'findings',o.audit.termsAnalysis.findings);
      each(o.audit.termsAnalysis.findings,'Finding',(f,fw)=>{
        keys(fw,f,KNOWN_KEYS.finding);
        enu(fw,'state',f.state,'findingState');
        enu(fw,'priority',f.priority,'findingPriority');
        num(fw,'gap',f.gap);
        range(fw,'gap',f.gap,-3,3,'The gap is bounded by the clause scores.');
        if(isBlank(f.clauseId)) errors.push(`${fw}: clauseId is required — a finding that names no clause `+
          `cannot be matched to the library, so nothing downstream can act on it.`); }); } }

  arr('Project file','deviations',o.deviations);
  each(o.deviations,'Deviation',(d,w)=>{ keys(w,d,KNOWN_KEYS.deviation);
    date(w,'date',d.date); num(w,'round',d.round);
    enu(w,'kind',d.kind,'deviationKind');
    enu(w,'origin',d.origin,'deviationOrigin'); enu(w,'risk',d.risk,'risk'); });

  if(obj(o.playbook)){ const pw='Playbook';
    keys(pw,o.playbook,KNOWN_KEYS.playbook);
    date(pw,'preparedOn',o.playbook.preparedOn);
    num(pw,'round',o.playbook.round);
    ['baselinePV','targetPV'].forEach(k=>num(pw,k,o.playbook[k]));
    if(obj(o.playbook.basedOn)){ const bw=pw+' · basedOn';
      keys(bw,o.playbook.basedOn,KNOWN_KEYS.pbBasedOn);
      ['comparatorRunOn','windowStart','windowEnd','marketTestedOn'].forEach(k=>date(bw,k,o.playbook.basedOn[k]));
      num(bw,'discountRatePct',o.playbook.basedOn.discountRatePct); }
    arr(pw,'points',o.playbook.points);
    each(o.playbook.points,'Playbook point',(p,w)=>{
      keys(w,p,KNOWN_KEYS.pbPoint);
      num(w,'rank',p.rank); num(w,'worth',p.worth);
      enu(w,'priority',p.priority,'findingPriority');
      enu(w,'status',p.status,'pointStatus');
      if(isBlank(p.ask)) errors.push(`${w}: ask is required — a point with no ask cannot be raised.`);
      /* A figure with no stated source is the thing this whole file exists to
         prevent: every number in a playbook comes from the comparator, and one
         that arrived some other way will disagree with the model it came from. */
      if(!isBlank(p.worth) && isBlank(p.worthNote))
        errors.push(`${w}: worth is ${p.worth} with no worthNote. Say which comparator run it came from — `+
          `a figure a playbook worked out for itself will disagree with the model, and two documents `+
          `in one deal file disagreeing about money is worse than having neither.`);
      arr(w,'anticipated',p.anticipated);
      each(p.anticipated,w+' · anticipated',(a2,aw)=>keys(aw,a2,KNOWN_KEYS.pbAnticip));
      if(obj(p.ladder)) keys(w+' · ladder',p.ladder,KNOWN_KEYS.pbLadder); });
    arr(pw,'doNotRaise',o.playbook.doNotRaise);
    each(o.playbook.doNotRaise,'Playbook do-not-raise',(d,w)=>{ keys(w,d,KNOWN_KEYS.pbDoNot);
      if(isBlank(d.because)) errors.push(`${w}: because is required — a silence recorded with no reason `+
        `reads to a later reader as an oversight rather than a decision.`); });
    arr(pw,'concessionOrder',o.playbook.concessionOrder);
    each(o.playbook.concessionOrder,'Playbook concession',(c,w)=>keys(w,c,KNOWN_KEYS.pbConcede));
    arr(pw,'pushback',o.playbook.pushback);
    each(o.playbook.pushback,'Playbook pushback',(p,w)=>{ keys(w,p,KNOWN_KEYS.pbPushback);
      date(w,'date',p.date); num(w,'round',p.round);
      enu(w,'outcome',p.outcome,'pushOutcome'); }); }

  if(obj(o.redline)){ keys('Redline',o.redline,KNOWN_KEYS.redline);
    arr('Redline','rounds',o.redline.rounds);
    each(o.redline.rounds,'Redline round',(r,w)=>{ keys(w,r,KNOWN_KEYS.redlineRnd);
      date(w,'date',r.date); num(w,'round',r.round); num(w,'comparedTo',r.comparedTo);
      enu(w,'from',r.from,'redlineFrom'); }); }

  term(o.current,'Current lease',false);
  if(!Array.isArray(o.proposals)) errors.push('proposals must be a list');
  else if(!o.proposals.length) warnings.push('The file contains no proposals — there is nothing to compare the current lease against.');
  else o.proposals.forEach((p,i)=>term(p,`Proposal ${i+1}${p&&p.label?' ('+p.label+')':''}`,true));

  return {errors:errors, warnings:warnings};
}
