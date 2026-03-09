import java.io.*;

public class FileService {
    private static final String SECRET = "AKIAIOSFODNN7EXAMPLE";

    public static String readFile(String name) throws IOException {
        return new String(new FileInputStream("/data/" + name).readAllBytes());
    }
}
