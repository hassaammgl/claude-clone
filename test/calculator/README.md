# Simple Calculator (Python)

Basic calculator with support for:
- Addition (+)
- Subtraction (-)
- Multiplication (*)
- Division (/)
- Power (** or ^)
- Modulo (%)

## Usage

```bash
python3 main.py
```

Or run as:

```bash
bunx --npm python test/calculator/main.py
# OR if python3 is available in path
```

## Running with Bun (if you have it)

```bash
bunx --npm node --eval 'require("child_process").spawnSync("python3", ["test/calculator/main.py"])'
```

For now, just run `python3 main.py` from the directory.
