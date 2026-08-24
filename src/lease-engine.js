/* =============================================================================
   LEASE ENGINE — escalation, proration, payment periods, present value.

   THE single calculation engine. If you find yourself reimplementing a
   day-count or an escalation step anywhere else, that is a bug.

   Loaded as a CLASSIC script, deliberately:

       <script src="src/lease-engine.js"></script>

   Do NOT convert this to an ES module. `type="module"` is blocked over
   file://, and the whole toolkit is built around opening an HTML file
   straight from disk with no server and no build step. A classic script
   from a subdirectory does load over file:// — verified in Firefox 153,
   which is the strict case (since v68 it confines file:// reads to the
   document's own directory and below).

   Everything here is a global, matching how it was defined when this code
   lived inside the comparator. That is intentional: extracting it was a pure
   move, and introducing a namespace would have meant touching every call
   site for no behavioural gain.

   UNITS: every rate is MONTHLY. Percentages arrive as FRACTIONS (0.03, not
   3) — the /100 conversion happens once, in normEsc()/engineGlob() at the UI
   boundary. See docs/schema.md.
   ============================================================================= */

/* ==========================================================================
   DATE HELPERS (UTC throughout)
   ========================================================================== */
function pd(s){ if(s instanceof Date) return s; if(!s) return null;
  const p=String(s).trim().split('-').map(Number);
  if(p.length!==3||p.some(isNaN)) return null; return new Date(Date.UTC(p[0],p[1]-1,p[2])); }
function fd(d){ return d? d.toISOString().slice(0,10):''; }
function dim(d){ return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); }
function addMonths(d,n){ const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1));
  const last=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+1,0)).getUTCDate();
  return new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth(),Math.min(d.getUTCDate(),last))); }
function addDays(d,n){ return new Date(d.getTime()+n*86400000); }
function dayDiff(a,b){ return Math.round((b-a)/86400000); }
function days360(a,b){ let d1=a.getUTCDate(),d2=b.getUTCDate();
  const m1=a.getUTCMonth()+1,m2=b.getUTCMonth()+1,y1=a.getUTCFullYear(),y2=b.getUTCFullYear();
  if(d1===31)d1=30; if(d2===31&&d1>=30)d2=30;
  return (y2-y1)*360+(m2-m1)*30+(d2-d1); }
function nextMonthStart(d){ return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)); }
function maxD(a,b){return a>b?a:b} function minD(a,b){return a<b?a:b} function eqD(a,b){return a.getTime()===b.getTime()}

/* Number formatting lives here rather than with the other render helpers
   because buildRateEvents() builds human-readable escalator labels and needs
   it. Moved rather than duplicated — a second copy is a second source of
   truth. The UI still calls it; this file loads first, so it is defined by
   the time anything in the page runs. */
