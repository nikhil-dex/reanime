import type { BodyPose, Expression, Face, Mouth } from "../types/project";

export interface ResolvedExpression {
  body: BodyPose;
  face: Face;
  mouth: Mouth;
}

const expressionMap: Record<Expression, ResolvedExpression> = {
  neutral: { body: "neutral", face: "normal", mouth: "neutral" },
  happy: { body: "neutral", face: "normal", mouth: "smile" },
  angry: { body: "neutral", face: "angry", mouth: "shout" },
  shocked: { body: "neutral", face: "wide", mouth: "open" },
  sad: { body: "neutral", face: "sad", mouth: "sad" },
  confused: { body: "neutral", face: "sad", mouth: "neutral" },
  dead_inside: { body: "neutral", face: "closed", mouth: "sad" },
};

export function resolveExpression(expression: Expression): ResolvedExpression {
  return expressionMap[expression];
}
