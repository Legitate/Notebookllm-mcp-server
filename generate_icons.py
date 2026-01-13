import os
import base64

# Simple 1x1 Red Pixel PNG Base64
RED_PIXEL_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

def create_icon(path):
    with open(path, "wb") as f:
        f.write(base64.b64decode(RED_PIXEL_B64))
    print(f"Created {path}")

base_dir = "/Users/vigneshdhanraj/Desktop/Altrosyn/notebook/chrome_extension/images"
if not os.path.exists(base_dir):
    os.makedirs(base_dir)

create_icon(os.path.join(base_dir, "icon16.png"))
create_icon(os.path.join(base_dir, "icon48.png"))
create_icon(os.path.join(base_dir, "icon128.png"))
