import { z } from 'zod';
import { CAMERA_IDS } from './world';

export const MAX_TOOL_CALLS_PER_EPISODE = 40;

export const CameraIdSchema = z.enum(CAMERA_IDS);
export const MoveModeSchema = z.enum(['relative', 'absolute']);

export const ToolSchemas = {
  get_status: z.object({}),
  get_views: z.object({
    cameras: z.array(CameraIdSchema).min(1).max(3).optional(),
  }),
  move_camera: z.object({
    camera: CameraIdSchema,
    dx: z.number().optional(),
    dy: z.number().optional(),
    dz: z.number().optional(),
    yaw: z.number().optional(),
    tilt: z.number().optional(),
    zoom: z.number().positive().optional(),
  }),
  move_scissors: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    mode: MoveModeSchema,
  }),
  rotate_scissors: z.object({
    yaw: z.number().optional(),
    pitch: z.number().optional(),
    roll: z.number().optional(),
    mode: MoveModeSchema,
  }),
  open_scissors: z.object({}),
  cut: z.object({}),
  move_basket: z.object({
    x: z.number(),
    y: z.number(),
    mode: MoveModeSchema,
  }),
  report: z.object({
    outcome: z.enum(['harvested', 'missed', 'aborted']),
    note: z.string().max(500),
  }),
} as const;

export type ToolName = keyof typeof ToolSchemas;
export const TOOL_NAMES = Object.keys(ToolSchemas) as ToolName[];
export type ToolInput<N extends ToolName> = z.infer<(typeof ToolSchemas)[N]>;

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  get_status:
    'Return the current system phase, the known tomatoes (id, state, position in cm), the scissors, basket and camera poses, the last event, and the reachable limits. Cheap; call it whenever you need numbers without images.',
  get_views:
    'Render the three agent cameras (top: X/Y axes, front: X/Z axes, side: Y/Z axes). Each image is an orthographic view: 1 cm is the same number of pixels everywhere, so the grid and scale bar apply to the tomato, the scissors and the basket alike. Overlays: cm grid with world axes, numbered tomato markers with XYZ in cm, the target stem as a cyan line, the scissors as a schematic (pivot, two blades, cut point cross, blade axis and blade normal) with its angles, the basket as a rectangle with its centre, and the predicted fall line. Also returns the same information as JSON. Pass `cameras` to render fewer views.',
  move_camera:
    'Slide a camera along its rails (dx, dy, dz in cm, relative), pivot it (yaw, tilt in degrees, relative, limited to ±25°) or change its zoom (multiplier, e.g. 1.5 = closer). Use it when a leaf hides the target or when you need a closer look. Returns the new pose and a refreshed view of that camera.',
  move_scissors:
    'Move the scissors cut point to (x, y, z) in cm, either relative to the current cut point or absolute in the world frame (X right, Y back, Z up, origin at the plant base). Refused with out_of_reach if beyond the arm reach, or with collision (and the blocking position) if the straight path crosses a tomato or the main stem. Leaves are pushed aside. Move in steps of about 5 cm when far and 1 cm when close, and check the views between steps.',
  rotate_scissors:
    'Rotate the scissors: yaw around world Z, pitch around the blade transverse axis, roll around the blade axis, in degrees, relative or absolute. The cut line must end up perpendicular to the target stem (check in the view where the stem lies in the image plane) and the cut point must sit on the stem (check in the two other views).',
  open_scissors:
    'Open the blades so the stem can enter between them. Call it before approaching the final centimetre.',
  cut:
    'Close the blades. Succeeds with stem_cut when the cut line is within 0.6 cm of the target stem and at more than 45° from it; the tomato then falls. Otherwise returns nothing_between_blades, leaf_cut, or misaligned with the measured distance in cm and angle in degrees so you can correct.',
  move_basket:
    'Move the basket centre to (x, y) in cm on its rail under the plant, relative or absolute. The basket is 20×20 cm. Place it so the predicted fall line of the target lands inside it before cutting.',
  report:
    'Close the episode with the outcome (harvested, missed or aborted) and a one-sentence note explaining what happened and what you would do differently. Always call it last.',
};
