export type Unsubscribe = () => void;

export class SubscriptionStore<TValue> {
  private readonly listeners = new Set<(value: TValue) => void>();

  emit(value: TValue) {
    for (const listener of this.listeners) {
      listener(value);
    }
  }

  subscribe(listener: (value: TValue) => void): Unsubscribe {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  clear() {
    this.listeners.clear();
  }
}
