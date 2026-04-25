import type {
  TaxRules,
  ScenarioInputs,
  TaxResult,
  BracketBreakdown,
  DeductionBreakdown,
  FilingStatus,
  Bracket,
} from '../types/taxRules';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyBrackets(income: number, brackets: Bracket[]): { total: number; breakdown: BracketBreakdown[] } {
  const sorted = [...brackets].sort((a, b) => a.floor - b.floor);
  let remaining = Math.max(0, income);
  let total = 0;
  const breakdown: BracketBreakdown[] = [];

  for (const b of sorted) {
    if (remaining <= 0) break;
    const top = b.ceiling ?? Infinity;
    const taxable = Math.min(remaining, top - b.floor);
    if (taxable <= 0) continue;
    const taxInBracket = taxable * b.rate;
    total += taxInBracket;
    breakdown.push({
      bracket: b.ceiling != null
        ? `$${b.floor.toLocaleString()} – $${b.ceiling.toLocaleString()}`
        : `$${b.floor.toLocaleString()}+`,
      rate: b.rate,
      income: taxable,
      tax: taxInBracket,
    });
    remaining -= taxable;
  }

  return { total, breakdown };
}

function marginalRate(income: number, brackets: Bracket[]): number {
  const sorted = [...brackets].sort((a, b) => a.floor - b.floor);
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (income > sorted[i].floor) return sorted[i].rate;
  }
  return sorted[0]?.rate ?? 0;
}

function getFilingStatus(scenario: ScenarioInputs): FilingStatus {
  const fs = scenario['filing_status'] as string;
  return (fs as FilingStatus) ?? 'single';
}

// ─── Main Interpreter ─────────────────────────────────────────────────────────

