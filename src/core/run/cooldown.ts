/** Перезарядка по номерам: например, тап-сквиш каждой клавиши не чаще раза в 0,3 с. */
export class CooldownMap {
  private readonly cooldownMs: number;
  private readonly lastUse = new Map<number, number>();

  constructor(cooldownMs: number) {
    this.cooldownMs = cooldownMs;
  }

  /** true и запоминает время, если перезарядка прошла; иначе false. */
  tryUse(id: number, nowMs: number): boolean {
    const last = this.lastUse.get(id);
    if (last !== undefined && nowMs - last < this.cooldownMs) return false;
    this.lastUse.set(id, nowMs);
    return true;
  }

  forget(id: number): void {
    this.lastUse.delete(id);
  }

  clear(): void {
    this.lastUse.clear();
  }
}
