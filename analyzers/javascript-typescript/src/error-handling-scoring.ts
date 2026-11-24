import { firstMatch } from "./scoring-decision.js";
import { fraction, roundScore } from "./score-arithmetic.js";

export function errorHandlingDecision(total: number, unexplained: number, unknown: number, unresolvedUses: number) {
  if (![total, unexplained, unknown, unresolvedUses].every(value => Number.isSafeInteger(value) && value >= 0) || unexplained + unknown > total)
    throw new Error("Invalid handler population.");
  const assessed = total - unknown;
  if (!assessed) return undefined;
  const populationScore = roundScore(fraction(10n * BigInt(assessed - unexplained), BigInt(assessed)));
  const cap = unexplained ? 9 : 10;
  return firstMatch("javascript-typescript/errorHandling/assessed-dispositions-v3",
    { countingUnit: "distinctAssessedHandlerBody", totalHandlers: total, assessedHandlers: assessed, unexplainedSwallowing: unexplained,
      unknownHandlers: unknown, unresolvedCallbackUses: unresolvedUses, populationScore, cap,
      formula: "min(10 - 10 * unexplainedSwallowing / assessedHandlers, unexplainedSwallowing > 0 ? 9 : 10)", rounding: "half-up-one-decimal" },
    [{ id: "issueCap", condition: "unexplainedSwallowing > 0 and populationScore > 9", matched: unexplained > 0 && populationScore > 9,
      score: 9, categories: ["unexplainedSwallowing"] },
    { id: "population", condition: "otherwise", matched: true, score: populationScore, categories: ["unexplainedSwallowing"] }]);
}