export function interpret(rules: TaxRules, scenario: ScenarioInputs): TaxResult {
  const fs = getFilingStatus(scenario);

  // ── Gross Income ───────────────────────────────────────────────────────────
  const wagesIncome        = Number(scenario['wages_income'] ?? 0);
  const bonus              = Number(scenario['bonus'] ?? 0);
  const investmentIncome   = Number(scenario['investment_income'] ?? 0);   // interest + non-qual divs
  const shortTermCapGains  = Number(scenario['short_term_capital_gains'] ?? 0);
  const businessIncome     = Number(scenario['business_income'] ?? 0);     // net Schedule C
  const capitalGains       = Number(scenario['capital_gains'] ?? 0);       // LTCG
  const qualifiedDividends = Number(scenario['qualified_dividends'] ?? 0); // preferential rate
  const rentalIncome       = Number(scenario['rental_income'] ?? 0);       // passive, ordinary rate

  // Ordinary income = all income taxed at regular brackets
  // Preferential income (LTCG + QD) taxed separately at 0/15/20%
  const grossIncome = wagesIncome + bonus + investmentIncome + shortTermCapGains
                    + businessIncome + capitalGains + qualifiedDividends + rentalIncome;

  // ── IRA Deduction ─────────────────────────────────────────────────────────
  const age = Number(scenario['age'] ?? 0);
  const hasWorkplacePlan = Boolean(scenario['has_workplace_plan'] ?? false);
  const iraContrib = Number(scenario['ira_contribution'] ?? 0);

  const iraRules = rules.federal.ira;
  const iraLimit = age >= 50 ? iraRules.limit_50_plus : iraRules.limit;
  let iraDeduction = Math.min(iraContrib, iraLimit);

  // Phase-out IRA deduction if covered by workplace plan
  if (hasWorkplacePlan && iraRules.phase_out[fs]) {
    const po = iraRules.phase_out[fs]!;
    if (grossIncome >= po.ceiling) {
      iraDeduction = 0;
    } else if (grossIncome > po.floor) {
      const phaseRange = po.ceiling - po.floor;
      const excess = grossIncome - po.floor;
      const reduceFraction = Math.min(1, excess / phaseRange);
      iraDeduction = Math.round(iraDeduction * (1 - reduceFraction) / 10) * 10;
    }
  }

  // ── MAGI ──────────────────────────────────────────────────────────────────
  const magi = grossIncome; // simplified: before IRA deduction

  // ── Standard Deduction + Senior Bonus ────────────────────────────────────
  const isOver65 = age >= 65;
  let standardDeduction = rules.federal.standard_deduction[fs] ?? 0;

  if (isOver65 && rules.federal.senior_bonus[fs]) {
    const sb = rules.federal.senior_bonus[fs]!;
    let bonus = sb.amount;
    if (magi > sb.phase_out_threshold) {
      bonus = Math.max(0, bonus - (magi - sb.phase_out_threshold) * sb.phase_out_rate);
    }
    standardDeduction += bonus;
  }

  // ── Itemized Deductions ───────────────────────────────────────────────────
  const stateLocalTax = Number(scenario['state_local_tax'] ?? 0);
  const mortgageInterest = Number(scenario['mortgage_interest'] ?? 0);
  const charitableContribs = Number(scenario['charitable_contributions'] ?? 0);

  // SALT cap + phase-out
  const saltRules = rules.federal.itemized_deductions.salt;
  const saltCap = saltRules.cap[fs] ?? Infinity;
  let saltAmount = Math.min(stateLocalTax, saltCap);
  if (saltRules.phase_out[fs]) {
    const po = saltRules.phase_out[fs]!;
    if (magi > po.threshold) {
      const excess = magi - po.threshold;
      saltAmount = Math.max(0, saltAmount - excess * po.rate);
    }
  }

  // Mortgage interest cap
  const miCap = rules.federal.itemized_deductions.mortgage_interest.cap;
  const miAmount = miCap != null ? Math.min(mortgageInterest, miCap) : mortgageInterest;

  // Charity cap
  const charityCap = rules.federal.itemized_deductions.charity.cap_pct_agi;
  const charityAmount = charityCap != null
    ? Math.min(charitableContribs, magi * charityCap)
    : charitableContribs;

  // IRA is above-the-line: always reduces AGI regardless of standard vs itemized
  const belowLineItemized = saltAmount + miAmount + charityAmount;
  const useItemized = belowLineItemized > standardDeduction;
  const belowLineDeduction = useItemized ? belowLineItemized : standardDeduction;
  const deductionAmount = iraDeduction + belowLineDeduction;
  const deductionType: 'standard' | 'itemized' = useItemized ? 'itemized' : 'standard';

  const deductionBreakdown: DeductionBreakdown = {
    salt: stateLocalTax,
    salt_cap_applied: saltAmount,
    mortgage_interest: miAmount,
    charity: charityAmount,
    ira: iraDeduction,
    total_itemized: belowLineItemized,
  };

  // ── Taxable Income ────────────────────────────────────────────────────────
  // Ordinary = wages + bonus + interest + STCG + business + rental (all taxed at regular brackets)
  // Preferential = LTCG + qualified dividends (taxed at 0/15/20%)
  const ordinaryBase = wagesIncome + bonus + investmentIncome + shortTermCapGains + businessIncome + rentalIncome;
  const ordinaryIncome = Math.max(0, ordinaryBase - deductionAmount);
  const preferentialIncome = capitalGains + qualifiedDividends;
  const taxableIncome = Math.max(0, grossIncome - deductionAmount);

  // ── Federal Ordinary Income Tax ───────────────────────────────────────────
  const fedBrackets = rules.federal.brackets[fs] ?? [];
  const { total: federalTax, breakdown: federalBracketBreakdown } = applyBrackets(ordinaryIncome, fedBrackets);

  // ── Capital Gains Tax ─────────────────────────────────────────────────────
  const cgBrackets = rules.federal.capital_gains[fs] ?? [];
  // Capital gains stack on top of ordinary income for bracket determination
  const cgBase = ordinaryIncome;
  let capitalGainsTax = 0;
  const capitalGainsBracketBreakdown: BracketBreakdown[] = [];

  if (preferentialIncome > 0 && cgBrackets.length > 0) {
    const sorted = [...cgBrackets].sort((a, b) => a.floor - b.floor);
    let cgRemaining = preferentialIncome;
    let cgBase2 = cgBase;

    for (const b of sorted) {
      if (cgRemaining <= 0) break;
      const top = b.ceiling ?? Infinity;
      if (cgBase2 >= top) continue;
      const available = top - Math.max(cgBase2, b.floor);
      const taxable = Math.min(cgRemaining, available);
      if (taxable <= 0) continue;
      const tax = taxable * b.rate;
      capitalGainsTax += tax;
      capitalGainsBracketBreakdown.push({
        bracket: b.ceiling != null
          ? `$${b.floor.toLocaleString()} – $${b.ceiling.toLocaleString()}`
          : `$${b.floor.toLocaleString()}+`,
        rate: b.rate,
        income: taxable,
        tax,
      });
      cgBase2 = Math.max(cgBase2, b.floor) + taxable;
      cgRemaining -= taxable;
    }
  }

  // ── Credits ────────────────────────────────────────────────────────────────
  const credits: Record<string, number> = {};
  const numChildren = Number(scenario['num_children'] ?? 0);
  if (numChildren > 0) {
    const ctc = rules.federal.credits.child_tax_credit;
    let ctcAmount = numChildren * ctc.amount_per_child;
    if (ctc.phase_out[fs]) {
      const po = ctc.phase_out[fs]!;
      if (magi > po.threshold) {
        const excess = magi - po.threshold;
        const reduction = Math.floor(excess / 1000) * po.rate_per_1000 * numChildren;
        ctcAmount = Math.max(0, ctcAmount - reduction);
      }
    }
    credits['child_tax_credit'] = Math.min(ctcAmount, federalTax + capitalGainsTax);
  }

  const totalCredits = Object.values(credits).reduce((a, b) => a + b, 0);
  const netFederalTax = Math.max(0, federalTax + capitalGainsTax - totalCredits);

  // ── Surtaxes ───────────────────────────────────────────────────────────────
  const surtaxes: Record<string, number> = {};
  const niitRules = rules.federal.surtaxes.niit;
  const niitThreshold = niitRules.threshold[fs] ?? Infinity;
  const netInvestmentIncome = investmentIncome + capitalGains + qualifiedDividends + rentalIncome;

  if (magi > niitThreshold && netInvestmentIncome > 0) {
    const niitBase = Math.min(netInvestmentIncome, magi - niitThreshold);
    surtaxes['niit'] = niitBase * niitRules.rate;
  }

  // ── AMT Warning ────────────────────────────────────────────────────────────
  const warnings: string[] = [];
  const amtTriggers = rules.federal.warnings.amt.trigger_if_any_present;
  const hasAmtTrigger = amtTriggers.some(id => {
    const val = scenario[id];
    return val === true || Number(val) > 0;
  });
  if (hasAmtTrigger) {
    warnings.push('AMT may apply — consult a tax professional.');
  }
  if (businessIncome > 0) {
    const seTax = Math.round(businessIncome * 0.9235 * 0.153);
    warnings.push(`SE tax on business income: ~$${seTax.toLocaleString()} (not included in totals above — add to your actual liability).`);
  }
  if (surtaxes['niit']) {
    warnings.push(`NIIT applies: $${Math.round(surtaxes['niit']).toLocaleString()} at ${(niitRules.rate * 100).toFixed(1)}%`);
  }

  // ── State Tax ──────────────────────────────────────────────────────────────
  const stateCode = (scenario['state'] as string) ?? 'none';
  let stateTax = 0;
  let subJurisdictionTax = 0;

  if (stateCode !== 'none' && rules.states[stateCode]) {
    const stateRules = rules.states[stateCode];

    if (stateRules.flat_rate != null) {
      stateTax = taxableIncome * stateRules.flat_rate;
    } else if (stateRules.brackets) {
      const sb = stateRules.brackets[fs] ?? stateRules.brackets['single'] ?? [];
      stateTax = applyBrackets(taxableIncome, sb).total;
    }

    // Sub-jurisdictions — matched by key against scenario.sub_jurisdiction
    if (stateRules.sub_jurisdictions) {
      const selectedSub = (scenario['sub_jurisdiction'] as string) ?? 'none';
      for (const [key, subJuris] of Object.entries(stateRules.sub_jurisdictions)) {
        if (selectedSub === key) {
          const subBrackets = subJuris.brackets[fs] ?? subJuris.brackets['single'] ?? [];
          subJurisdictionTax += applyBrackets(taxableIncome, subBrackets).total;
        }
      }
    }
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalSurtaxes = Object.values(surtaxes).reduce((a, b) => a + b, 0);
  const totalTax = netFederalTax + totalSurtaxes + stateTax + subJurisdictionTax;

  const effectiveFederalRate = grossIncome > 0 ? netFederalTax / grossIncome : 0;
  const effectiveTotalRate = grossIncome > 0 ? totalTax / grossIncome : 0;

  // Marginal rate: rate of next dollar of ordinary income
  const mr = fedBrackets.length > 0 ? marginalRate(ordinaryIncome, fedBrackets) : 0;

  // ── Withholding ───────────────────────────────────────────────────────────
  const federalWithheld = Number(scenario['federal_withheld'] ?? 0);
  const stateWithheld = Number(scenario['state_withheld'] ?? 0);
  // Federal "owed" includes ordinary tax + CG tax + NIIT (all go on 1040)
  const federalTotalLiability = netFederalTax + (surtaxes['niit'] ?? 0);
  const stateTotalLiability = stateTax + subJurisdictionTax;
  const federalOwed = federalTotalLiability - federalWithheld;
  const stateOwed = stateTotalLiability - stateWithheld;

  return {
    grossIncome,
    magi,
    taxableIncome,
    deductionType,
    deductionAmount,
    deductionBreakdown,
    federalTax: netFederalTax,
    federalBracketBreakdown,
    capitalGainsTax,
    capitalGainsBracketBreakdown,
    credits,
    surtaxes,
    warnings,
    stateTax,
    subJurisdictionTax,
    totalTax,
    effectiveFederalRate,
    effectiveTotalRate,
    marginalRate: mr,
    federalWithheld,
    stateWithheld,
    federalOwed,
    stateOwed,
  };
}

// ─── Optimization Suggestions ─────────────────────────────────────────────────

export interface Suggestion {
  text: string;
}

export function generateSuggestions(rules: TaxRules, scenario: ScenarioInputs, result: TaxResult): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const fs = getFilingStatus(scenario);

  // IRA headroom
  const age = Number(scenario['age'] ?? 0);
  const iraRules = rules.federal.ira;
  const iraLimit = age >= 50 ? iraRules.limit_50_plus : iraRules.limit;
  const iraContrib = Number(scenario['ira_contribution'] ?? 0);
  const iraHeadroom = iraLimit - iraContrib;
  if (iraHeadroom > 0 && result.marginalRate > 0) {
    const saving = Math.round(iraHeadroom * result.marginalRate);
    suggestions.push({
      text: `Maxing out your IRA (add $${iraHeadroom.toLocaleString()}) could save ~$${saving.toLocaleString()} in federal tax at your ${(result.marginalRate * 100).toFixed(0)}% marginal rate.`,
    });
  }

  // Itemization delta
  const bd = result.deductionBreakdown;
  const stdDed = rules.federal.standard_deduction[fs] ?? 0;
  if (result.deductionType === 'standard' && bd.total_itemized > 0) {
    const diff = stdDed - bd.total_itemized;
    if (diff > 0) {
      suggestions.push({
        text: `Itemizing would save $${Math.round(diff * result.marginalRate).toLocaleString()} if you increase deductible expenses by $${Math.round(diff).toLocaleString()}.`,
      });
    }
  } else if (result.deductionType === 'itemized') {
    const saving = Math.round((bd.total_itemized - stdDed) * result.marginalRate);
    suggestions.push({
      text: `Itemizing saves you $${saving.toLocaleString()} over the standard deduction of $${stdDed.toLocaleString()}.`,
    });
  }

  // Capital gains tier
  const cgBrackets = (rules.federal.capital_gains[fs] ?? []).sort((a, b) => a.floor - b.floor);
  const currentCgRate = result.capitalGainsBracketBreakdown[result.capitalGainsBracketBreakdown.length - 1]?.rate ?? 0;
  for (const b of cgBrackets) {
    if (b.rate > currentCgRate && b.floor > result.magi) {
      const headroom = b.floor - result.magi;
      suggestions.push({
        text: `You are $${Math.round(headroom).toLocaleString()} below the ${(b.rate * 100).toFixed(0)}% capital gains tier — consider harvesting gains up to that threshold.`,
      });
      break;
    }
  }

  // NIIT headroom
  const niitRules = rules.federal.surtaxes.niit;
  const niitThreshold = niitRules.threshold[fs] ?? Infinity;
  if (!result.surtaxes['niit'] && isFinite(niitThreshold)) {
    const headroom = niitThreshold - result.magi;
    if (headroom > 0) {
      suggestions.push({
        text: `Your MAGI is $${Math.round(headroom).toLocaleString()} below the NIIT threshold — you have that much investment income headroom before the ${(niitRules.rate * 100).toFixed(1)}% surtax applies.`,
      });
    }
  }

  return suggestions;
}
