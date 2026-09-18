import { describe, expect, it } from 'vitest';
import { CANNY_HIGH, CANNY_LOW, CLAHE_CLIP_LIMIT, CLAHE_TILES, cannyClaheRgba, claheGrayRgba, edgesToWhiteRgba, grayToRgba, type CvApi, type CvMat } from './cannyClahe';
import { makeRgba } from './rgba';

interface FakeState {
  calls: string[];
  deleted: string[];
}

/** Faux OpenCV : enregistre les appels, Canny écrit un contour au pixel 5, Mat.delete est tracé. */
function fakeCv(state: FakeState, cannyThrows = false): CvApi {
  let counter = 0;
  class FakeMat implements CvMat {
    readonly name = `mat${counter++}`;
    data = new Uint8Array(0);
    rows = 0;
    cols = 0;
    delete(): void {
      state.deleted.push(this.name);
    }
  }
  return {
    Mat: FakeMat,
    Size: class {
      constructor(
        public width: number,
        public height: number,
      ) {}
    },
    CLAHE: class {
      constructor(clip: number, grid: { width: number; height: number }) {
        state.calls.push(`CLAHE(${clip},${grid.width}x${grid.height})`);
      }
      apply(src: CvMat, dst: CvMat): void {
        state.calls.push('apply');
        (dst as FakeMat).data = new Uint8Array(src.data);
      }
      delete(): void {
        state.deleted.push('clahe');
      }
    },
    COLOR_RGBA2GRAY: 11,
    matFromImageData: (img) => {
      const m = new FakeMat();
      m.data = new Uint8Array(img.data);
      m.rows = img.height;
      m.cols = img.width;
      state.calls.push('matFromImageData');
      return m;
    },
    cvtColor: (src, dst, code) => {
      state.calls.push(`cvtColor(${code})`);
      (dst as FakeMat).data = new Uint8Array(src.data.length / 4);
    },
    Canny: (image, edges, t1, t2, aperture, l2) => {
      state.calls.push(`Canny(${t1},${t2},${aperture},${l2})`);
      if (cannyThrows) throw new Error('boom');
      const out = new Uint8Array(image.data.length);
      out[5] = 255;
      (edges as FakeMat).data = out;
    },
  };
}

describe('edgesToWhiteRgba', () => {
  it('writes opaque white on edge pixels and transparent black elsewhere', () => {
    expect(Array.from(edgesToWhiteRgba(new Uint8Array([0, 255, 0]), 3))).toEqual([0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0]);
  });
});

describe('cannyClaheRgba', () => {
  it('runs gray → CLAHE(2, 8×8) → Canny(50, 150) and frees every Mat and the CLAHE', () => {
    const state: FakeState = { calls: [], deleted: [] };
    const out = cannyClaheRgba(fakeCv(state), makeRgba(4, 4, [10, 20, 30]));
    expect(state.calls).toEqual(['matFromImageData', `CLAHE(${CLAHE_CLIP_LIMIT},${CLAHE_TILES}x${CLAHE_TILES})`, 'cvtColor(11)', 'apply', `Canny(${CANNY_LOW},${CANNY_HIGH},3,false)`]);
    expect(out.length).toBe(4 * 4 * 4);
    expect(Array.from(out.subarray(5 * 4, 5 * 4 + 4))).toEqual([255, 255, 255, 255]);
    expect(Array.from(out.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    expect(state.deleted.sort()).toEqual(['clahe', 'mat0', 'mat1', 'mat2', 'mat3']);
  });

  it('still frees everything when Canny throws', () => {
    const state: FakeState = { calls: [], deleted: [] };
    expect(() => cannyClaheRgba(fakeCv(state, true), makeRgba(2, 2))).toThrow('boom');
    expect(state.deleted).toHaveLength(5);
  });
});

// Issue #36 : le mode pipeline montre le tampon intermédiaire réel, pas une reconstitution.
describe('grayToRgba et claheGrayRgba', () => {
  it('turns a gray plane into an opaque RGBA image', () => {
    expect(Array.from(grayToRgba(new Uint8Array([0, 128]), 2))).toEqual([0, 0, 0, 255, 128, 128, 128, 255]);
  });

  it('stops after CLAHE, without running Canny, and frees every Mat', () => {
    const state: FakeState = { calls: [], deleted: [] };
    const out = claheGrayRgba(fakeCv(state), makeRgba(4, 4, [10, 20, 30]));
    expect(state.calls).toEqual(['matFromImageData', `CLAHE(${CLAHE_CLIP_LIMIT},${CLAHE_TILES}x${CLAHE_TILES})`, 'cvtColor(11)', 'apply']);
    expect(out.length).toBe(4 * 4 * 4);
    expect(Array.from(out.subarray(0, 4))).toEqual([0, 0, 0, 255]);
    expect(state.deleted.sort()).toEqual(['clahe', 'mat0', 'mat1', 'mat2']);
  });
});
