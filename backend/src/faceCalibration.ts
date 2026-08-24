export type FaceEnrollment = {
  personId: string;
  embedding: Float32Array;
};

type ScoreSummary = {
  pairs: number;
  minimum: number;
  mean: number;
  maximum: number;
};

export type CalibrationResult = {
  ready: boolean;
  reason?: string;
  people: number;
  profiles: number;
  recommendedThreshold?: number;
  balancedAccuracy?: number;
  observedFalseAcceptRate?: number;
  observedFalseRejectRate?: number;
  genuine?: ScoreSummary;
  impostor?: ScoreSummary;
};

function cosine(left: Float32Array, right: Float32Array) {
  if (left.length !== right.length || !left.length) return Number.NaN;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftNorm * rightNorm);
  return denominator ? dot / denominator : Number.NaN;
}

function summarize(values: number[]): ScoreSummary {
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    pairs: values.length,
    minimum: Math.min(...values),
    mean: total / values.length,
    maximum: Math.max(...values),
  };
}

const rounded = (value: number) => Math.round(value * 10_000) / 10_000;

export function calibrateFaceThreshold(enrollments: FaceEnrollment[]): CalibrationResult {
  const people = new Set(enrollments.map((item) => item.personId)).size;
  const base = { people, profiles: enrollments.length };
  if (people < 2) return { ...base, ready: false, reason: 'Enroll at least two different people.' };
  const profileCounts = new Map<string, number>();
  for (const enrollment of enrollments) {
    profileCounts.set(enrollment.personId, (profileCounts.get(enrollment.personId) ?? 0) + 1);
  }
  const peopleWithRecommendedCoverage = [...profileCounts.values()].filter((count) => count >= 5).length;
  if (peopleWithRecommendedCoverage < 2) {
    return {
      ...base,
      ready: false,
      reason: 'Enroll five varied samples for at least two different people.',
    };
  }

  const genuine: number[] = [];
  const impostor: number[] = [];
  for (let left = 0; left < enrollments.length; left += 1) {
    const leftEnrollment = enrollments[left];
    if (!leftEnrollment) continue;
    for (let right = left + 1; right < enrollments.length; right += 1) {
      const rightEnrollment = enrollments[right];
      if (!rightEnrollment) continue;
      const score = cosine(leftEnrollment.embedding, rightEnrollment.embedding);
      if (!Number.isFinite(score)) continue;
      (leftEnrollment.personId === rightEnrollment.personId ? genuine : impostor).push(score);
    }
  }
  if (!genuine.length) return { ...base, ready: false, reason: 'Enroll at least two samples for one person.' };
  if (!impostor.length) return { ...base, ready: false, reason: 'Enroll samples for at least two different people.' };

  const candidates = [...new Set([...genuine, ...impostor].map((value) => Math.max(-1, Math.min(1, value))))]
    .sort((left, right) => left - right);
  let best = { threshold: 0.45, balancedAccuracy: -1, falseAcceptRate: 1, falseRejectRate: 1 };
  for (const threshold of candidates) {
    const falseAcceptRate = impostor.filter((score) => score >= threshold).length / impostor.length;
    const falseRejectRate = genuine.filter((score) => score < threshold).length / genuine.length;
    const balancedAccuracy = 1 - (falseAcceptRate + falseRejectRate) / 2;
    if (
      balancedAccuracy > best.balancedAccuracy
      || (balancedAccuracy === best.balancedAccuracy && falseAcceptRate < best.falseAcceptRate)
      || (balancedAccuracy === best.balancedAccuracy && falseAcceptRate === best.falseAcceptRate && threshold > best.threshold)
    ) {
      best = { threshold, balancedAccuracy, falseAcceptRate, falseRejectRate };
    }
  }

  return {
    ...base,
    ready: true,
    recommendedThreshold: rounded(best.threshold),
    balancedAccuracy: rounded(best.balancedAccuracy),
    observedFalseAcceptRate: rounded(best.falseAcceptRate),
    observedFalseRejectRate: rounded(best.falseRejectRate),
    genuine: Object.fromEntries(Object.entries(summarize(genuine)).map(([key, value]) => [key, typeof value === 'number' ? rounded(value) : value])) as ScoreSummary,
    impostor: Object.fromEntries(Object.entries(summarize(impostor)).map(([key, value]) => [key, typeof value === 'number' ? rounded(value) : value])) as ScoreSummary,
  };
}
