import { EventEmitter } from 'node:events';

/**
 * In-memory fan-out for generation progress + bookkeeping of running jobs.
 * (Single-process by design. For several server instances, back this with Redis pub/sub.)
 */
class GenerationRunner {
  constructor() {
    this.jobs = new Map(); // generationId -> { emitter, events: [], done }
    this.active = new Map(); // generationId -> { controller, documentId, guestId }
  }

  /* ---- running-job registry (used for cancel / stale detection) ---- */

  register(generationId, { documentId, guestId }) {
    const id = String(generationId);
    const controller = new AbortController();
    this.active.set(id, { controller, documentId: String(documentId), guestId });
    return controller;
  }

  unregister(generationId) {
    this.active.delete(String(generationId));
  }

  isActive(generationId) {
    return this.active.has(String(generationId));
  }

  getSignal(generationId) {
    return this.active.get(String(generationId))?.controller.signal;
  }

  cancel(generationId, reason = 'cancelled') {
    const a = this.active.get(String(generationId));
    if (a) a.controller.abort(reason);
  }

  /** Stop other running generations of the same document+guest: only the newest view keeps spending quota. */
  cancelOthers(documentId, guestId, exceptId) {
    const cancelled = [];
    for (const [id, a] of this.active) {
      if (id !== String(exceptId) && a.documentId === String(documentId) && a.guestId === guestId) {
        a.controller.abort('superseded');
        cancelled.push(id);
      }
    }
    return cancelled;
  }

  /* ---- event stream ---- */

  reset(generationId) {
    this.jobs.delete(String(generationId));
  }

  getOrCreateJob(generationId) {
    const id = String(generationId);
    if (!this.jobs.has(id)) {
      const emitter = new EventEmitter();
      emitter.setMaxListeners(50);
      this.jobs.set(id, { emitter, events: [], done: false });
    }
    return this.jobs.get(id);
  }

  emitEvent(generationId, type, data) {
    const job = this.getOrCreateJob(generationId);
    const event = { type, data };
    job.events.push(event);
    job.emitter.emit('event', event);

    if (type === 'done' || type === 'error') {
      job.done = true;
      const t = setTimeout(() => {
        if (this.jobs.get(String(generationId)) === job) this.jobs.delete(String(generationId));
      }, 5 * 60 * 1000);
      t.unref?.();
    }
  }

  subscribe(generationId, onEvent) {
    const job = this.getOrCreateJob(generationId);
    for (const ev of job.events) onEvent(ev); // replay

    if (job.done) return () => {};
    job.emitter.on('event', onEvent);
    return () => job.emitter.off('event', onEvent);
  }
}

export const runner = new GenerationRunner();
