import pickle, base64

def load_session(data: str):
    return pickle.loads(base64.b64decode(data))
