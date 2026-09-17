import type { OverlayCommand } from './overlayTypes';
import { PALETTE } from './palette';

const FONT_FAMILY = 'ui-monospace, Consolas, "Courier New", monospace';
const HALO_WIDTH_PX = 4;

function assertNever(value: never): never {
  throw new Error(`unknown overlay command ${JSON.stringify(value)}`);
}

function strokeStyle(ctx: CanvasRenderingContext2D, color: string, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([]);
}

function drawOne(ctx: CanvasRenderingContext2D, c: OverlayCommand): void {
  switch (c.kind) {
    case 'line':
      strokeStyle(ctx, c.color, c.width);
      ctx.beginPath();
      ctx.moveTo(c.from[0], c.from[1]);
      ctx.lineTo(c.to[0], c.to[1]);
      ctx.stroke();
      return;
    case 'dashedLine':
      strokeStyle(ctx, c.color, c.width);
      ctx.setLineDash([c.dash[0], c.dash[1]]);
      ctx.beginPath();
      ctx.moveTo(c.from[0], c.from[1]);
      ctx.lineTo(c.to[0], c.to[1]);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    case 'circle':
      ctx.beginPath();
      ctx.arc(c.center[0], c.center[1], c.radiusPx, 0, Math.PI * 2);
      if (c.fill !== undefined) {
        ctx.fillStyle = c.fill;
        ctx.fill();
      }
      if (c.width > 0) {
        strokeStyle(ctx, c.color, c.width);
        ctx.stroke();
      }
      return;
    case 'cross': {
      const [x, y] = c.center;
      const s = c.sizePx / 2;
      strokeStyle(ctx, c.color, c.width);
      ctx.beginPath();
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x - s, y + s);
      ctx.lineTo(x + s, y - s);
      ctx.stroke();
      return;
    }
    case 'rect': {
      const w = c.to[0] - c.from[0];
      const h = c.to[1] - c.from[1];
      if (c.fill !== undefined) {
        ctx.fillStyle = c.fill;
        ctx.fillRect(c.from[0], c.from[1], w, h);
      }
      if (c.width > 0) {
        strokeStyle(ctx, c.color, c.width);
        ctx.strokeRect(c.from[0], c.from[1], w, h);
      }
      return;
    }
    case 'polygon': {
      strokeStyle(ctx, c.color, c.width);
      ctx.beginPath();
      c.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      return;
    }
    case 'text':
      ctx.font = `bold ${c.sizePx}px ${FONT_FAMILY}`;
      ctx.textAlign = c.align;
      ctx.textBaseline = 'alphabetic';
      if (c.halo) {
        ctx.lineWidth = HALO_WIDTH_PX;
        ctx.strokeStyle = PALETTE.halo;
        ctx.setLineDash([]);
        ctx.strokeText(c.text, c.at[0], c.at[1]);
      }
      ctx.fillStyle = c.color;
      ctx.fillText(c.text, c.at[0], c.at[1]);
      return;
    default:
      return assertNever(c);
  }
}

/** Exécute les commandes d'annotation sur un contexte 2D (traits arrondis, halo sombre sous chaque texte). */
export function drawCommands(ctx: CanvasRenderingContext2D, commands: readonly OverlayCommand[]): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const c of commands) drawOne(ctx, c);
  ctx.restore();
}
