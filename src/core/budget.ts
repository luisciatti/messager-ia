/**
 * Orçamento por mensagem do usuário: trava de segurança para um grupo
 * não sair gastando sem limite (loop entre agentes, contexto gigante...).
 */

export interface Budget {
  maxCalls: number;
  maxTokens: number;
}

/** 1:1 → resposta + eventual compactação do histórico. */
export const DIRECT_BUDGET: Budget = { maxCalls: 2, maxTokens: 6000 };
/** Grupo → moderador + 2-3 agentes + síntese. */
export const GROUP_BUDGET: Budget = { maxCalls: 5, maxTokens: 8000 };

export class BudgetExceededError extends Error {
  constructor(
    public readonly kind: "calls" | "tokens",
    public readonly budget: Budget,
  ) {
    super(
      kind === "calls"
        ? `Orçamento de chamadas atingido (${budget.maxCalls}).`
        : `Orçamento de tokens atingido (~${budget.maxTokens}).`,
    );
    this.name = "BudgetExceededError";
  }
}

export class BudgetTracker {
  private calls = 0;
  private tokens = 0;

  constructor(public readonly budget: Budget) {}

  get usedCalls(): number {
    return this.calls;
  }

  get usedTokens(): number {
    return this.tokens;
  }

  get remainingTokens(): number {
    return Math.max(0, this.budget.maxTokens - this.tokens);
  }

  /** Antes da chamada: só sabemos a entrada, então checamos ela. */
  assertCanCall(inTokens: number): void {
    if (this.calls + 1 > this.budget.maxCalls) {
      throw new BudgetExceededError("calls", this.budget);
    }
    if (this.tokens + inTokens > this.budget.maxTokens) {
      throw new BudgetExceededError("tokens", this.budget);
    }
  }

  record(inTokens: number, outTokens: number): void {
    this.calls++;
    this.tokens += inTokens + outTokens;
  }
}
