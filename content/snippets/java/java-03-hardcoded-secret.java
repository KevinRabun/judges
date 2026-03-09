public class Config {
    private static final String DB_PASSWORD = "P@ssw0rd123!";

    public static String getConnectionString() {
        return "jdbc:mysql://db:3306/app?user=root&password=" + DB_PASSWORD;
    }
}
