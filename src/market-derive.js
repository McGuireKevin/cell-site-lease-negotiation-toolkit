/* =============================================================================
   MARKET RATES — validate a rate file, and derive the bands from it.

   THE FILE CARRIES INPUTS ONLY. Published low and high per metro, one baseline
   per equipment item, one multiplier per tier. Everything a user of the tool
   actually reads — recommended low, mid and high, the rooftop figure, the
   per-tier adder — is COMPUTED HERE.

   That is the whole point of the redesign. The spreadsheet this replaced stored
   inputs and outputs side by side: five of the six tier columns on every
   equipment row were the baseline times a multiplier, already unused by the
   tool, and free to disagree with the baseline they came from. A file cannot
   contradict itself about a number it does not contain.

   ONE IMPLEMENTATION. The bundled default and a user-supplied file go through
   this same function, so a rate file behaves identically however it arrived.

   No dependency, loaded as a classic script.
   ============================================================================= */

/* publishedLow and publishedHigh ride along at the end. The old bundle stored
   only the derived band and the derivation panel recovered the inputs by
   dividing back out of it — which worked, and is a fair summary of what was
   wrong with storing outputs instead of inputs. */
const MARKET_COLS = ['metro','tier','multiplier','groundLow','groundMid','groundHigh','rooftopMid','source',
                     'publishedLow','publishedHigh'];
const MARKET_BASIS = ['published','analogy','benchmark'];

/* ---- validation -----------------------------------------------------------
   Same split as the deal-file validator: an error stops the file loading, a
   warning loads and is reported. A band with low above high is not a style
   preference — it produces a confident number that is nonsense.            */
function validateMarket(m){
  const errors = [], warnings = [];
  const blank = v => v === '' || v === null || v === undefined;
  const numOk = v => !blank(v) && !isNaN(Number(v));

  if(!m || typeof m !== 'object'){ return {errors:['Not a market rate file.'], warnings:[]}; }

  if(blank(m.schemaVersion)) warnings.push('No schemaVersion. It will load; say which version it is.');
  if(blank(m.asOf)) errors.push('asOf is required. Market data ages, and a band with no date on it ' +
    'cannot be judged stale — which is how a figure from four years ago gets quoted as current.');
  else if(!/^\d{4}-\d{2}-\d{2}$/.test(String(m.asOf))) errors.push('asOf must be yyyy-mm-dd.');

  /* --- tiers --- */
  if(!Array.isArray(m.tiers) || !m.tiers.length) errors.push('tiers is required — at least one.');
  const tierIds = {};
  (m.tiers || []).forEach((t, i) => {
    const w = 'Tier ' + (i + 1) + (t && t.id ? ' (' + t.id + ')' : '');
    if(!t || blank(t.id)){ errors.push(w + ': id is required'); return; }
    if(tierIds[t.id]) errors.push(w + ': duplicate tier id "' + t.id + '"');
    tierIds[t.id] = t;
    if(!numOk(t.multiplier)) errors.push(w + ': multiplier must be a number');
    else if(Number(t.multiplier) <= 0) errors.push(w + ': multiplier is ' + t.multiplier + ' — must be above zero');
    else if(Number(t.multiplier) > 5) warnings.push(w + ': multiplier is ' + t.multiplier + ', which is unusually high.');
    if(!blank(t.rooftopPremium) && Number(t.rooftopPremium) < 1)
      warnings.push(w + ': rooftopPremium is below 1, meaning rooftop prices under ground. Unusual — confirm it is meant.');
  });

  /* --- derivation --- */
  const d = m.derivation || {};
  if(!numOk(d.lowFactor) || !numOk(d.highFactor) || !numOk(d.midPosition))
    errors.push('derivation needs lowFactor, highFactor and midPosition — the file states inputs, and these turn them into a band.');
  else {
    if(Number(d.midPosition) < 0 || Number(d.midPosition) > 1)
      errors.push('derivation.midPosition is ' + d.midPosition + ' — it is a position between low and high, so 0 to 1.');
    if(Number(d.lowFactor) <= 0 || Number(d.highFactor) <= 0)
      errors.push('derivation factors must be above zero.');
  }

  /* --- metros --- */
  if(!Array.isArray(m.metros) || !m.metros.length) errors.push('metros is required — at least one.');
  const seen = {};
  (m.metros || []).forEach((r, i) => {
    const w = 'Metro ' + (i + 1) + (r && r.metro ? ' (' + r.metro + ')' : '');
    if(!r || blank(r.metro)){ errors.push(w + ': metro name is required'); return; }
    if(seen[r.metro]) errors.push(w + ': "' + r.metro + '" appears twice — which row wins is then arbitrary.');
    seen[r.metro] = true;
    if(blank(r.tier) || !tierIds[r.tier]) errors.push(w + ': tier "' + r.tier + '" is not defined in tiers.');
    if(!numOk(r.publishedLow) || !numOk(r.publishedHigh)) errors.push(w + ': publishedLow and publishedHigh must be numbers.');
    else {
      if(Number(r.publishedLow) < 0 || Number(r.publishedHigh) < 0) errors.push(w + ': a rent cannot be negative.');
      if(Number(r.publishedLow) > Number(r.publishedHigh))
        errors.push(w + ': publishedLow (' + r.publishedLow + ') is above publishedHigh (' + r.publishedHigh +
          '). The band is inside out, and every figure derived from it will be wrong while looking reasonable.');
    }
    if(!blank(r.basis) && MARKET_BASIS.indexOf(r.basis) < 0)
      errors.push(w + ': basis is "' + r.basis + '" — expected one of ' + MARKET_BASIS.join(', '));
  });

  /* --- adders and space --- */
  [['equipmentAdders','item'], ['spaceRates','spaceType']].forEach(([key, nameField]) => {
    if(m[key] !== undefined && !Array.isArray(m[key])) errors.push(key + ' must be a list.');
    (m[key] || []).forEach((e, i) => {
      const w = key + ' ' + (i + 1) + (e && e[nameField] ? ' (' + e[nameField] + ')' : '');
      if(!e || blank(e[nameField])){ errors.push(w + ': ' + nameField + ' is required'); return; }
      if(!numOk(e.baseline)) errors.push(w + ': baseline must be a number');
      else if(Number(e.baseline) < 0) errors.push(w + ': baseline is negative.');
    });
  });

  /* --- staleness --- */
  if(!blank(m.asOf) && /^\d{4}-\d{2}-\d{2}$/.test(String(m.asOf))){
    const months = marketAgeMonths(m.asOf);
    if(months > 18) warnings.push('This data is ' + Math.round(months) + ' months old (asOf ' + m.asOf +
      '). Market rents move; quoting a stale band is a wrong answer that looks like a right one.');
  }

  return {errors: errors, warnings: warnings};
}

