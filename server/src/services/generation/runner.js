import { EventEmitter } from 'node:events';

class GenerationRunner {
  constructor() {
    this.jobs = new Map(); // generationId -> { emitter, events: [], done: boolean }
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
      // Clean up memory after 5 minutes
      setTimeout(() => {
        this.jobs.delete(String(generationId));
      }, 5 * 60 * 1000);
    }
  }

  subscribe(generationId, onEvent) {
    const job = this.getOrCreateJob(generationId);
    // Replay existing events to the new subscriber
    for (const ev of job.events) {
      onEvent(ev);
    }

    if (job.done) {
      return () => {};
    }

    job.emitter.on('event', onEvent);
    return () => {
      job.emitter.off('event', onEvent);
    };
  }
}

export const runner = new GenerationRunner();

