import java.io.*;

public class SessionStore {
    public static Object loadSession(byte[] data) throws Exception {
        return new ObjectInputStream(new ByteArrayInputStream(data)).readObject();
    }
}
