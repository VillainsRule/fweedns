import torch
from model import CRNN

model = CRNN()
model.load_state_dict(torch.load("checkpoints/best.pt", weights_only=True))
model.eval()

dummy = torch.randn(1, 1, 64, 200)
torch.onnx.export(model, dummy, "../js/crnn.onnx",
    input_names=["input"], output_names=["output"],
    dynamic_axes={"input": {0: "batch"}, "output": {0: "seq", 1: "batch"}})