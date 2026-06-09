import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job, ConnectionOptions } from 'bullmq';

export interface SendJobData {
  userId: number;
  scheduledMessageId: number;
}

export type SendJobHandler = (data: SendJobData) => Promise<void>;

export const SEND_JOB = 'send_birthday_message';

/**
 * Per-user BullMQ queues (queue:user:{id}) — true queue isolation per the spec.
 * Each user gets a dedicated worker with concurrency 1 so their messages send
 * one at a time, which keeps randomized delays and rate limiting meaningful.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly connection: ConnectionOptions;
  private readonly queues = new Map<number, Queue>();
  private readonly workers = new Map<number, Worker>();
  private handler: SendJobHandler | null = null;

  constructor(config: ConfigService) {
    const url = new URL(config.get<string>('redisUrl')!);
    this.connection = {
      host: url.hostname,
      port: url.port ? Number(url.port) : 6379,
      password: url.password || undefined,
      username: url.username || undefined,
      maxRetriesPerRequest: null,
    };
  }

  setHandler(handler: SendJobHandler): void {
    this.handler = handler;
  }

  private name(userId: number): string {
    // BullMQ 5.x forbids ':' in queue names (it's the internal key separator).
    return `user-${userId}`;
  }

  getQueue(userId: number): Queue {
    let q = this.queues.get(userId);
    if (!q) {
      q = new Queue(this.name(userId), { connection: this.connection });
      this.queues.set(userId, q);
      this.ensureWorker(userId);
    }
    return q;
  }

  private ensureWorker(userId: number): void {
    if (this.workers.has(userId)) return;
    const worker = new Worker(
      this.name(userId),
      async (job: Job) => {
        if (job.name !== SEND_JOB) return;
        if (!this.handler) throw new Error('Send handler not registered yet');
        await this.handler(job.data as SendJobData);
      },
      { connection: this.connection, concurrency: 1 },
    );
    worker.on('failed', (job, err) =>
      this.logger.warn(`Job ${job?.id} failed: ${err?.message}`),
    );
    this.workers.set(userId, worker);
  }

  async enqueueSend(userId: number, scheduledMessageId: number, delayMs: number): Promise<string> {
    const q = this.getQueue(userId);
    const job = await q.add(
      SEND_JOB,
      { userId, scheduledMessageId } satisfies SendJobData,
      {
        delay: Math.max(0, delayMs),
        jobId: `sm-${scheduledMessageId}-${Date.now()}`,
        attempts: 1,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
    return job.id!;
  }

  async cancelJob(userId: number, jobId: string | null): Promise<void> {
    if (!jobId) return;
    try {
      const job = await this.getQueue(userId).getJob(jobId);
      if (job) await job.remove();
    } catch (e: any) {
      this.logger.warn(`cancelJob ${jobId}: ${e?.message}`);
    }
  }

  async pauseUser(userId: number): Promise<void> {
    await this.getQueue(userId).pause();
  }

  async resumeUser(userId: number): Promise<void> {
    await this.getQueue(userId).resume();
  }

  async isPaused(userId: number): Promise<boolean> {
    return this.getQueue(userId).isPaused();
  }

  async counts(userId: number) {
    return this.getQueue(userId).getJobCounts(
      'waiting',
      'delayed',
      'active',
      'completed',
      'failed',
      'paused',
    );
  }

  async onModuleDestroy(): Promise<void> {
    for (const w of this.workers.values()) await w.close();
    for (const q of this.queues.values()) await q.close();
  }
}