function fmt(n){ return n==null||isNaN(n)?'—':n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

/* ==========================================================================
   ENGINE — a scenario is an ordered list of REGIMES.
   The current lease is one regime. A proposal is two: the current lease's
   terms running to the proposal's effective date, then the proposal's terms.
   ========================================================================== */
function prorate(rate,s,e,conv){
  switch(conv){
    case 'thirty_360': return rate*(days360(s,e)/30);
    case 'actual_365': return rate*12*(dayDiff(s,e)/365);
    default: return rate*(dayDiff(s,e)/dim(s));
  }
}
/* Lease documents say "expires 31 Aug"; the engine wants an exclusive bound. */
function effEnd(termEnd){ const te=pd(termEnd); if(!te) return null; return addDays(te,1); }

function buildRateEvents(start,end,baseMonthly,escalators,glob,tag){
  const adj=[];
  (escalators||[]).forEach((e,ei)=>{
    if(!e||!e.type||e.type==='none') return;
    const cad=Number(e.cadenceMonths);
    if(e.cadenceMonths===''||e.cadenceMonths==null||isNaN(cad)||cad<0) return;
    const from=pd(e.appliesFrom)||start, to=pd(e.appliesTo)||end;
    const anchor=pd(e.firstAdjustment)||from;
    /* cadence 0 = a single one-time step on the first-adjustment date */
    if(cad===0){
      if(anchor>start && anchor<end && anchor>=from && anchor<=to) adj.push({date:anchor,esc:e,ei:ei});
      return;
    }
    let dt=anchor,g=0;
    while(dt<=to && dt<end && g++<2000){
      if(dt>start && dt>=from) adj.push({date:dt,esc:e,ei:ei});
      dt=addMonths(anchor,cad*g);
    }
  });
  adj.sort((a,b)=>a.date-b.date||a.ei-b.ei);
  const events=[{date:start,rate:baseMonthly,note:'Rent at '+fd(start),regime:tag}];
  let rate=baseMonthly; const anch={},cnt={};
  adj.forEach(a=>{
    const e=a.esc;
    if(anch[a.ei]===undefined){anch[a.ei]=rate;cnt[a.ei]=0;}
    const n=++cnt[a.ei];
    let r=Number(e.rate)||0,label='',assumed=false;
    if(e.type==='cpi'){
      r=Number(glob.assumedCpi)||0;
      if(e.floorPct!=null&&e.floorPct!=='') r=Math.max(r,Number(e.floorPct));
      if(e.capPct!=null&&e.capPct!=='') r=Math.min(r,Number(e.capPct));
      label='CPI '+(r*100).toFixed(2)+'%'; assumed=true;
    }
    if(e.type==='fixed_amount'){
      rate = e.compounding==='on_base' ? anch[a.ei]+r*n : rate+r;
      label=label||('+'+fmt(r)+'/mo');
    } else {
      rate = e.compounding==='on_base' ? anch[a.ei]*(1+r*n) : rate*(1+r);
      label=label||((r*100).toFixed(3)+'%');
    }
    events.push({date:a.date,rate:rate,escIndex:a.ei,assumed:assumed,regime:tag,
      note:'Esc '+(a.ei+1)+': '+label+' ('+(Number(e.cadenceMonths)===0?'one-time step'
        :(e.compounding==='on_base'?'simple on base':'compound on prior'))+')'});
  });
  const out=[]; events.forEach(ev=>{ if(out.length&&eqD(out[out.length-1].date,ev.date)) out[out.length-1]=ev; else out.push(ev); });
  return out;
}
function rateOn(ev,d){ let r=ev.length?ev[0].rate:0; for(const e of ev){ if(e.date<=d) r=e.rate; else break; } return r; }

/* ---- payment-cycle boundaries ----
   What happens when the payment day does not exist in a month — rent due the
   31st, in February?

     anchored  clamp only in the short month, then return to the nominal day.
               Jan 31 > Feb 28 > Mar 31 > Apr 30. THE DEFAULT.
     last_day  always the month's last day. A different clause: an anchor on
               the 28th tracks month ends rather than staying on the 28th.
     clamped   LEGACY. Once a short month clamps the day it never recovers:
               Jan 31 > Feb 28 > Mar 28 > Apr 28. Retained only so a file
               saved before this setting existed reproduces its old numbers.
               Not a lease convention.

   `clamped` was the original behaviour, and it was a bug rather than a
   choice: buildPeriods iterated `s = addMonths(s, cad)`, so each clamp fed
   the next step, while buildRateEvents anchored every step with
   `addMonths(anchor, cad*g)` and did not drift. Two functions in this file
   disagreed about what monthly recurrence means. Escalator steps therefore
   landed on dates the payment schedule had walked away from, and under a
   full-period basis a step could be deferred by an entire month.

   The other two rules compute each boundary from the anchor by index, so no
   clamp can ever feed the next one. */
function cycleBoundary(anchor,cad,k,rule){
  if(rule==='last_day'){
    /* day 0 of month m+1 is the last day of month m */
    return new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+cad*k+1,0));
  }
  return addMonths(anchor,cad*k);
}
function buildPeriods(start,end,cadence,anchorDate,paymentDayRule){
  const cad=Math.max(1,Math.round(Number(cadence)||1)), anchor=pd(anchorDate)||start, periods=[];
  const rule=paymentDayRule||'anchored';

  if(rule==='clamped'){
    /* Legacy path, preserved verbatim. Do not "clean this up" — its job is to
       reproduce pre-fix numbers exactly. */
    let s=anchor,g=0;
    if(s>start){ while(s>start&&g++<3000) s=addMonths(anchor,-cad*g); }
    else { while(g<3000&&addMonths(anchor,cad*(g+1))<=start) g++; s=addMonths(anchor,cad*g); }
    if(s<start){ const fb=addMonths(s,cad);
      if(fb>start){ periods.push({start:start,end:minD(fb,end),stub:true}); s=fb; } else s=fb; }
    let i=0;
    while(s<end&&i++<6000){ const e=addMonths(s,cad);
      periods.push({start:s,end:minD(e,end),stub:e>end}); s=e; }
  } else {
    /* Move to the last cycle boundary at or before `start`. The anchor is only
       a phase marker and may legitimately sit either side of the window, so
       step in whichever direction is needed.

       Both directions are walked. Walking only backwards left an anchor more
       than one cadence BEFORE `start` where it was, so whole periods were
       emitted outside the window and no stub was created at the window edge —
       the rent between `start` and the first boundary then belonged to a
       period whose pay date fell outside the window, and was silently dropped
       from the totals. */
    const at=k=>cycleBoundary(anchor,cad,k,rule);
    let k=0,g=0;
    if(at(0)>start){ while(at(k)>start&&g++<3000) k--; }
    else { while(g++<3000&&at(k+1)<=start) k++; }
    let s=at(k);
    if(s<start){ const fb=at(k+1); k++;
      if(fb>start){ periods.push({start:start,end:minD(fb,end),stub:true}); } s=fb; }
    let i=0;
    while(s<end&&i++<6000){ const e=at(k+1);
      periods.push({start:s,end:minD(e,end),stub:e>end}); k++; s=e; }
  }
  if(periods.length){ const f=periods[0];
    f.stub=f.stub||dayDiff(f.start,f.end)<dayDiff(f.start,addMonths(f.start,cad)); }
  return periods;
}
function buildSegments(p,ev,conv){
  const bps=new Set([p.start.getTime(),p.end.getTime()]);
  ev.forEach(e=>{ if(e.date>p.start&&e.date<p.end) bps.add(e.date.getTime()); });
  let m=nextMonthStart(p.start);
  while(m<p.end){ bps.add(m.getTime()); m=nextMonthStart(m); }
  const pts=[...bps].sort((a,b)=>a-b).map(t=>new Date(t)), segs=[];
  for(let i=0;i<pts.length-1;i++){
    const s=pts[i],e=pts[i+1],rate=rateOn(ev,s);
    segs.push({start:s,end:e,days:dayDiff(s,e),rate:rate,accrual:prorate(rate,s,e,conv)});
  }
  return segs;
}

