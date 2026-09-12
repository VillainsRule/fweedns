import sys
import torch
from PIL import Image
from pathlib import Path
from dataset import get_val_transform, load_samples, CHARSET
from model import CRNN

CHARSET_WITH_BLANK = CHARSET + "_"

char2idx_new = {c: i for i, c in enumerate(CHARSET_WITH_BLANK)}
idx2char_new = {i: c for c, i in char2idx_new.items()}

def decode_with_blank(indices):
    result = []
    prev = None
    for i in indices:
        if i == len(CHARSET_WITH_BLANK):
            prev = None
            continue
        char = idx2char_new.get(i, '')
        if char == '_':
            prev = None
            continue
        if i != prev:
            result.append(char)
        prev = i
    return "".join(result)

DEVICE = (
    torch.device("mps") if torch.backends.mps.is_available()
    else torch.device("cpu")
)

def solve_batch(image_paths, checkpoint="checkpoints/best.pt"):
    model = CRNN().to(DEVICE)
    model.load_state_dict(torch.load(checkpoint, map_location=DEVICE, weights_only=True))
    model.eval()

    results = []
    transform = get_val_transform()

    with torch.no_grad():
        for path, expected_label in image_paths:
            try:
                img = Image.open(path).convert("RGB")
                img_t = transform(img).unsqueeze(0).to(DEVICE)
                logits = model(img_t)
                preds = logits.permute(1, 0, 2).log_softmax(2).argmax(2).squeeze(1).cpu().tolist()
                predicted = decode_with_blank(preds)
                results.append({
                    'path': path,
                    'filename': Path(path).name,
                    'expected': expected_label,
                    'predicted': predicted,
                    'correct': predicted == expected_label
                })
            except Exception as e:
                print(f"error processing {path}: {e}", file=sys.stderr)

    return results

if __name__ == "__main__":
    caps_dir = "../caps"
    if len(sys.argv) > 1:
        caps_dir = sys.argv[1]

    samples = load_samples(caps_dir)
    results = solve_batch(samples)

    correct = sum(1 for r in results if r['correct'])
    total = len(results)
    accuracy = correct / total * 100 if total > 0 else 0

    print(f"\naccuracy: {correct}/{total} ({accuracy:.2f}%)")
    print("\nwrong predictions:")
    
    wrong = [r for r in results if not r['correct']]
    wrong.sort(key=lambda r: r['filename'])
    
    for r in wrong:
        print(f"{r['filename']} | expected: {r['expected']} | got: {r['predicted']}")