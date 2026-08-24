/* =============================================================================
   FINAL REPORT — stage 8.

   The package that goes to leadership, finance, risk management and legal
   before signature: the market test, the financial case, and the accumulated
   risk assessment from redlining.

   TWO GATES, AND THEY ARE NOT THE SAME GATE.

     1. Can the report be PRODUCED?
        No, while any deviation is undecided. The report is allowed to carry
        known risk and is not allowed to carry unread risk. A rejected
        deviation is closed — someone looked and said no. An undecided one is
        a change nobody has read, and putting it in front of four reviewers as
        part of a finished package is how it gets ratified by silence.

     2. Can the contract go to SIGNATURE?
        No, until all four functions have signed off. That is a later state and
        a different question: the report is what goes TO them, so it must be
        producible before any of them has seen it.

   Conflating the two would mean either refusing to produce the report until it
   had already been reviewed, or treating an unreviewed contract as ready.

   Loaded as a classic script after lease-engine.js and redline-compare.js —
   openDeviations() lives in the latter, because the rule it encodes belongs to
   the deviation record rather than to this stage.
   ============================================================================= */

const FR_FUNCTIONS = ['leadership', 'finance', 'risk', 'legal'];

/* Which of the three inputs the package actually contains. `includes` in the
   deal file records what the reviewers were GIVEN, so this has to be derived
   from the data rather than asserted by whoever pressed the button. */
function frInputs(deal){
  const mb = deal.marketBenchmark || {};
  const hasMarket = !!(mb.indicatedMonthly !== '' && mb.indicatedMonthly != null) ||
                    !!(mb.flag && mb.flag !== '');
  const proposals = deal.proposals || [];
  const hasComparison = proposals.length > 0;
  const devs = deal.deviations || [];
  const rounds = ((deal.redline || {}).rounds) || [];
  /* A redline that ran and found nothing is a risk assessment. A deal that
     never reached redlining is not — and the difference matters, because an
     empty deviations list looks identical either way. */
  const hasRisk = devs.length > 0 || rounds.length > 0;

  return {
    marketTest: {present: hasMarket,
      detail: hasMarket ? ((mb.metro || 'market') + ' · ' + (mb.tier || 'tier not recorded'))
                        : 'No market test on file. The rent has not been tested against the band.'},
    comparison: {present: hasComparison,
      detail: hasComparison ? (proposals.length + ' scenario' + (proposals.length > 1 ? 's' : '') + ' priced')
                            : 'No priced scenario. There is no financial case to review.'},
    riskAssessment: {present: hasRisk,
      detail: hasRisk ? (devs.length + ' deviation' + (devs.length === 1 ? '' : 's') + ' across ' +
                         (rounds.length || 1) + ' round' + ((rounds.length || 1) === 1 ? '' : 's'))
                      : 'No redline record. Either the document was never exchanged, or the exchange was not tracked.'}
  };
}

/* The deviation record, shaped for a reader who was not in the negotiation. */
function frRisk(deal){
  const devs = (deal.deviations || []).slice();
  const open = devs.filter(d => d.accepted !== true && d.accepted !== false);
  const accepted = devs.filter(d => d.accepted === true);
  const rejected = devs.filter(d => d.accepted === false);
  /* What leadership is actually being asked to bless: the high-risk changes
     someone decided to live with. Rejected ones cost nothing to have found;
     these are the ones carried into the contract. */
  const acceptedHigh = accepted.filter(d => d.risk === 'high');
  const pricing = devs.filter(d => d.affectsPricing);

  const byRound = {};
  devs.forEach(d => { const r = d.round == null ? 0 : d.round; (byRound[r] = byRound[r] || []).push(d); });

  return {all: devs, open: open, accepted: accepted, rejected: rejected,
          acceptedHigh: acceptedHigh, pricing: pricing,
          byRound: byRound,
          rounds: Object.keys(byRound).map(Number).sort((a, b) => a - b)};
}

function frSignOff(deal){
  const fr = deal.finalReport || {};
  const reviewers = fr.reviewers || [];
  const have = {};
  reviewers.forEach(r => {
    if(!r || !r.function) return;
    /* Last entry wins: a function that returned the package and later approved
       it is approved. Order in the array is the order it happened. */
    have[r.function] = r;
  });
  const missing = FR_FUNCTIONS.filter(f => !have[f] || !have[f].outcome || have[f].outcome === 'pending');
  const returned = FR_FUNCTIONS.filter(f => have[f] && have[f].outcome === 'returned');
  return {have: have, missing: missing, returned: returned,
          complete: missing.length === 0 && returned.length === 0};
}

/* =============================================================================
   ASSESSMENT
   ============================================================================= */