/* ---- build the regime list for a scenario ----
   The baseline is "what happens if we do nothing". By default that means the
   current lease's terms CONTINUE past their stated expiry to the end of the
   comparison window, so the do-nothing case is measured over the same span as
   a proposal that extends the term. Without this, a proposal running twelve
   years longer than the lease looks catastrophically more expensive purely
   because it covers more time.

   THE CONTINUATION IS NOT ALL ONE THING. There are two different claims hiding
   inside it, and they deserve different confidence:

     up to finalTermEnd   the tenant HAS THE RIGHT to be there, by exercising
                          options the lease already grants. Continuing to here
                          is a decision, not a guess.
     beyond finalTermEnd  no contractual right exists at all. Continuing past
                          it assumes a renewal nobody has agreed to.

   Set `finalTermEnd` (last day if every remaining option is exercised, from the
   audit) and the baseline stops there, with the shortfall against the window
   reported rather than silently filled in. Leave it blank and the old behaviour
   stands: continue to the window end and flag the whole tail as assumed.

   Note what is deliberately NOT here: escalation is not derived from the option
   chain. Escalator rows remain the only place escalation is expressed. A lease
   that steps 10% at each five-year option is a cadenceMonths:60 escalator, and
   deriving the same steps from options[] would be a second source of truth for
   the most consequential number in the model.                                */
