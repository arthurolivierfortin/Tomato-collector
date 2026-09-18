/** Lancement de ffmpeg et ffprobe. Isolé ici pour que tout le reste du montage reste testable. */
import { spawn } from 'node:child_process';

export interface RunResult {
  readonly code: number;
  readonly stderr: string;
}

function run(command: string, args: readonly string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { windowsHide: true });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.on('error', (e) => reject(new Error(`${command} introuvable dans le PATH (${e.message})`)));
    child.on('close', (code) => resolve({ code: code ?? -1, stderr: stdout + stderr }));
  });
}

export async function ffmpeg(args: readonly string[]): Promise<void> {
  const full = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args];
  const { code, stderr } = await run('ffmpeg', full);
  if (code !== 0) throw new Error(`ffmpeg a échoué (code ${code})\n  ffmpeg ${full.join(' ')}\n${stderr.trim()}`);
}

async function ffprobe(args: readonly string[]): Promise<string> {
  const { code, stderr } = await run('ffprobe', ['-v', 'error', ...args]);
  if (code !== 0) throw new Error(`ffprobe a échoué (code ${code})\n${stderr.trim()}`);
  return stderr.trim();
}

export interface VideoInfo {
  readonly width: number;
  readonly height: number;
  /** Cadence déclarée du conteneur, en images par seconde. */
  readonly fps: number;
  readonly durationS: number;
}

export async function probe(path: string): Promise<VideoInfo> {
  const out = await ffprobe([
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,avg_frame_rate:format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=0',
    path,
  ]);
  const read = (key: string): string => out.split('\n').find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1) ?? '';
  const [num, den] = read('avg_frame_rate').split('/');
  const fps = Number(den) > 0 ? Number(num) / Number(den) : 0;
  return { width: Number(read('width')), height: Number(read('height')), fps, durationS: Number(read('duration')) };
}

/**
 * Encodeur matériel NVIDIA si la machine en a un, sinon libx264. Le test est un vrai encodage :
 * `-encoders` liste `h264_nvenc` dès que ffmpeg est compilé avec, même quand le pilote NVIDIA est
 * trop vieux pour l'API nvenc de cette compilation — le montage échouerait alors au premier plan.
 */
export async function pickEncoder(): Promise<'h264_nvenc' | 'libx264'> {
  const { code } = await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-f', 'lavfi', '-i', 'color=c=black:s=128x128:d=0.1:r=30',
    '-c:v', 'h264_nvenc', '-frames:v', '1', '-f', 'null', '-',
  ]);
  return code === 0 ? 'h264_nvenc' : 'libx264';
}

export function encoderArgs(encoder: 'h264_nvenc' | 'libx264', fps: number): string[] {
  const common = ['-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(fps), '-an'];
  return encoder === 'h264_nvenc'
    ? ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '21', '-b:v', '0', ...common]
    : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', ...common];
}
