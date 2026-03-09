def read_file(name: str):
    with open(f"/data/{name}") as f:
        return eval(f.read())
