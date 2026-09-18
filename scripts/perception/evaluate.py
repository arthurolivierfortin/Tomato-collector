"""Evalue un detecteur de maturite sur le jeu rendu par `generate-dataset.ts` (issue #36).

Deux detecteurs comparables sur le meme jeu :
  --detector onnx  : le modele YOLOv8 exporte (packages/sim/public/models/tomato-ripe.onnx), via
                     onnxruntime, avec le meme pretraitement letterbox que `yoloDetector.ts`.
  --detector hsv   : le repli par seuillage, reimplemente a l'identique de `hsvDetector.ts`
                     (masque rouge HSV, ouverture 3x3, composantes connexes, aire minimale).

Metriques : precision / rappel / F1 par classe a IoU 0.5, et AP50 (aire sous la courbe P/R,
interpolation par tous les points) ; la decision de l'issue porte sur le rappel de `ripe`.

Usage :
    .venv/Scripts/python scripts/perception/evaluate.py --data data/perception/eval --detector onnx
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CLASS_NAMES = ["unripe", "ripe"]
IOU_MATCH = 0.5
YOLO_INPUT = 640
SCORE_MIN = 0.05
NMS_IOU = 0.45


def load_labels(path: Path, size: int) -> list[tuple[int, np.ndarray]]:
    out = []
    for line in path.read_text().strip().splitlines():
        cls, cx, cy, w, h = line.split()
        cx, cy, w, h = (float(v) * size for v in (cx, cy, w, h))
        out.append((int(cls), np.array([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2])))
    return out


def iou(a: np.ndarray, b: np.ndarray) -> float:
    x0, y0 = max(a[0], b[0]), max(a[1], b[1])
    x1, y1 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / (area_a + area_b - inter) if area_a + area_b - inter > 0 else 0.0


def nms(boxes: list[tuple[int, float, np.ndarray]]) -> list[tuple[int, float, np.ndarray]]:
    kept: list[tuple[int, float, np.ndarray]] = []
    for cls, score, box in sorted(boxes, key=lambda d: -d[1]):
        if all(not (k[0] == cls and iou(k[2], box) > NMS_IOU) for k in kept):
            kept.append((cls, score, box))
    return kept


def letterbox(img: Image.Image) -> tuple[np.ndarray, float, float, float]:
    scale = min(YOLO_INPUT / img.width, YOLO_INPUT / img.height)
    w, h = round(img.width * scale), round(img.height * scale)
    pad_x, pad_y = (YOLO_INPUT - w) / 2, (YOLO_INPUT - h) / 2
    canvas = Image.new("RGB", (YOLO_INPUT, YOLO_INPUT), (114, 114, 114))
    canvas.paste(img.resize((w, h), Image.BILINEAR), (int(pad_x), int(pad_y)))
    tensor = np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
    return tensor, scale, pad_x, pad_y


def detect_onnx(session, img: Image.Image) -> list[tuple[int, float, np.ndarray]]:
    tensor, scale, pad_x, pad_y = letterbox(img)
    output = session.run(None, {session.get_inputs()[0].name: tensor})[0][0]  # (4 + classes, 8400)
    raw = []
    for i in range(output.shape[1]):
        scores = output[4:, i]
        cls = int(np.argmax(scores))
        score = float(scores[cls])
        if score < SCORE_MIN:
            continue
        cx, cy, w, h = (float(v) for v in output[0:4, i])
        box = np.array([(cx - w / 2 - pad_x) / scale, (cy - h / 2 - pad_y) / scale, (cx + w / 2 - pad_x) / scale, (cy + h / 2 - pad_y) / scale])
        raw.append((cls, score, box))
    return nms(raw)


def detect_hsv(_session, img: Image.Image) -> list[tuple[int, float, np.ndarray]]:
    """Meme algorithme que `packages/sim/src/perception/hsvDetector.ts` (teinte OpenCV 0..180)."""
    from scipy import ndimage  # noqa: PLC0415

    rgb = np.asarray(img.convert("RGB"), dtype=np.float32)
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    delta = np.maximum(mx - mn, 1e-6)
    hue = np.select(
        [mx == rgb[:, :, 0], mx == rgb[:, :, 1]],
        [60 * (rgb[:, :, 1] - rgb[:, :, 2]) / delta, 120 + 60 * (rgb[:, :, 2] - rgb[:, :, 0]) / delta],
        240 + 60 * (rgb[:, :, 0] - rgb[:, :, 1]) / delta,
    )
    hue = np.round((hue % 360) / 2) % 180
    sat = np.where(mx == 0, 0, 255 * (mx - mn) / np.maximum(mx, 1e-6))
    mask = ((hue < 10) | (hue > 170)) & (sat > 100) & (mx > 80)
    mask = ndimage.binary_opening(mask, structure=np.ones((3, 3)))
    labels, _count = ndimage.label(mask)
    out = []
    for index, slices in enumerate(ndimage.find_objects(labels), start=1):
        area = int((labels[slices] == index).sum())
        if area < 80:
            continue
        ys, xs = slices
        w, h = xs.stop - xs.start, ys.stop - ys.start
        out.append((CLASS_NAMES.index("ripe"), min(1.0, area / (w * h)), np.array([xs.start, ys.start, xs.stop, ys.stop])))
    return out


def average_precision(hits: list[tuple[float, int]], positives: int) -> float:
    if positives == 0:
        return float("nan")
    tp = fp = 0
    points = []
    for _, hit in sorted(hits, key=lambda x: -x[0]):
        tp, fp = tp + hit, fp + (1 - hit)
        points.append((tp / positives, tp / (tp + fp)))
    area = 0.0
    previous_recall = 0.0
    # Interpolation par tous les points : on parcourt en sens inverse pour garder la precision maximale a droite.
    envelope = []
    running = 0.0
    for recall, precision in reversed(points):
        running = max(running, precision)
        envelope.append((recall, running))
    for recall, precision in reversed(envelope):
        area += (recall - previous_recall) * precision
        previous_recall = recall
    return area


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/perception/eval")
    parser.add_argument("--detector", choices=["onnx", "hsv"], default="onnx")
    parser.add_argument("--model", default="packages/sim/public/models/tomato-ripe.onnx")
    parser.add_argument("--conf", type=float, default=0.25, help="seuil de confiance pour precision/rappel")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    data = ROOT / args.data
    session = None
    if args.detector == "onnx":
        import onnxruntime  # noqa: PLC0415

        session = onnxruntime.InferenceSession(str(ROOT / args.model), providers=["CPUExecutionProvider"])
    detect = detect_onnx if args.detector == "onnx" else detect_hsv

    positives = [0, 0]
    hits: list[list[tuple[float, int]]] = [[], []]
    counted = [0, 0]
    tp = [0, 0]
    fp = [0, 0]
    images = sorted((data / "images").glob("*.png"))
    for path in images:
        img = Image.open(path).convert("RGB")
        truth = load_labels(data / "labels" / f"{path.stem}.txt", img.width)
        for cls, _ in truth:
            positives[cls] += 1
        predictions = sorted(detect(session, img), key=lambda d: -d[1])
        used: set[int] = set()
        for cls, score, box in predictions:
            best, best_index = 0.0, -1
            for index, (tcls, tbox) in enumerate(truth):
                if tcls != cls or index in used:
                    continue
                value = iou(box, tbox)
                if value > best:
                    best, best_index = value, index
            hit = int(best >= IOU_MATCH)
            if hit:
                used.add(best_index)
            hits[cls].append((score, hit))
            if score >= args.conf:
                counted[cls] += 1
                tp[cls] += hit
                fp[cls] += 1 - hit

    report = {"detector": args.detector, "images": len(images), "conf": args.conf, "classes": {}}
    for cls, name in enumerate(CLASS_NAMES):
        precision = tp[cls] / counted[cls] if counted[cls] else float("nan")
        recall = tp[cls] / positives[cls] if positives[cls] else float("nan")
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else float("nan")
        report["classes"][name] = {
            "truth": positives[cls],
            "predictions": counted[cls],
            "tp": tp[cls],
            "fp": fp[cls],
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "ap50": round(average_precision(hits[cls], positives[cls]), 4),
        }
    report["map50"] = round(float(np.nanmean([c["ap50"] for c in report["classes"].values()])), 4)
    text = json.dumps(report, indent=2, ensure_ascii=False)
    print(text)
    if args.out:
        (ROOT / args.out).write_text(text + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
