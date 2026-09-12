import torch
from torch.utils.data import Dataset
from torchvision import transforms
from PIL import Image
import os

CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
BLANK = len(CHARSET)
IMG_H = 64
IMG_W = 200

char2idx = {c: i for i, c in enumerate(CHARSET)}
idx2char = {i: c for c, i in char2idx.items()}

def encode(label):
    return [char2idx[c] for c in label.upper()]

def decode(indices):
    result = []
    prev = None
    for i in indices:
        if i == BLANK:
            prev = None
            continue
        if i != prev:
            result.append(idx2char[i])
        prev = i
    return "".join(result)

def get_train_transform():
    return transforms.Compose([
        transforms.Grayscale(),
        transforms.Resize((IMG_H, IMG_W)),
        transforms.RandomApply([transforms.ColorJitter(brightness=0.2, contrast=0.2)], p=0.3),
        transforms.ToTensor(),
        transforms.Normalize([0.5], [0.5]),
    ])

def get_val_transform():
    return transforms.Compose([
        transforms.Grayscale(),
        transforms.Resize((IMG_H, IMG_W)),
        transforms.ToTensor(),
        transforms.Normalize([0.5], [0.5]),
    ])

class CaptchaDataset(Dataset):
    def __init__(self, samples, transform=None):
        self.samples = samples
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        encoded = encode(label)
        return img, torch.tensor(encoded, dtype=torch.long), len(encoded)

def load_samples(caps_dir="../caps"):
    samples = []
    for fname in os.listdir(caps_dir):
        if not fname.lower().endswith(".png"):
            continue
        label = os.path.splitext(fname)[0].upper()
        if not all(c in CHARSET for c in label):
            continue
        samples.append((os.path.join(caps_dir, fname), label))
    return samples

def collate(batch):
    imgs, labels, lengths = zip(*batch)
    return torch.stack(imgs), torch.cat(labels), torch.tensor(lengths, dtype=torch.long)