function assessFinalReport(deal){
  const blocking = [], warnings = [];
  const inputs = frInputs(deal);
  const risk = frRisk(deal);
  const signOff = frSignOff(deal);

  /* --- gate 1: the report itself --- */
  if(risk.open.length){
    blocking.push(risk.open.length + ' deviation' + (risk.open.length === 1 ? ' has' : 's have') +
      ' not been decided. The final report may carry known risk; it may not carry unread risk. ' +
      'Accept or reject each one in the redline review first — rejecting is a decision, ignoring is not.');
  }

  /* --- the three inputs --- */
  ['marketTest', 'comparison', 'riskAssessment'].forEach(k => {
    if(!inputs[k].present) warnings.push(inputs[k].detail +
      ' The package will record this as not included, so the reviewers can see what they were not given.');
  });

  /* --- the cross-stage check that matters most ---
     A deviation that moved a priced figure makes the financial case stale. If
     nothing records the scenario being re-run after that round, the PV in this
     package describes a deal that is no longer on the table. */
  if(risk.pricing.length){
    const lastPricingRound = Math.max.apply(null, risk.pricing.map(d => Number(d.round) || 0));
    const history = deal.stageHistory || [];
    const repriced = history.some(h => h && h.stage === 'comparison' && h.date &&
                                       frRoundOf(deal, h.date) >= lastPricingRound);
    if(!repriced){
      warnings.push(risk.pricing.length + ' change' + (risk.pricing.length === 1 ? '' : 's') +
        ' moved a figure the comparator priced, most recently in round ' + lastPricingRound +
        ', and nothing in the stage history records the scenario being re-run afterwards. ' +
        'Check the financial case below still matches the document before it goes out — a PV that ' +
        'quietly describes a superseded deal is the one error nobody downstream can catch.');
    }
  }

  if(risk.acceptedHigh.length){
    warnings.push(risk.acceptedHigh.length + ' high-risk change' +
      (risk.acceptedHigh.length === 1 ? ' was' : 's were') + ' accepted. These are what the package ' +
      'is really asking the reviewers to approve; they are listed separately so they cannot be ' +
      'read past.');
  }

  /* --- gate 2: signature readiness, reported not enforced here --- */
  if(!signOff.complete && (deal.finalReport && (deal.finalReport.reviewers || []).length)){
    if(signOff.returned.length)
      warnings.push('Returned by: ' + signOff.returned.join(', ') + '. The package has to go back round.');
    if(signOff.missing.length)
      warnings.push('Not yet signed off: ' + signOff.missing.join(', ') +
        '. No contract reaches signature until all four have seen the same package.');
  }

  return {blocking: blocking, warnings: warnings, inputs: inputs, risk: risk, signOff: signOff,
          canProduce: blocking.length === 0,
          signatureReady: blocking.length === 0 && signOff.complete};
}

/* Which redline round a date falls in — used to decide whether a re-pricing
   happened after the round that moved a figure. Rounds carry dates; a stage
   entry dated after round N's date is treated as being at round N. */
function frRoundOf(deal, isoDate){
  const rounds = ((deal.redline || {}).rounds) || [];
  const d = pd(isoDate);
  if(!d) return -1;
  let at = 0;
  rounds.forEach(r => { const rd = pd(r.date); if(rd && rd <= d) at = Math.max(at, Number(r.round) || 0); });
  return at;
}

/* =============================================================================
   BUILD

   Refuses while anything is blocking, the same way assemble() does. The report
   object it returns is what gets written into deal.finalReport.
   ============================================================================= */
function buildFinalReport(deal, opts){
  const o = opts || {};
  const a = assessFinalReport(deal);
  if(a.blocking.length) return {ok: false, assessment: a};

  const record = {
    preparedOn: o.date || '',
    preparedBy: o.preparedBy || '',
    includes: {
      marketTest: a.inputs.marketTest.present,
      comparison: a.inputs.comparison.present,
      riskAssessment: a.inputs.riskAssessment.present
    },
    reviewers: ((deal.finalReport || {}).reviewers || []).slice(),
    openRisks: (o.openRisks || (deal.finalReport || {}).openRisks || []).slice()
  };

  return {ok: true, assessment: a, record: record};
}

/* Risks going to signature unresolved, seeded from the record so the reviewer
   is editing a draft rather than a blank box.

   Deliberately NOT the same as the accepted deviations: an accepted deviation
   is closed, and this is what is knowingly being carried. The overlap is the
   accepted HIGH-risk ones, which is why they seed it. */
function frSuggestedOpenRisks(deal){
  const risk = frRisk(deal);
  return risk.acceptedHigh.map(d =>
    (d.round != null ? 'Round ' + d.round + ': ' : '') + (d.summary || '(unsummarised change)') +
    (d.acceptedBy ? ' — accepted by ' + d.acceptedBy : ''));
}
