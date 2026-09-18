"""Affine YOLOv8n sur les rendus de la simulation, puis exporte l'ONNX servi par la page (issue #36).

Part des poids Hugging Face ripe/unripe telecharges par `scripts/export-yolo.py`, entraine sur le jeu
`data/perception/train` (genere par `generate-dataset.ts`) et valide sur `data/perception/eval`.
Le modele obtenu remplace `packages/sim/public/models/tomato-ripe.onnx` seulement avec --install.

Usage :
    .venv/Scripts/python scripts/perception/finetune.py --epochs 40 --batch 8 [--install]
"""

import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "perception"
MODELS_DIR = ROOT / "packages" / "sim" / "public" / "models"
BASE_WEIGHTS = MODELS_DIR / "work" / "best.pt"
IMGSZ = 640
OPSET = 12


def write_yaml() -> Path:
    path = DATA_DIR / "tomato.yaml"
    path.write_text(
        f"path: {DATA_DIR.as_posix()}\ntrain: train/images\nval: eval/images\nnames:\n  0: unripe\n  1: ripe\n",
        encoding="utf-8",
    )
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--device", default=None, help="cpu, 0, ... (auto par defaut)")
    parser.add_argument("--name", default="tomato-ft")
    parser.add_argument("--install", action="store_true", help="remplace le .onnx servi par la page")
    args = parser.parse_args()

    if not BASE_WEIGHTS.exists():
        raise SystemExit(f"poids de depart absents : {BASE_WEIGHTS} (lancer d'abord scripts/export-yolo.py)")
    from ultralytics import YOLO  # import tardif : message pip plus clair

    data = write_yaml()
    model = YOLO(str(BASE_WEIGHTS))
    kwargs = {"data": str(data), "epochs": args.epochs, "imgsz": IMGSZ, "batch": args.batch, "project": str(DATA_DIR / "runs"), "name": args.name, "exist_ok": True}
    if args.device is not None:
        kwargs["device"] = args.device
    results = model.train(**kwargs)

    best = Path(results.save_dir) / "weights" / "best.pt"
    exported = Path(YOLO(str(best)).export(format="onnx", imgsz=IMGSZ, opset=OPSET))
    target = DATA_DIR / "runs" / args.name / "tomato-ripe.onnx"
    shutil.copyfile(exported, target)
    summary = {"weights": str(best), "onnx": str(target), "epochs": args.epochs, "batch": args.batch}
    if args.install:
        shutil.copyfile(exported, MODELS_DIR / "tomato-ripe.onnx")
        meta = json.loads((MODELS_DIR / "tomato-ripe.json").read_text(encoding="utf-8"))
        meta["finetuned"] = {"train": "data/perception/train", "epochs": args.epochs, "imgsz": IMGSZ}
        (MODELS_DIR / "tomato-ripe.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
        summary["installed"] = str(MODELS_DIR / "tomato-ripe.onnx")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
