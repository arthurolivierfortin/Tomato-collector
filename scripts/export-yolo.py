"""Exporte le detecteur YOLOv8 ripe/unripe en ONNX pour onnxruntime-web (module M4, optionnel).

Source : best.pt du Space Hugging Face iamsuman/ripe-and-unripe-tomatoes-detection (licence MIT,
classes {0: 'unripe', 1: 'ripe'}, YOLOv8n, 3,0 M parametres). L'export Ultralytics ajoute ses
metadonnees (licence AGPL-3.0 pour le format exporte) : usage de demo uniquement.

Usage (une fois, Python >= 3.10, torch installe automatiquement par ultralytics) :
    pip install ultralytics onnx onnxslim
    python scripts/export-yolo.py

Sorties dans packages/sim/public/models/ :
    tomato-ripe.onnx  (~11,7 Mo, ignore par git)   entree images [1,3,640,640], sortie output0 [1,6,8400]
    tomato-ripe.json  (classes dans l'ordre des indices, imgsz, opset)
"""

import json
import shutil
import urllib.request
from pathlib import Path

SOURCE_URL = "https://huggingface.co/spaces/iamsuman/ripe-and-unripe-tomatoes-detection/resolve/main/best.pt"
ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "packages" / "sim" / "public" / "models"
WORK_DIR = MODELS_DIR / "work"
IMGSZ = 640
OPSET = 12


def main() -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    weights = WORK_DIR / "best.pt"
    if not weights.exists():
        print("telechargement", SOURCE_URL)
        urllib.request.urlretrieve(SOURCE_URL, weights)
    from ultralytics import YOLO  # import tardif : le message d'erreur pip est plus clair que l'ImportError

    model = YOLO(str(weights))
    names = [str(model.names[i]) for i in sorted(model.names)]
    exported = Path(model.export(format="onnx", imgsz=IMGSZ, opset=OPSET))
    target = MODELS_DIR / "tomato-ripe.onnx"
    shutil.copyfile(exported, target)
    meta = {"names": names, "imgsz": IMGSZ, "opset": OPSET, "source": SOURCE_URL}
    (MODELS_DIR / "tomato-ripe.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print("classes", names)
    print("ecrit", target, target.stat().st_size, "octets")


if __name__ == "__main__":
    main()
