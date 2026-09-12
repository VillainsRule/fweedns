import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split
from torchvision.models import efficientnet_b0, EfficientNet_B0_Weights
from dataset import CaptchaDataset, load_samples, get_train_transform, get_val_transform, collate, CHARSET
from model import CRNN
import os
import argparse
import time
from PIL import Image

CHARSET_WITH_BLANK = CHARSET + "_"
NUM_CLASSES = len(CHARSET_WITH_BLANK) + 1

char2idx_new = {c: i for i, c in enumerate(CHARSET_WITH_BLANK)}
idx2char_new = {i: c for c, i in char2idx_new.items()}

def encode_with_blank(label):
    return [char2idx_new[c] for c in label.upper()]

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

class CaptchaDatasetWithBlanks(CaptchaDataset):
    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        encoded = encode_with_blank(label)
        return img, torch.tensor(encoded, dtype=torch.long), len(encoded)

def decode_batch(preds_t, label_cat, lengths):
    correct = 0
    offset = 0
    for i, length in enumerate(lengths):
        pred_str = decode_with_blank(preds_t[i].tolist())
        true_str = "".join(idx2char_new[l.item()] for l in label_cat[offset:offset+length])
        true_str = true_str.replace('_', '')
        offset += length
        if pred_str == true_str:
            correct += 1
    return correct

parser = argparse.ArgumentParser()
parser.add_argument("--device", default=None)
parser.add_argument("--epochs", type=int, default=100)
parser.add_argument("--batch", type=int, default=16)
parser.add_argument("--caps", default="../caps")
args = parser.parse_args()

if args.device:
    DEVICE = torch.device(args.device)
elif torch.backends.mps.is_available():
    DEVICE = torch.device("mps")
else:
    DEVICE = torch.device("cpu")

print(f"Device: {DEVICE}")
print(f"Charset: {CHARSET_WITH_BLANK}")
print(f"NUM_CLASSES: {NUM_CLASSES}")

samples = load_samples(args.caps)
print(f"Loaded {len(samples)} samples")

val_size = max(1, int(len(samples) * 0.15))
train_size = len(samples) - val_size
train_raw, val_raw = random_split(samples, [train_size, val_size], generator=torch.Generator().manual_seed(42))

train_ds = CaptchaDatasetWithBlanks(list(train_raw), get_train_transform())
val_ds   = CaptchaDataset(list(val_raw),   get_val_transform())

train_loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True,  collate_fn=collate, num_workers=0)
val_loader   = DataLoader(val_ds,   batch_size=args.batch, shuffle=False, collate_fn=collate, num_workers=0)

model = CRNN().to(DEVICE)
ctc = nn.CTCLoss(blank=len(CHARSET_WITH_BLANK), reduction="mean", zero_infinity=True)
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

os.makedirs("checkpoints", exist_ok=True)
best_acc = 0.0

for epoch in range(1, args.epochs + 1):
    model.train()
    total_loss = 0
    for imgs, labels, lengths in train_loader:
        imgs, labels = imgs.to(DEVICE), labels.to(DEVICE)
        logits = model(imgs)
        log_probs = logits.permute(1, 0, 2).log_softmax(2)
        T = log_probs.shape[0]
        input_lengths = torch.full((imgs.size(0),), T, dtype=torch.long)
        loss = ctc(log_probs, labels, input_lengths, lengths)
        optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 5.0)
        optimizer.step()
        total_loss += loss.item()
    scheduler.step()

    if epoch % 5 == 0:
        model.eval()
        correct = total = 0
        with torch.no_grad():
            for imgs, labels, lengths in val_loader:
                imgs = imgs.to(DEVICE)
                logits = model(imgs)
                preds = logits.permute(1, 0, 2).log_softmax(2).argmax(2).permute(1, 0).cpu()
                correct += decode_batch(preds, labels, lengths)
                total += len(lengths)
        acc = correct / total if total else 0
        print(f"Epoch {epoch:3d} | loss {total_loss/len(train_loader):.4f} | val acc {acc:.3f} | {time.strftime('%H:%M:%S')}")
        if acc > best_acc:
            best_acc = acc
            torch.save(model.state_dict(), "checkpoints/best.pt")
            print(f"  → best saved ({best_acc:.3f})")