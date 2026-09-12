import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
from dataset import CaptchaDataset, load_samples, get_train_transform, get_val_transform, collate, decode, CHARSET, char2idx
import os
import argparse
import time

NUM_CLASSES = len(CHARSET) + 1

from model import CRNN

def decode_batch(preds_t, label_cat, lengths):
    correct = 0
    offset = 0
    idx2char = {v: k for k, v in char2idx.items()}
    for i, length in enumerate(lengths):
        pred_str = decode(preds_t[i].tolist())
        true_str = "".join(idx2char[l.item()] for l in label_cat[offset:offset+length])
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

samples = load_samples(args.caps)
print(f"Loaded {len(samples)} samples")

val_size = max(1, int(len(samples) * 0.15))
train_size = len(samples) - val_size
train_raw, val_raw = random_split(samples, [train_size, val_size], generator=torch.Generator().manual_seed(42))

train_ds = CaptchaDataset(list(train_raw), get_train_transform())
val_ds   = CaptchaDataset(list(val_raw),   get_val_transform())

train_loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True,  collate_fn=collate, num_workers=0)
val_loader   = DataLoader(val_ds,   batch_size=args.batch, shuffle=False, collate_fn=collate, num_workers=0)

model = CRNN().to(DEVICE)
ctc = nn.CTCLoss(blank=len(CHARSET), reduction="mean", zero_infinity=True)
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