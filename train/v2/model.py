import torch
import torch.nn as nn
from torchvision.models import efficientnet_b0, EfficientNet_B0_Weights
from dataset import CHARSET

NUM_CLASSES = len(CHARSET) + 1

class CRNN(nn.Module):
    def __init__(self):
        super().__init__()
        backbone = efficientnet_b0(weights=EfficientNet_B0_Weights.DEFAULT)
        self.cnn = nn.Sequential(*list(backbone.features.children())[:6])
        self.proj = nn.Conv2d(112, 256, 1)
        self.bilstm = nn.LSTM(256, 128, num_layers=2, bidirectional=True, batch_first=True, dropout=0.3)
        self.fc = nn.Linear(256, NUM_CLASSES)

    def forward(self, x):
        if x.shape[1] == 1:
            x = x.repeat(1, 3, 1, 1)
        x = self.cnn(x)
        x = self.proj(x)
        x = x.mean(dim=2).permute(0, 2, 1)
        x, _ = self.bilstm(x)
        return self.fc(x)