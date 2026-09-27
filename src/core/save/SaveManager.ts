import type { RestoredSave } from './restore';
import type { Save } from './schema';

/** normal — обычное изменение; urgent — отправить в облако сразу (конец забега, покупка, пауза). */
export type SaveUrgency = 'normal' | 'urgent';

/** Куда пишутся сохранения. Реализует платформа: локальный кэш сразу, облако — по своим правилам. */
export interface SaveBackend {
  persist(save: Save, urgency: SaveUrgency): void;
  /** Немедленно отправить отложенные записи. */
  flush(): void;
}

type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

export class SaveManager {
  private current: Save;
  private readonly writable: boolean;
  private readonly backend: SaveBackend;

  constructor(restored: RestoredSave, backend: SaveBackend) {
    this.current = restored.save;
    this.writable = restored.writable;
    this.backend = backend;
  }

  get data(): DeepReadonly<Save> {
    return this.current;
  }

  /** Меняет сохранение и сразу записывает его (CLAUDE.md: сохраняем после каждого значимого действия). */
  update(change: (draft: Save) => void, urgency: SaveUrgency = 'normal'): void {
    // JSON-копия вместо structuredClone: его нет в iOS младше 15.4.
    const draft = JSON.parse(JSON.stringify(this.current)) as Save;
    change(draft);
    draft.rev = this.current.rev + 1;
    this.current = draft;
    if (this.writable) this.backend.persist(draft, urgency);
  }

  flush(): void {
    if (this.writable) this.backend.flush();
  }
}