function buildRegimes(cur,prop,glob){
  const warn=[];
  /* The current lease is assumed to be in force at the window start, so the
     window start IS the baseline regime's start. Base rent is the rent payable
     on that date; no separate term-start entry is needed.                     */
  const cStart=pd(glob.windowStart), cEndOrig=effEnd(cur.termEnd);
  if(!cStart) return {regimes:[],warn:['Analysis window start is required.']};
  if(!cEndOrig) return {regimes:[],warn:['Current lease term end is required.']};
  const horizon = pd(glob.windowEnd) ? addDays(pd(glob.windowEnd),1) : cEndOrig;
  const continuing = glob.baselineMode!=='expire';

  /* How far the contractual right actually reaches, if the audit established it. */
  const optionEnd = effEnd(cur.finalTermEnd);
  if(optionEnd && optionEnd < cEndOrig)
    warn.push('Final term end ('+fd(addDays(optionEnd,-1))+') falls before the current term ends ('+
      fd(addDays(cEndOrig,-1))+'). One of the two dates is wrong — the final term end is the last day '+
      'with every remaining option exercised, so it cannot precede the current expiry.');

  let cEnd;
  if(!continuing) cEnd = cEndOrig;
  else if(optionEnd && optionEnd > cEndOrig) cEnd = maxD(cEndOrig, minD(optionEnd, horizon));
  else cEnd = maxD(cEndOrig, horizon);

  if(continuing && optionEnd && optionEnd > cEndOrig && horizon > optionEnd)
    warn.push('Options run out on '+fd(addDays(optionEnd,-1))+', before the window closes. '+
      'Beyond that date there is no contractual right to be on site, so nothing is modeled for the '+
      'remainder of the window — the baseline is understated against any proposal that covers it. '+
      'Either shorten the window to the last option, or treat the gap explicitly.');

  /* when terms continue, the escalator governing the tail of the lease
     continues with them — otherwise rent would silently go flat at expiry */
  let cEsc=cur.escalators||[];
  if(continuing && cEnd>cEndOrig && cEsc.length){
    const tos=cEsc.map(e=>+(pd(e.appliesTo)||cEndOrig));
    const mx=Math.max.apply(null,tos);
    cEsc=cEsc.map((e,i)=>tos[i]===mx?Object.assign({},e,{appliesTo:fd(cEnd)}):e);
  }
  const cBase = cur.rentBasis==='annual' ? Number(cur.baseRent)/12 : Number(cur.baseRent);
  const curRegime = (from,to)=>({label:'Current lease terms',kind:'interim',
    start:from,end:to,baseRate:cBase,rateAnchor:cStart,escalators:cEsc,
    cadenceMonths:cur.cadenceMonths,firstPaymentDate:cur.firstPaymentDate,paymentTiming:cur.paymentTiming,
    prorationBasis:cur.prorationBasis,prorationConvention:cur.prorationConvention,
    paymentDayRule:cur.paymentDayRule,
    oneTimePayments:cur.oneTimePayments});

  if(!prop) return {regimes:[curRegime(cStart,cEnd)],warn:warn,cEndOrig:cEndOrig,continuing:continuing};

  const eff=pd(prop.effectiveDate);
  if(!eff) return {regimes:[],warn:['Proposal effective date is required.']};
  const pEnd=effEnd(prop.termEnd);
  if(!pEnd) return {regimes:[],warn:['Proposal term end is required.']};

  const regimes=[];
  /* interim: current lease terms up to the effective date */
  const iEnd=minD(eff,cEnd);
  if(iEnd>cStart) regimes.push(curRegime(cStart,iEnd));
  if(eff>cEnd) warn.push('Effective date '+fd(eff)+' is after the current lease ends ('+fd(addDays(cEnd,-1))+') — no obligation is modeled in the gap.');

  /* rent at the effective date under the existing lease, for relative pricing */
  const iEvents=buildRateEvents(cStart,maxD(cEnd,addDays(eff,1)),cBase,cEsc,glob,'interim');
  const rateAtEff=rateOn(iEvents,eff);

  let newRate;
  switch(prop.rentMode){
    case 'pct_of_current':   newRate=rateAtEff*(Number(prop.rentValue)||0)/100; break;
    case 'delta_from_current': newRate=rateAtEff+(Number(prop.rentValue)||0); break;
    case 'unchanged':        newRate=rateAtEff; break;
    default:                 newRate=prop.rentBasis==='annual'?(Number(prop.rentValue)||0)/12:(Number(prop.rentValue)||0);
  }
  regimes.push({label:'Proposal terms',kind:'new',start:eff,end:pEnd,baseRate:newRate,rateAnchor:eff,
    escalators:prop.escalators,cadenceMonths:prop.cadenceMonths,firstPaymentDate:prop.firstPaymentDate||prop.effectiveDate,
    paymentTiming:prop.paymentTiming,prorationBasis:prop.prorationBasis,prorationConvention:prop.prorationConvention,
    paymentDayRule:prop.paymentDayRule,
    oneTimePayments:prop.oneTimePayments,rateAtEff:rateAtEff});
  return {regimes:regimes,warn:warn,rateAtEff:rateAtEff,cEndOrig:cEndOrig,continuing:continuing};
}

