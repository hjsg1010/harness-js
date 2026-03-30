import type { CodexExecOptions, CodexRunner } from "../../src/core/types.js";

export class FakeCodexRunner implements CodexRunner {
  private readonly execTextQueue: string[] = [];
  private readonly execJsonQueue: unknown[] = [];
  private readonly reviewJsonQueue: unknown[] = [];

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
    if (this.reviewJsonQueue.length === 0) {
      throw new Error("No fake reviewJson response queued");
    }
    return this.reviewJsonQueue.shift() as T;
  }
}
