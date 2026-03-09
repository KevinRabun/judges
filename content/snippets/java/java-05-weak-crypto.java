import java.security.MessageDigest;

public class Hasher {
    public static String hashPassword(String pw) throws Exception {
        byte[] hash = MessageDigest.getInstance("MD5").digest(pw.getBytes());
        return javax.xml.bind.DatatypeConverter.printHexBinary(hash);
    }
}
