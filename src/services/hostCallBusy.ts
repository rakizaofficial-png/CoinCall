/** Module flag — host is currently inside an active private Call screen */
let busy = false;
const listeners = new Set<(v: boolean) => void>();

export function setHostCallBusy(next: boolean) {
  busy = next;
  listeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      /* ignore */
    }
  });
}

export function isHostCallBusy() {
  return busy;
}

export function subscribeHostCallBusy(fn: (v: boolean) => void) {
  listeners.add(fn);
  fn(busy);
  return () => {
    listeners.delete(fn);
  };
}
