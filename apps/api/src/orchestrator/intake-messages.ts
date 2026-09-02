export interface IntakeMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  meta?: { questions: string[] } | { answers: string[] };
}

export function questionsMessage(questions: string[]): IntakeMessage {
  return {
    role: "assistant",
    content: questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
    createdAt: new Date().toISOString(),
    meta: { questions },
  };
}

export function userMessage(content: string, meta?: IntakeMessage["meta"]): IntakeMessage {
  return { role: "user", content, createdAt: new Date().toISOString(), meta };
}

/** Pairs the last asked questions with the client's answers into prompt text for the requirements stage. */
export function buildQaText(messages: IntakeMessage[]): string {
  const lastQuestions = [...messages].reverse().find((m) => m.meta && "questions" in m.meta);
  const lastAnswers = [...messages].reverse().find((m) => m.meta && "answers" in m.meta);

  const questions = lastQuestions && "questions" in (lastQuestions.meta ?? {}) ? (lastQuestions.meta as { questions: string[] }).questions : [];
  const answers = lastAnswers && "answers" in (lastAnswers.meta ?? {}) ? (lastAnswers.meta as { answers: string[] }).answers : [];

  return questions
    .map((q, i) => `${i + 1}. ${q}\nRespuesta: ${answers[i] ?? "(sin respuesta)"}`)
    .join("\n\n");
}
