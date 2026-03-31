import type { CodexExecOptions, CodexRunner } from "../../src/core/types.js";

export class FakeCodexRunner implements CodexRunner {
  private readonly execTextQueue: string[] = [];
  private readonly execJsonQueue: unknown[] = [];
  private readonly reviewJsonQueue: unknown[] = [];
  readonly execTextPrompts: string[] = [];
  readonly execJsonPrompts: string[] = [];
  readonly reviewJsonPrompts: string[] = [];

  pushExecText(value: string): void {
    this.execTextQueue.push(value);
  }

  pushExecJson<T>(value: T): void {
    this.execJsonQueue.push(value);
  }

  pushReviewJson<T>(value: T): void {
    this.reviewJsonQueue.push(value);
  }

  async execText(_prompt: string, _options: CodexExecOptions): Promise<string> {
    this.execTextPrompts.push(_prompt);
    if (this.execTextQueue.length === 0) {
      throw new Error("No fake execText response queued");
    }
    return this.execTextQueue.shift() as string;
  }

  async execJson<T>(
    _prompt: string,
    _schema: Record<string, unknown>,
    _options: CodexExecOptions
  ): Promise<T> {
    this.execJsonPrompts.push(_prompt);
    if (this.execJsonQueue.length === 0) {
      throw new Error("No fake execJson response queued");
    }
    return this.execJsonQueue.shift() as T;
  }

  async reviewJson<T>(
    _prompt: string,
    _schema: Record<string, unknown>,
    _options: { cwd: string; model?: string }
  ): Promise<T> {
    this.reviewJsonPrompts.push(_prompt);
    if (this.reviewJsonQueue.length === 0) {
      throw new Error("No fake reviewJson response queued");
    }
    return this.reviewJsonQueue.shift() as T;
  }
}