function marketAgeMonths(asOf){
  const d = new Date(asOf + 'T00:00:00Z');
  if(isNaN(d)) return 0;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
}

/* ---- derivation -----------------------------------------------------------
   Published low and high are the data. The recommended band is a house
   position applied to it, and keeping that position in ONE place — three
   numbers in the file — is what lets a whole dataset be made more or less
   conservative without re-exporting forty rows.                            */
function deriveMarket(m){
  const d = m.derivation || {};
  const lowF = Number(d.lowFactor), highF = Number(d.highFactor), midP = Number(d.midPosition);
  const tiers = {};
  (m.tiers || []).forEach(t => tiers[t.id] = t);

  const round2 = n => Math.round(n * 100) / 100;

  const metros = (m.metros || []).map(r => {
    const t = tiers[r.tier] || {multiplier: 1, rooftopPremium: 1, label: r.tier};
    const low  = Number(r.publishedLow) * lowF;
    const high = Number(r.publishedHigh) * highF;
    const mid  = low + midP * (high - low);
    const prem = (t.rooftopPremium == null || t.rooftopPremium === '') ? 1 : Number(t.rooftopPremium);
    return [r.metro, t.label || r.tier, Number(t.multiplier),
            round2(low), round2(mid), round2(high), round2(mid * prem),
            r.basis === 'benchmark' ? 'Benchmark band'
              : r.basis === 'analogy' ? 'By analogy' : 'Published',
            Number(r.publishedLow), Number(r.publishedHigh)];
  });

  return {
    label: m.label || '',
    asOf: m.asOf || '',
    stance: m.stance || '',
    stanceNote: m.stanceNote || '',
    illustrative: m.illustrative === true,
    source: m.source || '',
    ageMonths: m.asOf ? marketAgeMonths(m.asOf) : null,
    derivation: {lowFactor: lowF, highFactor: highF, midPosition: midP},
    metroCols: MARKET_COLS.slice(),
    metros: metros,
    equipment: (m.equipmentAdders || []).map(e => ({
      category: e.category || '', item: e.item, baseline: Number(e.baseline),
      tierScaled: e.tierScaled !== false, note: e.note || ''
    })),
    space: (m.spaceRates || []).map(s => ({
      type: s.spaceType, unit: s.unit || '', baseline: Number(s.baseline),
      tierScaled: s.tierScaled !== false, note: s.note || ''
    })),
    thresholds: m.thresholds || {above: 1.25, below: 0.80}
  };
}

/* An adder at a given tier. `tierScaled:false` is the escape hatch for a row
   the multiplier does not suit — the CSV had one whose own note said the
   multiplier did not fit while its numbers applied it anyway. Stating it in
   the file makes that note enforceable instead of decorative. */
function marketAdderAt(item, multiplier){
  if(!item) return 0;
  return item.tierScaled === false ? Number(item.baseline)
                                   : Number(item.baseline) * Number(multiplier || 1);
}
