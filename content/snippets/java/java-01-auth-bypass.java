public class AuthCheck {
    private static final String ADMIN_TOKEN = "AKIAIOSFODNN7EXAMPLE";

    public static boolean isAdmin(String token) {
        return ADMIN_TOKEN.equals(token);
    }
}