/* `out` is an optional object the caller passes to receive the reason a
   scenario could not be computed. buildRegimes knows exactly why it refused —
   "Current lease term end is required", "Proposal effective date is required" —
   and returning a bare null threw that away, so the one case where the user
   most needs the message was the case that produced none. A holdover site with
   no stated term end hits this and shows only blanks.

   Optional and additive because every existing caller tests `if(!result)`;
   returning a truthy object here would make a refusal render as 0.00. */
function computeScenario(cur,prop,glob,ov,out){
  const built=buildRegimes(cur,prop?Object.assign({},prop,ov||{}):null,glob);
  if(!built.regimes.length){
    if(out) out.refusal = built.warn.slice();
    return null;
  }
  if(out) out.refusal = null;
  const warn=built.warn.slice();
  const wStart=pd(glob.windowStart), wEnd=pd(glob.windowEnd);
  const pvRef=pd(glob.pvReferenceDate)||wStart;
  const dr=Number(glob.discountRate)||0;
  const rows=[],segRows=[],allEvents=[];

  built.regimes.forEach((rg,ri)=>{
    if(rg.end<=rg.start) return;
    const ev=buildRateEvents(rg.rateAnchor,rg.end,rg.baseRate,rg.escalators,glob,rg.kind);
    ev.forEach(e=>{ if(e.date>=rg.start||ri===0) allEvents.push(Object.assign({},e,{regimeIndex:ri,regimeLabel:rg.label,kind:rg.kind})); });
    const periods=buildPeriods(rg.start,rg.end,rg.cadenceMonths,rg.firstPaymentDate,rg.paymentDayRule);
    const cad=Number(rg.cadenceMonths)||1;
    periods.forEach((p,idx)=>{
      const segs=buildSegments(p,ev,rg.prorationConvention);
      segs.forEach(s=>segRows.push(Object.assign({regimeIndex:ri,regimeLabel:rg.label,kind:rg.kind,periodIndex:idx},s)));
      const accrued=segs.reduce((a,s)=>a+s.accrual,0);
      const rateAtPay=rateOn(ev, rg.paymentTiming==='arrears'?addDays(p.end,-1):p.start);
      const full=rateAtPay*cad;
      let amount,basisNote;
      switch(rg.prorationBasis){
        case 'full_period': amount=full; basisNote='Full period'; break;
        case 'prorated_start_only':
          if(idx===0&&p.stub){amount=accrued;basisNote='Prorated (first)';}
          else {amount=full;basisNote='Full period';} break;
        default: amount=accrued; basisNote=p.stub?'Prorated (stub)':'Prorated';
      }
      rows.push({regimeIndex:ri,regimeLabel:rg.label,kind:rg.kind,periodStart:p.start,periodEnd:p.end,stub:p.stub,
        payDate: rg.paymentTiming==='arrears'?p.end:p.start,
        rate:rateAtPay,accrued:accrued,amount:amount,basisNote:basisNote,days:dayDiff(p.start,p.end)});
    });
    (rg.oneTimePayments||[]).forEach(o=>{
      if(!o||!o.date||!o.amount) return;
      const d=pd(o.date); if(!d) return;
      if(ri>0 && d<rg.start) return;                    // belongs to the interim regime
      if(built.regimes.length>1 && ri===0 && d>=rg.end) return;
      rows.push({regimeIndex:ri,regimeLabel:rg.label,kind:rg.kind,periodStart:d,periodEnd:d,stub:false,
        payDate:d,rate:0,accrued:0,amount:(o.direction==='to_tenant'?-1:1)*Number(o.amount),
        basisNote:'One-time: '+(o.label||''),days:0,oneTime:true});
    });
  });
  rows.sort((a,b)=>a.payDate-b.payDate);

  let totalNominal=0,totalPV=0,interimNominal=0,interimPV=0,newNominal=0,newPV=0,clipN=0,clipAmt=0;
  let assumedNominal=0,assumedPV=0;
  const cEndOrig=built.cEndOrig;
  const annual={};
  rows.forEach(r=>{
    /* anything under current-lease terms after the stated expiry is the
       continuation assumption, not a contractual obligation */
    r.assumed = r.kind==='interim' && cEndOrig && r.payDate>=cEndOrig;
    r.inWindow = r.payDate>=wStart && r.payDate<=wEnd;
    r.discountFactor=Math.pow(1+dr,-(dayDiff(pvRef,r.payDate)/365));
    r.pv=r.amount*r.discountFactor;
    if(r.inWindow){
      totalNominal+=r.amount; totalPV+=r.pv;
      if(r.kind==='interim'){ interimNominal+=r.amount; interimPV+=r.pv; }
      else { newNominal+=r.amount; newPV+=r.pv; }
      if(r.assumed){ assumedNominal+=r.amount; assumedPV+=r.pv; }
      const y=r.payDate.getUTCFullYear();
      if(!annual[y]) annual[y]={year:y,nominal:0,pv:0,count:0,interimPV:0,newPV:0,assumedPV:0};
      annual[y].nominal+=r.amount; annual[y].pv+=r.pv; annual[y].count++;
      if(r.kind==='interim') annual[y].interimPV+=r.pv; else annual[y].newPV+=r.pv;
      if(r.assumed) annual[y].assumedPV+=r.pv;
    } else { clipN++; clipAmt+=r.amount; }
  });
  if(clipN) warn.push(clipN+' payment(s) totalling '+fmt(clipAmt)+' fall outside the analysis window and are excluded.');

  const last=built.regimes[built.regimes.length-1];
  if(last.end<wEnd) warn.push('Obligation ends '+fd(addDays(last.end,-1))+', before the window closes — nothing is modeled for the remainder of the window.');
  if(last.end>wEnd) warn.push('Obligation runs to '+fd(addDays(last.end,-1))+', past the window — later payments excluded.');

  const covStart=maxD(built.regimes[0].start,wStart), covEnd=minD(last.end,wEnd);
  const months=Math.max(1,dayDiff(covStart,covEnd)/30.4375);
  const mr=Math.pow(1+dr,1/12)-1;
  const effMonthly = mr>0 ? totalPV*mr/(1-Math.pow(1+mr,-months)) : totalPV/months;

  return {rows,segRows,events:allEvents,regimes:built.regimes,rateAtEff:built.rateAtEff,
    totalNominal,totalPV,interimNominal,interimPV,newNominal,newPV,effMonthly,
    assumedNominal,assumedPV,cEndOrig:cEndOrig,continuing:built.continuing,
    annual:Object.values(annual).sort((a,b)=>a.year-b.year),warnings:warn,
    paymentCount:rows.filter(r=>r.inWindow).length,
    usesAssumption:allEvents.some(e=>e.assumed), coverageEnd:last.end};
}
