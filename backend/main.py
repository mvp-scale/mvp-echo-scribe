import os
import logging
import uvicorn

try:
    import torch
except ImportError:
    torch = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

if os.environ.get("DEBUG", "0") == "1":
    logger.setLevel(logging.DEBUG)

from api import create_app
from config import get_config

config = get_config()
app = create_app()

if __name__ == "__main__":
    logger.info(f"Starting MVP-Echo Studio on {config.host}:{config.port}")
    if torch and torch.cuda.is_available():
        logger.info(f"CUDA: {torch.cuda.get_device_name(0)}")
    elif torch:
        logger.warning("CUDA not available")
    else:
        logger.info("PyTorch not installed (using ONNX Runtime for GPU)")

    uvicorn.run(app, host=config.host, port=config.port)
