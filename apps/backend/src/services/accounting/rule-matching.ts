/**
 * Rule Matching Engine for Bank Transaction Categorization
 *
 * Matches transaction descriptions against CategorizationRule patterns
 * and returns the best matching TaxAccount for auto-categorization.
 */

import { PrismaClient, CategorizationRule, TaxAccount, MatchType } from '@prisma/client';

const prisma = new PrismaClient();

export interface MatchResult {
  matched: boolean;
  rule: CategorizationRule | null;
  taxAccount: TaxAccount | null;
  vendorId: string | null; // Optional vendor assignment
  confidence: number; // 0-100 based on match quality
}

export interface RuleWithAccount extends CategorizationRule {
  taxAccount: TaxAccount;
}

/**
 * Check if a description matches a rule pattern
 */
function matchesPattern(description: string, matchType: MatchType, matchValue: string): boolean {
  const normalizedDesc = description.toUpperCase().trim();
  const normalizedValue = matchValue.toUpperCase().trim();

  switch (matchType) {
    case 'CONTAINS':
      return normalizedDesc.includes(normalizedValue);

    case 'STARTS_WITH':
      return normalizedDesc.startsWith(normalizedValue);

    case 'EXACT':
      return normalizedDesc === normalizedValue;

    case 'REGEX':
      try {
        const regex = new RegExp(matchValue, 'i');
        return regex.test(description);
      } catch {
        // Invalid regex, treat as no match
        return false;
      }

    default:
      return false;
  }
}

/**
 * Calculate match confidence based on match type and pattern length
 * Higher confidence for more specific matches
 */
function calculateConfidence(matchType: MatchType, matchValue: string, _description: string): number {
  const baseConfidence: Record<MatchType, number> = {
    EXACT: 100,
    STARTS_WITH: 85,
    REGEX: 80,
    CONTAINS: 70,
  };

  let confidence = baseConfidence[matchType] || 50;

  // Bonus for longer match values (more specific patterns)
  const lengthBonus = Math.min(matchValue.length / 20, 0.15); // Up to 15% bonus
  confidence += confidence * lengthBonus;

  // Cap at 100
  return Math.min(Math.round(confidence), 100);
}

/**
 * Find the best matching rule for a transaction description
 *
 * @param companyId - The company to match rules for
 * @param description - The transaction description to match
 * @returns MatchResult with the best matching rule and tax account
 */
export async function findMatchingRule(
  companyId: string,
  description: string
): Promise<MatchResult> {
  // Get all enabled rules for this company, ordered by priority (highest first)
  const rules = await prisma.categorizationRule.findMany({
    where: {
      companyId,
      enabled: true,
    },
    include: {
      taxAccount: true,
    },
    orderBy: {
      priority: 'desc',
    },
  });

  // Find the first matching rule (already sorted by priority)
  for (const rule of rules) {
    if (matchesPattern(description, rule.matchType, rule.matchValue)) {
      const confidence = calculateConfidence(rule.matchType, rule.matchValue, description);

      // Update rule statistics
      await prisma.categorizationRule.update({
        where: { id: rule.id },
        data: {
          timesMatched: { increment: 1 },
          lastMatchedAt: new Date(),
        },
      });

      return {
        matched: true,
        rule,
        taxAccount: rule.taxAccount,
        vendorId: rule.vendorId || null,
        confidence,
      };
    }
  }

  // No match found
  return {
    matched: false,
    rule: null,
    taxAccount: null,
    vendorId: null,
    confidence: 0,
  };
}

/**
 * Categorize multiple transactions in batch
 * More efficient than calling findMatchingRule for each transaction
 */
export async function categorizeTransactions(
  companyId: string,
  descriptions: string[]
): Promise<Map<string, MatchResult>> {
  // Get all enabled rules once
  const rules = await prisma.categorizationRule.findMany({
    where: {
      companyId,
      enabled: true,
    },
    include: {
      taxAccount: true,
    },
    orderBy: {
      priority: 'desc',
    },
  });

  const results = new Map<string, MatchResult>();
  const ruleMatchCounts = new Map<string, number>();

  for (const description of descriptions) {
    let matched = false;

    for (const rule of rules) {
      if (matchesPattern(description, rule.matchType, rule.matchValue)) {
        const confidence = calculateConfidence(rule.matchType, rule.matchValue, description);

        results.set(description, {
          matched: true,
          rule,
          taxAccount: rule.taxAccount,
          vendorId: rule.vendorId || null,
          confidence,
        });

        // Track match counts for batch update
        ruleMatchCounts.set(rule.id, (ruleMatchCounts.get(rule.id) || 0) + 1);
        matched = true;
        break;
      }
    }

    if (!matched) {
      results.set(description, {
        matched: false,
        rule: null,
        taxAccount: null,
        vendorId: null,
        confidence: 0,
      });
    }
  }

  // Batch update rule statistics
  const now = new Date();
  const ruleIds = Array.from(ruleMatchCounts.keys());
  for (const ruleId of ruleIds) {
    const count = ruleMatchCounts.get(ruleId)!;
    await prisma.categorizationRule.update({
      where: { id: ruleId },
      data: {
        timesMatched: { increment: count },
        lastMatchedAt: now,
      },
    });
  }

  return results;
}

/**
 * Test a rule pattern against a description without updating statistics
 * Useful for rule preview/testing in UI
 */
export function testRuleMatch(
  description: string,
  matchType: MatchType,
  matchValue: string
): { matches: boolean; confidence: number } {
  const matches = matchesPattern(description, matchType, matchValue);
  const confidence = matches ? calculateConfidence(matchType, matchValue, description) : 0;

  return { matches, confidence };
}

/**
 * Find all rules that would match a given description
 * Useful for debugging or showing multiple potential categories
 */
export async function findAllMatchingRules(
  companyId: string,
  description: string
): Promise<Array<RuleWithAccount & { confidence: number }>> {
  const rules = await prisma.categorizationRule.findMany({
    where: {
      companyId,
      enabled: true,
    },
    include: {
      taxAccount: true,
    },
    orderBy: {
      priority: 'desc',
    },
  });

  const matchingRules: Array<RuleWithAccount & { confidence: number }> = [];

  for (const rule of rules) {
    if (matchesPattern(description, rule.matchType, rule.matchValue)) {
      const confidence = calculateConfidence(rule.matchType, rule.matchValue, description);
      matchingRules.push({ ...rule, confidence });
    }
  }

  return matchingRules;
}

/**
 * Suggest a new rule based on a manual categorization
 * Used when user categorizes a transaction and wants to create a rule
 */
export function suggestRule(
  description: string,
  _taxAccountId: string
): { matchType: MatchType; matchValue: string; suggestedName: string } {
  // Clean up description - remove common noise
  const cleaned = description
    .replace(/\d{2}\/\d{2}/g, '') // Remove dates like 12/25
    .replace(/\$[\d,.]+/g, '')    // Remove amounts
    .replace(/\s+/g, ' ')         // Normalize whitespace
    .trim();

  // Extract the most distinctive part (first 3-4 words usually identify vendor)
  const words = cleaned.split(' ').filter(w => w.length > 2);
  const keyWords = words.slice(0, Math.min(3, words.length));
  const matchValue = keyWords.join(' ').toUpperCase();

  // Generate a human-friendly name
  const suggestedName = keyWords
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return {
    matchType: 'CONTAINS' as MatchType,
    matchValue,
    suggestedName: suggestedName || 'New Rule',
  };
}

export default {
  findMatchingRule,
  categorizeTransactions,
  testRuleMatch,
  findAllMatchingRules,
  suggestRule,
};
