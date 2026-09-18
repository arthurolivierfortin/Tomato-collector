import { describe, expect, it } from 'vitest';
import { loadYoloDetector, type YoloWorkerLike } from './yoloDetector';
import { makeRgba } from './rgba';
import type { Detection } from './types';
import type { YoloFrame, YoloRequest, YoloResponse } from './yoloWorkerProtocol';

/** Faux worker : enregistre ce qu'on lui poste et laisse le test répondre à la main. */
class FakeWorker implements YoloWorkerLike {
  readonly posted: YoloRequest[] = [];
  readonly transfers: Transferable[][] = [];
  terminated = false;
  onmessage: ((event: MessageEvent<YoloResponse>) => void) | null = null;

  postMessage(message: YoloRequest, transfer: Transferable[] = []): void {
    this.posted.push(message);
    this.transfers.push(transfer);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(message: YoloResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<YoloResponse>);
  }

  /** Dernier identifiant de frame reçu. */
  lastFrameId(): number {
    const frames = this.posted.filter((m): m is YoloFrame => m.type === 'frame');
    return frames[frames.length - 1]?.id ?? 0;
  }
}

const RIPE: Detection = { bbox: [10, 20, 30, 30], score: 0.91, label: 'ripe' };

/** Lance le chargement puis laisse le worker répondre : `loadYoloDetector` attend son message d'init. */
async function load(worker: FakeWorker, answer: YoloResponse): Promise<Awaited<ReturnType<typeof loadYoloDetector>>> {
  const promise = loadYoloDetector('/m.onnx', '/m.json', () => worker);
  await Promise.resolve();
  worker.reply(answer);
  return promise;
}

describe('loadYoloDetector', () => {
  it('asks the worker to load the model and its classes, then hands back a detector', async () => {
    const worker = new FakeWorker();
    const detect = await load(worker, { type: 'ready' });
    expect(worker.posted[0]).toEqual({ type: 'init', modelUrl: '/m.onnx', metaUrl: '/m.json' });
    expect(detect).not.toBeNull();

    const pending = detect!(makeRgba(8, 8));
    const frame = worker.posted[1];
    expect(frame).toMatchObject({ type: 'frame', width: 8, height: 8 });
    // L'image part en transfert, pas en copie : 640×640×4 octets par tick.
    expect(worker.transfers[1]).toHaveLength(1);
    worker.reply({ type: 'result', id: worker.lastFrameId(), detections: [RIPE] });
    await expect(pending).resolves.toEqual([RIPE]);
  });

  it('gives up on HSV when the model is missing, and stops the worker', async () => {
    const worker = new FakeWorker();
    expect(await load(worker, { type: 'unavailable', reason: 'modèle absent' })).toBeNull();
    expect(worker.terminated).toBe(true);
  });

  it('gives up when the worker cannot even be created', async () => {
    expect(
      await loadYoloDetector('/m.onnx', '/m.json', () => {
        throw new Error('Worker interdit');
      }),
    ).toBeNull();
  });

  it('rejects the frame whose inference failed, without losing the next one', async () => {
    const worker = new FakeWorker();
    const detect = await load(worker, { type: 'ready' });
    const failing = detect!(makeRgba(4, 4));
    worker.reply({ type: 'failure', id: worker.lastFrameId(), reason: 'session absente' });
    await expect(failing).rejects.toThrow('session absente');

    const next = detect!(makeRgba(4, 4));
    worker.reply({ type: 'result', id: worker.lastFrameId(), detections: [] });
    await expect(next).resolves.toEqual([]);
  });

  it('ignores a reply whose identifier is unknown', async () => {
    const worker = new FakeWorker();
    const detect = await load(worker, { type: 'ready' });
    const pending = detect!(makeRgba(4, 4));
    worker.reply({ type: 'result', id: 999, detections: [RIPE] });
    worker.reply({ type: 'result', id: worker.lastFrameId(), detections: [] });
    await expect(pending).resolves.toEqual([]);
  });
});
